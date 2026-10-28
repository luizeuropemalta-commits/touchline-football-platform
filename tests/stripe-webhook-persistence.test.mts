import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

type Row = Record<string, unknown>;
type Reply = { status: number; body: Row };
const actor = "11111111-1111-4111-8111-111111111111";
const source = readFileSync(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const migration = readFileSync(new URL("../supabase/migrations/20261027120138_touchline_billing_atomic_reconciliation.sql", import.meta.url), "utf8");
const invoice = (id: string, paid = true) => ({ id, customer: "cus_fixture", livemode: false, parent: null, number: "INV-1", status: paid ? "paid" : "open", currency: "eur", subtotal: 100, total: 100, total_taxes: [] as Array<{amount:number}> | null, amount_paid: paid ? 100 : 0, amount_due: 100, amount_remaining: paid ? 0 : 100, hosted_invoice_url: null, invoice_pdf: null, period_start: 100, period_end: 200, status_transitions: { paid_at: paid ? 150 : null }, customer_email: "PRIVATE_CUSTOMER_NOT_RETAINED" });
const eventFor = (id: string, current: Row, type = "invoice.paid", created = 200) => ({ id, type, created, livemode: false, data: { object: current } });
const projection = (current: ReturnType<typeof invoice>) => ({ id: current.id, customer_id: current.customer, livemode: false, subscription_id: null, number: current.number, status: current.status, currency: current.currency, subtotal: 100, tax: 0, total: 100, amount_paid: current.amount_paid, amount_due: 100, amount_remaining: current.amount_remaining, hosted_invoice_url: null, invoice_pdf: null, period_start: new Date(100000).toISOString(), period_end: new Date(200000).toISOString(), paid_at: current.status_transitions.paid_at ? new Date(150000).toISOString() : null });
const identity = (id: string, current: ReturnType<typeof invoice>, type = "invoice.paid") => ({ id, type, created: 200, livemode: false, invoice_id: current.id, customer_id: current.customer, source_snapshot: projection(current) });

// One real local SQL database, no network, no installed/remote schema assumptions.
test("billing webhook reconciles current provider state under a fenced lease and commits effects atomically", { timeout: 60_000 }, async t => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid';
      create table public.users(id uuid primary key); create table public.organizations(id uuid primary key);
      create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to service_role;
      create function public.touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
      insert into public.users values('${actor}');`);
    await db.exec(readFileSync(new URL("../supabase/migrations/003_stripe_billing.sql", import.meta.url), "utf8"));
    await db.exec(migration);
    await db.query("insert into public.billing_customers(user_id,stripe_customer_id) values($1,'cus_fixture')", [actor]);
    const rpc = async (name: string, args: Row) => {
      const signatures: Record<string, [string, unknown[]]> = {
        touchline_billing_claim_event: ["$1::jsonb", [JSON.stringify(args.p_event)]],
        touchline_billing_finish_event: ["$1::text,$2::uuid,$3::jsonb", [args.p_event_id, args.p_token, JSON.stringify(args.p_invoice)]],
        touchline_billing_release_event: ["$1::text,$2::uuid", [args.p_event_id, args.p_token]],
      };
      assert.ok(Object.hasOwn(signatures, name));
      const [sql, values] = signatures[name];
      return db.transaction(async tx => {
        await tx.exec("set local role service_role");
        return (await tx.query<{ result: Row }>(`select public.${name}(${sql}) result`, values)).rows[0].result;
      });
    };
    const stored = async (id: string) => (await db.query<Row>("select * from public.billing_invoices where stripe_invoice_id=$1", [id])).rows[0];
    const alerts = async (id: string) => Number((await db.query<{ n: number }>("select count(*)::int n from public.billing_alerts where stripe_object_id=$1 and resolved_at is null", [id])).rows[0].n);
    const receipt = async (id: string) => (await db.query<Row>("select * from public.stripe_webhook_events where stripe_event_id=$1", [id])).rows[0];
    function harness(id: string, options: { configured?: boolean; invalidSignature?: boolean } = {}) {
      const control = { event: eventFor(`evt_${id}`, invoice(`in_${id}`)), current: invoice(`in_${id}`), reads: 0, rpcs: [] as string[], providerFailure: false, providerMissing: false, loseCommitReply: false, onRead: null as null | (() => Promise<void>) };
      const mod = { exports: {} as { POST(request: Request): Promise<Reply> } };
      vm.runInNewContext(compiled, {
        exports: mod.exports, Date, Set,
        process: { env: { STRIPE_WEBHOOK_SECRET: options.configured === false ? undefined : "fixture-signing-secret" } },
        require(name: string) {
          if (name === "next/server") return { NextResponse: { json: (body: Row, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) } };
          if (name === "@/lib/supabase/admin") return { createAdminClient: () => ({ rpc: async (name: string, args: Row) => {
            control.rpcs.push(name);
            try {
              const data = await rpc(name, args);
              if (name === "touchline_billing_finish_event" && control.loseCommitReply) { control.loseCommitReply = false; throw new Error("PRIVATE_RESPONSE_LOST"); }
              return { data, error: null };
            } catch (error) { return { data: null, error: { message: String(error) } }; }
          } }) };
          if (name === "@/lib/stripe/client") return { getStripe: () => ({ webhooks: { constructEvent(raw: string, signature: string, secret: string) {
            assert.equal(raw, "signed-fixture"); assert.equal(signature, "fixture-signature"); assert.equal(secret, "fixture-signing-secret");
            if (options.invalidSignature) throw new Error("PRIVATE_SIGNATURE_ERROR");
            return structuredClone(control.event);
          } }, invoices: { retrieve: async (id: string, params: Row, opts: Row) => {
            control.reads++; assert.equal(id, control.current.id); assert.equal(JSON.stringify(params), "{}"); assert.equal(opts.timeout, 10_000); assert.equal(opts.maxNetworkRetries, 0);
            if (control.onRead) await control.onRead();
            if (control.providerMissing) throw Object.assign(new Error("fixture missing"), { type: "StripeInvalidRequestError", code: "resource_missing", statusCode: 404 });
            if (control.providerFailure) throw new Error("PRIVATE_PROVIDER_URL_AND_KEY");
            return structuredClone(control.current);
          } } }) };
          throw new Error(`Unexpected dependency ${name}`);
        },
      });
      return { control, post: async () => JSON.parse(JSON.stringify(await mod.exports.POST(new Request("https://fixture.invalid/api/stripe/webhook", { method: "POST", body: "signed-fixture", headers: { "stripe-signature": "fixture-signature" } })))) as Reply };
    }

    await t.test("signature/config rejection precedes claims and provider reads", async () => {
      for (const options of [{ configured: false }, { invalidSignature: true }]) {
        const h = harness("reject", options); const r = await h.post(); assert.equal(r.status, options.configured === false ? 503 : 400);
        assert.equal(h.control.reads, 0); assert.deepEqual(h.control.rpcs, []);
      }
    });
    await t.test("late failure uses current paid invoice; later genuine open and equal timestamps are accepted", async () => {
      const h = harness("order"); assert.equal((await h.post()).status, 200);
      h.control.event = eventFor("evt_order_old", invoice("in_order", false), "invoice.payment_failed", 100);
      assert.equal((await h.post()).status, 200); assert.equal((await stored("in_order")).status, "paid"); assert.equal(await alerts("in_order"), 0);
      h.control.current = invoice("in_order", false); h.control.event = eventFor("evt_order_later", h.control.current, "invoice.payment_failed", 300);
      assert.equal((await h.post()).status, 200); assert.equal((await stored("in_order")).status, "open"); assert.equal(await alerts("in_order"), 1);
      h.control.current = invoice("in_order"); h.control.event = eventFor("evt_order_same_second", h.control.current, "invoice.paid", 300);
      assert.equal((await h.post()).status, 200); assert.equal((await stored("in_order")).status, "paid"); assert.equal(await alerts("in_order"), 0);
      const audit = await db.query<Row>("select identity,observed_invoice from public.touchline_billing_event_journal where event_id='evt_order_old'");
      assert.equal((audit.rows[0].identity as Row).created, 100); assert.equal((audit.rows[0].observed_invoice as Row).status, "paid");
      assert.doesNotMatch(JSON.stringify(audit.rows), /PRIVATE_CUSTOMER/);
    });
    await t.test("old authentication reason becomes factual current balance; void closes invoice alerts only", async () => {
      const h = harness("reason"); h.control.current = invoice("in_reason", false);
      h.control.event = eventFor("evt_reason_old", invoice("in_reason", false), "invoice.payment_action_required", 100);
      await db.query("insert into public.billing_alerts(user_id,type,title,message,stripe_object_id) values($1,'payment_action_required','Old','Bank prompt','in_reason'),($1,'payment_failed','Other','Other invoice','in_unrelated')", [actor]);
      assert.equal((await h.post()).status, 200);
      const active = (await db.query<Row>("select type,title,message from public.billing_alerts where stripe_object_id='in_reason' and resolved_at is null")).rows;
      assert.equal(active.length, 1); assert.equal(active[0].type, "invoice_unpaid"); assert.doesNotMatch(String(active[0].message), /bank|authentication/i);
      h.control.current = { ...h.control.current, status: "void", amount_remaining: 0 };
      h.control.event = eventFor("evt_reason_void", h.control.current, "invoice.voided", 90);
      assert.equal((await h.post()).status, 200); assert.equal((await stored("in_reason")).status, "void"); assert.equal(await alerts("in_reason"), 0); assert.equal(await alerts("in_unrelated"), 1);
    });
    await t.test("current zero balance does not assert debt; signed provider totals retain their values", async () => {
      const h = harness("credit"); h.control.current = { ...invoice("in_credit", false), subtotal: -100, total: -50, amount_due: 0, amount_remaining: 0 };
      h.control.event = eventFor("evt_credit", invoice("in_credit", false), "invoice.payment_failed");
      assert.equal((await h.post()).status, 200); assert.equal(Number((await stored("in_credit")).total), -50); assert.equal(await alerts("in_credit"), 0);
    });
    await t.test("provider identity mismatch is rejected by the actual handler before commit", async () => {
      for (const patch of [{ customer: "cus_other" }, { livemode: true }]) {
        const h = harness(`wrong_${patch.customer ? "customer" : "mode"}`); h.control.current = { ...h.control.current, ...patch };
        assert.equal((await h.post()).status, 500); assert.ok(!h.control.rpcs.includes("touchline_billing_finish_event")); assert.equal(await stored(h.control.current.id), undefined);
      }
    });
    await t.test("official aggregate taxes survive discounts; absent tax stays unknown", async () => {
      const h = harness("tax"); h.control.current = { ...h.control.current, subtotal: 10000, total: 10800, total_taxes: [{ amount: 1800 }] };
      h.control.event = eventFor("evt_tax", h.control.current, "invoice.updated");
      assert.equal((await h.post()).status, 200); assert.equal(Number((await stored("in_tax")).tax), 1800);
      h.control.current.total_taxes = null; h.control.event = eventFor("evt_tax_unknown", h.control.current, "invoice.updated");
      assert.equal((await h.post()).status, 200); assert.equal((await stored("in_tax")).tax, null);
    });
    await t.test("signed draft deletion plus explicit missing-object response retains history and cannot resurrect", async () => {
      const h = harness("deleted"); h.control.current = { ...invoice("in_deleted", false), status: "draft", amount_remaining: 0 };
      h.control.event = eventFor("evt_draft", h.control.current, "invoice.created"); assert.equal((await h.post()).status, 200);
      h.control.event = eventFor("evt_deleted", h.control.current, "invoice.deleted"); h.control.providerMissing = true;
      assert.equal((await h.post()).status, 200); const row = await stored("in_deleted"); assert.equal(row.status, "deleted"); assert.equal(Number(row.total), 100);
      const reads = h.control.reads; h.control.event = eventFor("evt_draft_old", h.control.current, "invoice.updated", 1);
      assert.equal((await h.post()).status, 200); assert.equal(h.control.reads, reads); assert.equal((await stored("in_deleted")).status, "deleted");
      assert.ok(await receipt("evt_deleted")); assert.ok(await receipt("evt_draft_old"));
    });
    await t.test("404 without signed draft deletion or contradictory finalized state cannot erase invoice", async () => {
      const h = harness("not_deleted"); assert.equal((await h.post()).status, 200); h.control.providerMissing = true;
      h.control.event = eventFor("evt_unavailable", h.control.current, "invoice.updated");
      assert.equal((await h.post()).status, 500); assert.equal((await stored("in_not_deleted")).status, "paid");
      h.control.event = eventFor("evt_false_delete", { ...invoice("in_not_deleted", false), status: "draft" }, "invoice.deleted");
      assert.equal((await h.post()).status, 500); assert.equal((await stored("in_not_deleted")).status, "paid"); assert.equal(await receipt("evt_false_delete"), undefined);
    });
    await t.test("overlapping same-event delivery cannot fetch twice or duplicate an alert", async () => {
      const h = harness("overlap"); h.control.current = invoice("in_overlap", false); h.control.event = eventFor("evt_overlap", h.control.current, "invoice.payment_failed");
      let release!: () => void, entered!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; }); const started = new Promise<void>(resolve => { entered = resolve; });
      h.control.onRead = async () => { entered(); await gate; };
      const first = h.post(); await Promise.race([started, first.then(reply => assert.fail(`handler returned before provider barrier: ${JSON.stringify(reply)}`))]);
      assert.equal((await h.post()).status, 503); assert.equal(h.control.reads, 1); assert.equal(await receipt("evt_overlap"), undefined);
      release(); assert.equal((await first).status, 200); assert.equal(await alerts("in_overlap"), 1);
      assert.deepEqual(await h.post(), { status: 200, body: { received: true, duplicate: true } }); assert.equal(h.control.reads, 1);
    });
    await t.test("distinct concurrent events for one invoice share the lease and one unresolved alert", async () => {
      const a = identity("evt_distinct_a", invoice("in_distinct", false), "invoice.payment_failed");
      const b = { ...a, id: "evt_distinct_b" };
      const first = await rpc("touchline_billing_claim_event", { p_event: a });
      assert.equal((await rpc("touchline_billing_claim_event", { p_event: b })).status, "busy");
      await rpc("touchline_billing_finish_event", { p_event_id: a.id, p_token: first.token, p_invoice: projection(invoice("in_distinct", false)) });
      const second = await rpc("touchline_billing_claim_event", { p_event: b });
      await rpc("touchline_billing_finish_event", { p_event_id: b.id, p_token: second.token, p_invoice: projection(invoice("in_distinct", false)) });
      assert.equal(await alerts("in_distinct"), 1);
    });
    await t.test("provider failure preserves financial rows and pending journal; retry observes current state", async () => {
      const h = harness("provider"); h.control.providerFailure = true;
      const r = await h.post(); assert.equal(r.status, 500); assert.doesNotMatch(JSON.stringify(r), /PRIVATE/);
      assert.equal(await stored("in_provider"), undefined); assert.equal(await receipt("evt_provider"), undefined);
      assert.equal((await db.query<{ status: string }>("select status from public.touchline_billing_event_journal where event_id='evt_provider'")).rows[0].status, "pending");
      h.control.providerFailure = false; assert.equal((await h.post()).status, 200);
    });
    await t.test("stale token cannot commit or release a successor; expired lease cannot commit", async () => {
      const e = identity("evt_expiry", invoice("in_expiry"));
      const first = await rpc("touchline_billing_claim_event", { p_event: e });
      await db.exec("update public.touchline_billing_invoice_leases set expires_at=clock_timestamp()-interval '1 second' where invoice_id='in_expiry'");
      await assert.rejects(rpc("touchline_billing_finish_event", { p_event_id: e.id, p_token: first.token, p_invoice: projection(invoice("in_expiry")) }), /LEASE_LOST/);
      const second = await rpc("touchline_billing_claim_event", { p_event: e }); assert.notEqual(first.token, second.token);
      await rpc("touchline_billing_release_event", { p_event_id: e.id, p_token: first.token });
      await assert.rejects(rpc("touchline_billing_finish_event", { p_event_id: e.id, p_token: first.token, p_invoice: projection(invoice("in_expiry")) }), /LEASE_LOST/);
      await rpc("touchline_billing_finish_event", { p_event_id: e.id, p_token: second.token, p_invoice: projection(invoice("in_expiry")) });
    });
    await t.test("event, invoice, customer and mode conflicts cannot change financial state", async () => {
      const e = identity("evt_identity", invoice("in_identity")); const claim = await rpc("touchline_billing_claim_event", { p_event: e });
      await assert.rejects(rpc("touchline_billing_claim_event", { p_event: { ...e, type: "invoice.payment_failed" } }), /IDENTITY_CONFLICT/);
      for (const patch of [{ id: "in_other" }, { customer_id: "cus_other" }, { livemode: true }]) await assert.rejects(rpc("touchline_billing_finish_event", { p_event_id: e.id, p_token: claim.token, p_invoice: { ...projection(invoice("in_identity")), ...patch } }), /IDENTITY_MISMATCH/);
      assert.equal(await stored("in_identity"), undefined); assert.equal(await receipt(e.id), undefined);
    });
    await t.test("alert and receipt failures roll back invoice, effects and completion together", async () => {
      for (const table of ["billing_alerts", "stripe_webhook_events"]) {
        const key = table === "billing_alerts" ? "fault_alert" : "fault_receipt";
        const h = harness(key); h.control.current = invoice(`in_${key}`, false); h.control.event = eventFor(`evt_${key}`, h.control.current, "invoice.payment_failed");
        await db.exec(`create function public.billing_test_fault() returns trigger language plpgsql as $$begin raise exception 'PRIVATE_FAULT';end$$; create trigger billing_test_fault before insert on public.${table} for each row execute function public.billing_test_fault();`);
        assert.equal((await h.post()).status, 500); assert.equal(await stored(`in_${key}`), undefined); assert.equal(await alerts(`in_${key}`), 0); assert.equal(await receipt(`evt_${key}`), undefined);
        await db.exec(`drop trigger billing_test_fault on public.${table}; drop function public.billing_test_fault();`);
        assert.equal((await h.post()).status, 200); assert.equal(await alerts(`in_${key}`), 1);
      }
    });
    await t.test("lost commit response is resolved from exact receipt without repeating provider/effects", async () => {
      const h = harness("lost"); h.control.loseCommitReply = true;
      assert.equal((await h.post()).status, 500); assert.ok(await receipt("evt_lost")); assert.equal(h.control.reads, 1);
      assert.deepEqual(await h.post(), { status: 200, body: { received: true, duplicate: true } }); assert.equal(h.control.reads, 1);
    });
    await t.test("unsupported and historical receipts remain audited without invoice fulfillment", async () => {
      const h = harness("unsupported"); h.control.event.type = "customer.created";
      assert.equal((await h.post()).status, 200); assert.equal(h.control.reads, 0); assert.equal(await stored("in_unsupported"), undefined);
      assert.equal((await h.post()).body.duplicate, true);
      await db.exec("insert into public.stripe_webhook_events(stripe_event_id,event_type,livemode) values('evt_legacy','invoice.paid',false)");
      assert.equal((await rpc("touchline_billing_claim_event", { p_event: identity("evt_legacy", invoice("in_legacy")) })).status, "duplicate");
      await assert.rejects(rpc("touchline_billing_claim_event", { p_event: { ...identity("evt_legacy", invoice("in_legacy")), livemode: true } }), /RECEIPT_IDENTITY_CONFLICT/);
    });
    await t.test("public roles cannot invoke or access journal; service cannot forge journal/lease rows", async () => {
      for (const role of ["anon", "authenticated"]) {
        await assert.rejects(db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query("select public.touchline_billing_claim_event($1::jsonb)", [JSON.stringify(identity("evt_denied", invoice("in_denied")))]); }), /permission denied/);
        await assert.rejects(db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query("select * from public.touchline_billing_event_journal"); }), /permission denied/);
      }
      for (const sql of ["delete from public.touchline_billing_event_journal", "update public.touchline_billing_invoice_leases set token=null"]) await assert.rejects(db.transaction(async tx => { await tx.exec("set local role service_role"); await tx.exec(sql); }), /permission denied/);
    });
    await t.test("rollback containment revokes new execution while preserving audit and billing rows", async () => {
      const before = (await db.query<{ n: number }>("select count(*)::int n from public.touchline_billing_event_journal")).rows[0].n;
      await db.exec("revoke execute on function public.touchline_billing_claim_event(jsonb),public.touchline_billing_finish_event(text,uuid,jsonb),public.touchline_billing_release_event(text,uuid) from service_role");
      await assert.rejects(rpc("touchline_billing_claim_event", { p_event: identity("evt_rollback", invoice("in_rollback")) }), /permission denied/);
      assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.touchline_billing_event_journal")).rows[0].n, before); assert.ok(await receipt("evt_lost")); assert.ok(await stored("in_order"));
    });
  } finally { await db.close(); }
});
