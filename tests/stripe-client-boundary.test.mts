import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("legacy professional billing is absent while the generic Stripe boundary remains", async () => {
  const legacyFiles = [
    "app/api/stripe/checkout/route.ts",
    "app/api/stripe/portal/route.ts",
    "lib/billing/plans.ts",
    "lib/billing/stripe.ts",
    "lib/server/request.ts",
  ];

  for (const relativePath of legacyFiles) {
    assert.equal(existsSync(new URL(`../${relativePath}`, import.meta.url)), false, `${relativePath} must remain removed`);
  }

  const [client, webhook, financePage, financeExport, packageManifest] = await Promise.all([
    source("lib/stripe/client.ts"),
    source("app/api/stripe/webhook/route.ts"),
    source("app/(app)/admin/finance/page.tsx"),
    source("app/api/admin/finance/export/route.ts"),
    source("package.json"),
  ]);
  const packageJson = JSON.parse(packageManifest) as { dependencies?: Record<string, string> };

  assert.match(client, /export function getStripe\(\)/);
  assert.match(client, /process\.env\.STRIPE_SECRET_KEY/);
  assert.match(client, /appInfo: \{ name: "Touchline", version: "1\.0\.0" \}/);
  assert.match(webhook, /import \{ getStripe \} from "@\/lib\/stripe\/client"/);
  assert.match(financePage, /import \{ getStripe \} from "@\/lib\/stripe\/client"/);
  assert.doesNotMatch(financePage, /@\/lib\/billing\/stripe/);
  assert.doesNotMatch(financeExport, /@\/lib\/billing\/stripe/);
  assert.equal(typeof packageJson.dependencies?.stripe, "string", "the generic Stripe SDK dependency must remain installed");
});

test("Arena finance and export remain read-only without professional-plan semantics", async () => {
  const [financePage, financeExport] = await Promise.all([
    source("app/(app)/admin/finance/page.tsx"),
    source("app/api/admin/finance/export/route.ts"),
  ]);

  assert.match(financePage, /from "@\/components\/arena-admin-ui"/);
  assert.match(financePage, /admin\.from\("billing_invoices"\)/);
  assert.match(financePage, /admin\.from\("stripe_webhook_events"\)/);
  assert.match(financePage, /href="\/api\/admin\/finance\/export"/);
  assert.match(financePage, /Invoice status summary/);
  assert.match(financePage, /invoiceStatusBreakdown\(invoiceRows\)/);
  assert.doesNotMatch(financePage, /billing_subscriptions/);
  assert.doesNotMatch(financePage, /SubscriptionRow|planBreakdown|Revenue by product|No subscriptions synchronized yet/);
  assert.match(financeExport, /isOwnerEmail\(user\?\.email\)/);
  assert.match(financeExport, /from\("billing_invoices"\)/);
  assert.match(financeExport, /\.select\("number,status,currency,subtotal,tax,total,amount_paid,amount_due,period_start,period_end,paid_at,created_at,stripe_invoice_id"\)/);
  assert.doesNotMatch(financeExport, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(financeExport, /billing_subscriptions|PlanKey|STRIPE_PRICE_/);
});

test("neutral webhook verifies, deduplicates, syncs invoices and audits every acknowledged event", async () => {
  const webhook = await source("app/api/stripe/webhook/route.ts");

  assert.match(webhook, /import \{ getStripe \} from "@\/lib\/stripe\/client"/);
  assert.doesNotMatch(webhook, /@\/lib\/billing|PlanKey|BillingInterval|resolvePlanFromPrice|isPlanKey/);
  assert.doesNotMatch(webhook, /billing_subscriptions|founder_plan_slots|syncSubscription/);
  assert.doesNotMatch(webhook, /customer\.subscription|checkout\.session\.completed|trial_will_end|stripe\.subscriptions/);
  assert.match(webhook, /request\.headers\.get\("stripe-signature"\)/);
  assert.match(webhook, /stripe\.webhooks\.constructEvent\(/);
  assert.match(webhook, /"touchline_billing_claim_event"/);
  assert.match(webhook, /claim\?\.eventId !== event\.id/);
  assert.match(webhook, /claim.status === "duplicate"/);
  for(const event of ['invoice.paid','invoice.payment_failed','invoice.payment_action_required','invoice.voided','invoice.deleted'])assert.ok(webhook.includes(`"${event}"`));
  assert.doesNotMatch(webhook, /\.from\("billing_invoices"\)\.upsert|\.from\("billing_alerts"\)/, 'invoice and alerts must commit through the atomic RPC');
  const claim=webhook.indexOf('"touchline_billing_claim_event"'), current=webhook.indexOf('await stripe.invoices.retrieve('), finish=webhook.indexOf('"touchline_billing_finish_event"');
  assert.ok(claim>=0 && current>claim && finish>current, 'claim, current invoice read and atomic finish must remain ordered');
  assert.match(webhook, /result\?\.status !== "applied" \|\| result.eventId !== event.id/);
  const migration=await source('supabase/migrations/20261027120138_touchline_billing_atomic_reconciliation.sql');
  for(const table of ['billing_invoices','billing_alerts','stripe_webhook_events'])assert.ok(migration.includes(table),table+' must remain in atomic persistence');

});

test("billing persistence, idempotency records, invoices and alerts remain defined", async () => {
  const migration = await source("supabase/migrations/003_stripe_billing.sql");

  for (const table of [
    "billing_customers",
    "billing_subscriptions",
    "billing_invoices",
    "billing_alerts",
    "stripe_webhook_events",
    "founder_plan_slots",
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table} \\(`));
  }

  assert.match(migration, /stripe_event_id text primary key/);
  assert.match(migration, /alter table public\.billing_invoices enable row level security/);
  assert.match(migration, /alter table public\.billing_alerts enable row level security/);
  assert.match(migration, /There are deliberately no client mutation policies/);
  assert.match(migration, /Only the service-role webhook/);
});
