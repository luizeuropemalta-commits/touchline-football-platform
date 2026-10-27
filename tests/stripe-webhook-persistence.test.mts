import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
type Row = Record<string, unknown>;
type Result = { data: Row | null; error: { code?: string; message: string } | null };
type Reply = { status: number; body: Row };
type Call = { stage: string; table: string; operation: string; filters: Row; payload?: Row; selection?: string };
const sensitive = "PRIVATE_DB_DETAIL customer@example.test";
const failure = (code = "XX000"): Result => ({ data: null, error: { code, message: sensitive } });
const invoice = (id = "in_fixture") => ({ id, customer: "cus_fixture", parent: null, number: "INV-1", status: "paid", currency: "eur", subtotal: 100, total: 100, amount_paid: 100, amount_due: 100, hosted_invoice_url: null, invoice_pdf: null, period_start: 100, period_end: 200, status_transitions: { paid_at: 150 } });
function harness(options: { configured?: boolean; invalidSignature?: boolean; type?: string; invoice?: Row } = {}) {
  const event = { id: "evt_fixture", type: options.type ?? "invoice.paid", livemode: false, data: { object: options.invoice ?? invoice() } };
  const calls: Call[] = [];
  const receipts = new Map<string, Row>();
  const invoices = new Map<string, Row>();
  const alerts: Row[] = [];
  const faults = new Map<string, Array<Result | Error>>();
  let signatures = 0;
  function inject(stage: string, ...results: Array<Result | Error>) { faults.set(stage, [...(faults.get(stage) ?? []), ...results]); }
  function query(table: string) {
    let operation = "select", payload: Row | undefined, selection: string | undefined;
    const filters: Row = {};
    const chain = {
      select(value: string) { selection = value; return chain; },
      eq(key: string, value: unknown) { filters[key] = value; return chain; },
      in(key: string, value: unknown) { filters[key] = value; return chain; },
      is(key: string, value: unknown) { filters[key] = value; return chain; },
      insert(value: Row) { operation = "insert"; payload = value; return chain; },
      upsert(value: Row) { operation = "upsert"; payload = value; return chain; },
      update(value: Row) { operation = "update"; payload = value; return chain; },
      maybeSingle() { return chain; },
      then(resolve: (result: Result) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve().then((): Result => {
          const stage = table === "stripe_webhook_events" ? (operation === "insert" ? "receiptWrite" : "receiptRead")
            : table === "billing_customers" ? "customerRead" : table === "billing_invoices" ? "invoiceWrite"
            : operation === "select" ? "alertRead" : operation === "insert" ? "alertWrite" : "alertUpdate";
          calls.push({ stage, table, operation, filters: { ...filters }, payload, selection });
          const injected = faults.get(stage)?.shift();
          if (injected instanceof Error) throw injected;
          if (injected) return injected;
          if (stage === "receiptRead") return { data: receipts.get(String(filters.stripe_event_id)) ?? null, error: null };
          if (stage === "customerRead") return { data: { user_id: "user_fixture" }, error: null };
          if (stage === "invoiceWrite") invoices.set(String(payload!.stripe_invoice_id), { ...payload! });
          if (stage === "receiptWrite") {
            if (receipts.has(String(payload!.stripe_event_id))) return failure("23505");
            receipts.set(String(payload!.stripe_event_id), { ...payload! });
          }
          if (stage === "alertRead") return { data: alerts.find(row => row.user_id === filters.user_id && row.type === filters.type && row.stripe_object_id === filters.stripe_object_id && row.resolved_at == null) ?? null, error: null };
          if (stage === "alertWrite") alerts.push({ id: `alert_${alerts.length}`, resolved_at: null, ...payload! });
          if (stage === "alertUpdate") {
            for (const row of alerts) if (row.user_id === filters.user_id && row.stripe_object_id === filters.stripe_object_id && (filters.type as string[]).includes(String(row.type)) && row.resolved_at == null) Object.assign(row, payload);
          }
          return { data: null, error: null };
        }).then(resolve, reject);
      },
    };
    return chain;
  }
  const mod = { exports: {} as { POST(request: Request): Promise<Reply> } };
  vm.runInNewContext(compiled, {
    module: mod, exports: mod.exports, Date,
    process: { env: { STRIPE_WEBHOOK_SECRET: options.configured === false ? undefined : "whsec_test_fixture_only" } },
    require(id: string) {
      if (id === "next/server") return { NextResponse: { json: (body: Row, init?: { status?: number }): Reply => ({ body, status: init?.status ?? 200 }) } };
      if (id === "@/lib/supabase/admin") return { createAdminClient: () => ({ from: query }) };
      if (id === "@/lib/stripe/client") return { getStripe: () => ({ webhooks: { constructEvent(raw: string, signature: string, secret: string) {
        signatures++;
        assert.equal(raw, "signed-fixture"); assert.equal(signature, "test-signature"); assert.equal(secret, "whsec_test_fixture_only");
        if (options.invalidSignature) throw new Error(sensitive);
        return event;
      } } }) };
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  const post = async () => JSON.parse(JSON.stringify(await mod.exports.POST(new Request("https://example.test/api/stripe/webhook", { method: "POST", body: "signed-fixture", headers: { "stripe-signature": "test-signature" } })))) as Reply;
  return { post, inject, calls, receipts, invoices, alerts, event, signatures: () => signatures };
}
const expectFailure = (reply: Reply) => {
  assert.equal(reply.status, 500);
  assert.deepEqual(reply.body, { error: "Webhook processing failed." });
  assert.doesNotMatch(JSON.stringify(reply), /PRIVATE_DB_DETAIL|customer@example|user_fixture|cus_fixture/);
};

test("signature/configuration rejection does not access persistence or expose internals", async () => {
  const unsigned = harness({ invalidSignature: true });
  assert.deepEqual(await unsigned.post(), { status: 400, body: { error: "Invalid signature." } });
  assert.equal(unsigned.calls.length, 0);
  const unavailable = harness({ configured: false });
  assert.equal((await unavailable.post()).status, 503);
  assert.equal(unavailable.calls.length, 0); assert.equal(unavailable.signatures(), 0);
});

test("read errors and transport rejection never bypass deduplication or customer mapping", async () => {
  for (const stage of ["receiptRead", "customerRead"]) for (const result of [failure(), new Error(sensitive)]) {
    const h = harness(); h.inject(stage, result);
    expectFailure(await h.post());
    assert.equal(h.receipts.size, 0); assert.equal(h.invoices.size, 0);
    assert.ok(h.calls.every(call => !["invoiceWrite", "receiptWrite"].includes(call.stage)));
  }
});

test("confirmed missing customer cannot acknowledge invoice as synchronized", async () => {
  const missing = harness(); missing.inject("customerRead", { data: null, error: null });
  expectFailure(await missing.post()); assert.equal(missing.receipts.size, 0);
  const noCustomer = harness({ invoice: { ...invoice(), customer: null } });
  expectFailure(await noCustomer.post()); assert.equal(noCustomer.receipts.size, 0);
});

test("each write/read failure prevents completion receipt and can recover on a later delivery", async () => {
  for (const [stage, type] of [["invoiceWrite", "invoice.paid"], ["alertUpdate", "invoice.paid"], ["alertRead", "invoice.payment_failed"], ["alertWrite", "invoice.payment_failed"], ["receiptWrite", "invoice.payment_failed"]]) {
    for (const result of [failure(), new Error(sensitive)]) {
      const h = harness({ type }); h.inject(stage, result);
      expectFailure(await h.post()); assert.equal(h.receipts.size, 0);
      const failedCalls = h.calls.length;
      assert.deepEqual(await h.post(), { status: 200, body: { received: true } });
      assert.equal(h.receipts.size, 1); assert.equal(h.invoices.size, 1);
      assert.ok(h.calls.length > failedCalls);
      const completedCalls = h.calls.length;
      assert.deepEqual(await h.post(), { status: 200, body: { received: true, duplicate: true } });
      assert.equal(h.calls.length, completedCalls + 1, "confirmed replay only reads receipt");
      if (type === "invoice.payment_failed") assert.equal(h.alerts.length, 1, "sequential retries reuse existing alert");
    }
  }
});

test("paid invoice resolves only its own matching alerts", async () => {
  const h = harness();
  h.alerts.push(
    { id: "a", user_id: "user_fixture", type: "payment_failed", stripe_object_id: "in_fixture", resolved_at: null },
    { id: "b", user_id: "user_fixture", type: "payment_failed", stripe_object_id: "in_other", resolved_at: null },
    { id: "c", user_id: "different_user", type: "payment_failed", stripe_object_id: "in_fixture", resolved_at: null },
    { id: "d", user_id: "user_fixture", type: "trial_ending", stripe_object_id: "in_fixture", resolved_at: null },
  );
  assert.equal((await h.post()).status, 200);
  assert.equal(typeof h.alerts[0].resolved_at, "string");
  for (const alert of h.alerts.slice(1)) assert.equal(alert.resolved_at, null);
  const stages = h.calls.map(call => call.stage);
  assert.ok(stages.indexOf("receiptWrite") > stages.indexOf("alertUpdate"));
});

test("unique receipt conflict is duplicate only after an exact confirmed readback", async () => {
  const expected = { stripe_event_id: "evt_fixture", event_type: "invoice.paid", livemode: false };
  for (const result of [
    { data: null, error: null }, failure(), new Error(sensitive),
    { data: { ...expected, stripe_event_id: "other" }, error: null },
    { data: { ...expected, event_type: "other" }, error: null },
    { data: { ...expected, livemode: true }, error: null },
  ]) {
    const h = harness(); h.inject("receiptWrite", failure("23505")); h.inject("receiptRead", { data: null, error: null }, result);
    expectFailure(await h.post());
  }
  const confirmed = harness(); confirmed.inject("receiptWrite", failure("23505")); confirmed.inject("receiptRead", { data: null, error: null }, { data: expected, error: null });
  assert.deepEqual(await confirmed.post(), { status: 200, body: { received: true, duplicate: true } });
  assert.equal(confirmed.calls.at(-1)?.selection, "stripe_event_id,event_type,livemode");
});

test("unsupported event is audited without invoice fulfillment, and audit failure is not acknowledged", async () => {
  const h = harness({ type: "customer.created" }); h.inject("receiptWrite", failure());
  expectFailure(await h.post());
  assert.equal(h.invoices.size, 0); assert.equal(h.alerts.length, 0);
  assert.equal((await h.post()).status, 200);
  assert.equal(h.receipts.size, 1); assert.equal(h.invoices.size, 0);
});

test("mismatched initial receipt cannot claim replay", async () => {
  const h = harness(); h.inject("receiptRead", { data: { stripe_event_id: "other" }, error: null });
  expectFailure(await h.post()); assert.equal(h.invoices.size, 0);
});
