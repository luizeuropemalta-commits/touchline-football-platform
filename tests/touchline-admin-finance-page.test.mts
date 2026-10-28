import assert from "node:assert/strict";
import test from "node:test";
import * as authI18n from "../lib/touchlineArena/auth-i18n.ts";
import { fixture, invoice, transaction, privateFailure, type Tile } from "./helpers/admin-finance-page-fixture.mts";

const tileValue = (tiles: Tile[], label: string) => {
  const found = tiles.filter(tile => tile.label === label);
  assert.equal(found.length, 1, `Expected exactly one tile: ${label}`);
  return found[0].value;
};
const noNet = (html: string, tiles: Tile[]) => {
  assert.ok(tiles.every(tile => !/\bnet\b/i.test(tile.label)), "Unrelated invoice and fee windows must not create a net tile");
  assert.doesNotMatch(html, />\s*(?:Net|Net revenue|Net total|Net income)\s*</i);
  assert.match(html, /No reconciled net is calculated from these different samples/);
  assert.doesNotMatch(html, new RegExp(privateFailure));
};

test("finance Portuguese covers amounts, invoice state and unavailable data without changing currency", async () => {
  const f = fixture({ invoices: { data: [invoice({ created_at: "invalid-date" })], error: null }, stripeAvailable: false });
  const html = await f.render("pt-BR");
  for (const label of ["Controle financeiro", "Consulta financeira", "Exportar últimas 1.000 faturas", "Registros de cobrança", "Paga", "Amostra de taxas da Stripe indisponível"]) assert.ok(html.includes(label), label);
  assert.equal(tileValue(f.tiles, "Pago · EUR"), new Intl.NumberFormat("pt-BR", { style: "currency", currency: "EUR" }).format(10));
  assert.doesNotMatch(html, /Finance Control|Owner Admin|Read-only finance|Invoice status summary|Invalid Date/);
  assert.ok(html.includes('href="/admin?lang=pt-BR"'));
  assert.ok(html.includes('href="/admin/company-finance?lang=pt-BR"'));
  const unavailable = fixture({ rejectInvoices: true, rejectWebhooks: true, stripeAvailable: false });
  const failed = await unavailable.render("pt-BR");
  assert.match(failed, /Amostra de faturas indisponível/);
  assert.equal(tileValue(unavailable.tiles, "Faturas em aberto"), "—");
  assert.doesNotMatch(failed, new RegExp(privateFailure));
});

test("finance deleted invoice stays visible as an audit tombstone in both languages", async () => {
  for (const [locale, label] of [["pt-BR", "Excluída"], ["en", "Deleted"]]) {
    const f = fixture({ invoices: { data: [invoice({ status: "deleted", amount_paid: 0, amount_due: 0 })], error: null } });
    const html = await f.render(locale);
    assert.equal(html.split(label).length - 1, 2, "Summary and invoice row retain the tombstone");
    assert.doesNotMatch(html, />deleted</);
  }
});

test("finance SSR owner reads only bounded financial samples and renders no aggregate net", async () => {
  const f = fixture(); const html = await f.render();
  assert.match(html, /Read-only finance/);
  assert.match(html, /href="\/api\/admin\/finance\/export"/);
  assert.equal(f.calls.filter(call => call === "getUser").length, 1);
  assert.ok(f.calls.indexOf("ownerCheck") < f.calls.indexOf("read:billing_invoices"));
  assert.deepEqual(f.queries, [
    { table: "billing_invoices", select: "id,status,currency,subtotal,tax,total,amount_paid,amount_due,created_at,paid_at,stripe_invoice_id,number", order: "created_at", ascending: false, limit: 100 },
    { table: "stripe_webhook_events", select: "stripe_event_id,event_type,processed_at", order: "processed_at", ascending: false, limit: 12 },
  ]);
  assert.equal(f.calls.filter(call => call === "stripeBalance").length, 1);
  assert.equal(f.calls.filter(call => call === "stripeTransactions").length, 1);
  noNet(html, f.tiles);
});

for (const user of [{ id: "customer", email: "other@example.test", user_metadata: { role: "owner" } }, { id: "no-email", email: null }]) {
  test(`finance SSR refuses non-owner ${user.id} before financial reads`, async () => {
    const f = fixture({ user });
    await assert.rejects(f.render(), /FINANCE_NOT_FOUND/);
    assert.deepEqual(f.queries, []);
    assert.equal(f.calls.includes("stripeFactory"), false);
    assert.deepEqual(f.tiles, []);
  });
}

test("finance SSR signed-out or absent session only offers localized sign-in", async () => {
  for (const options of [{ user: null }, { sessionAvailable: false }]) {
    const f = fixture(options); const html = await f.render("pt-BR");
    assert.match(html, /Entre como proprietário/);
    assert.ok(html.includes(authI18n.touchLineAuthEntryHref("/login", "pt-BR", authI18n.touchLineAuthHref("/admin/finance", "pt-BR")).replaceAll("&", "&amp;")));
    assert.deepEqual(f.queries, []); assert.equal(f.calls.includes("ownerCheck"), false);
    assert.equal(f.calls.includes("stripeFactory"), false); assert.deepEqual(f.tiles, []);
  }
});

test("finance SSR missing privileged client does not invent confirmed values", async () => {
  const f = fixture({ adminAvailable: false }); const html = await f.render();
  assert.match(html, /Configuration required/); assert.deepEqual(f.queries, []);
  assert.equal(f.calls.includes("stripeFactory"), false); assert.deepEqual(f.tiles, []);
});

test("finance SSR confirmed empty samples are distinct from unavailable reads", async () => {
  const f = fixture(); const html = await f.render();
  assert.match(html, /No invoices in the confirmed sample/);
  assert.match(html, /No transactions in the confirmed fee sample/);
  assert.equal(tileValue(f.tiles, "Open invoices"), "0");
  assert.equal(tileValue(f.tiles, "Uncollectible invoices"), "0");
  assert.equal(tileValue(f.tiles, "Webhooks"), "0");
  assert.doesNotMatch(html, /Invoice sample unavailable|Stripe fee sample unavailable|read unavailable/);
  noNet(html, f.tiles);
});

for (const mode of ["returned-error", "rejected-read", "missing-data"] as const) {
  test(`finance SSR ${mode} cannot become confirmed empty or zero`, async () => {
    const f = fixture({
      invoices: { data: mode === "returned-error" ? [invoice()] : null, error: mode === "returned-error" ? { message: privateFailure } : null },
      webhooks: { data: mode === "returned-error" ? [{ stripe_event_id: "STALE_WEBHOOK" }] : null, error: mode === "returned-error" ? { message: privateFailure } : null },
      rejectInvoices: mode === "rejected-read", rejectWebhooks: mode === "rejected-read", rejectTransactions: true,
    });
    const html = await f.render();
    assert.match(html, /Invoice sample unavailable\. Amounts are not confirmed/);
    assert.match(html, /Stripe fee sample unavailable\. Fees are not confirmed/);
    assert.equal(tileValue(f.tiles, "Open invoices"), "—");
    assert.equal(tileValue(f.tiles, "Uncollectible invoices"), "—");
    assert.equal(tileValue(f.tiles, "Webhooks"), "—");
    assert.doesNotMatch(html, /No invoices in the confirmed sample|No transactions in the confirmed fee sample|INVOICE-SENTINEL/);
    assert.ok(f.tiles.every(tile => !/^(Paid|Original amount due|Fees) ·/.test(tile.label)));
    noNet(html, f.tiles);
  });
}

test("finance SSR keeps EUR USD JPY invoice values and fee reversals in independent currency groups", async () => {
  const f = fixture({ invoices: { error: null, data: [
    invoice({ id: "eur1", currency: "eur", amount_paid: 1000, amount_due: 1000 }),
    invoice({ id: "eur2", currency: "EUR", status: "open", amount_paid: 250, amount_due: 750 }),
    invoice({ id: "usd", currency: "usd", status: "uncollectible", amount_paid: 2000, amount_due: 3000 }),
    invoice({ id: "jpy", currency: "jpy", amount_paid: 700, amount_due: 900 }),
  ] }, transactions: [transaction({ id: "fee-eur", fee: 50 }), transaction({ id: "fee-usd", currency: "usd", fee: 80 }), transaction({ id: "fee-reversal", currency: "USD", fee: -20 }), transaction({ id: "fee-jpy", currency: "jpy", fee: 5 })],
    balance: { available: [{ currency: "eur", amount: 12345 }, { currency: "jpy", amount: 5432 }], pending: [{ currency: "usd", amount: 6789 }] },
  });
  const html = await f.render();
  const expected = (value: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
  for (const [currency, paid, due, fees] of [["EUR", 12.5, 17.5, .5], ["USD", 20, 30, .6], ["JPY", 700, 900, 5]] as const) {
    assert.equal(tileValue(f.tiles, `Paid · ${currency}`), expected(paid, currency));
    assert.equal(tileValue(f.tiles, `Original amount due · ${currency}`), expected(due, currency));
    assert.equal(tileValue(f.tiles, `Fees · ${currency}`), expected(fees, currency));
  }
  assert.equal(f.tiles.length, 12, "Exactly nine currency tiles and three status tiles; no aggregate total/net");
  assert.equal(f.tiles.find(tile => tile.label === "Paid · EUR")?.delta, "2 sampled invoices");
  assert.equal(f.tiles.find(tile => tile.label === "Fees · USD")?.delta, "2 sampled transactions");
  assert.equal(tileValue(f.tiles, "Open invoices"), "1"); assert.equal(tileValue(f.tiles, "Uncollectible invoices"), "1");
  assert.match(html, /Available eur/); assert.match(html, /Available jpy/); assert.match(html, /Pending usd/);
  assert.match(html, /latest 100 records/); assert.match(html, /latest 12 balance transactions/);
  assert.match(html, /not all-time totals/); assert.match(html, /original amount_due, not its outstanding balance/);
  noNet(html, f.tiles);
});

test("finance SSR a failed provider does not erase a confirmed invoice sample", async () => {
  for (const options of [{ stripeAvailable: false }, { rejectBalance: true, rejectTransactions: true }]) {
    const f = fixture({ ...options, invoices: { data: [invoice()], error: null } }); const html = await f.render();
    assert.equal(tileValue(f.tiles, "Paid · EUR"), "€10.00");
    assert.equal(tileValue(f.tiles, "Original amount due · EUR"), "€10.00");
    assert.match(html, /INVOICE-SENTINEL/); assert.match(html, /Stripe fee sample unavailable/);
    assert.match(html, /Stripe balance appears here when the server key is configured and reachable/);
    assert.ok(f.tiles.every(tile => !tile.label.startsWith("Fees ·"))); noNet(html, f.tiles);
  }
});

test("finance SSR an invoice error leaves a confirmed fee sample independent", async () => {
  const f = fixture({ invoices: { data: null, error: { message: privateFailure } }, transactions: [transaction()] });
  const html = await f.render();
  assert.equal(tileValue(f.tiles, "Fees · EUR"), "€0.25");
  assert.equal(tileValue(f.tiles, "Open invoices"), "—");
  assert.match(html, /TRANSACTION-SENTINEL/); assert.doesNotMatch(html, /INVOICE-SENTINEL/);
  noNet(html, f.tiles);
});


test("finance SSR missing owner allow-list cannot authorize a signed-in account", async () => {
  const f = fixture({ ownerEmails: "" });
  await assert.rejects(f.render(), /FINANCE_NOT_FOUND/);
  assert.deepEqual(f.queries, []); assert.equal(f.calls.includes("stripeFactory"), false);
});

test("finance unknown invoice status cannot resolve inherited Object properties", async () => {
  for (const status of ["__proto__", "constructor", "future_status"]) {
    const f = fixture({ invoices: { data: [invoice({ status })], error: null } });
    const html = await f.render("pt-BR");
    assert.ok(html.includes(status.replaceAll("_", " ")));
    assert.match(html, /INVOICE-SENTINEL/);
  }
});
