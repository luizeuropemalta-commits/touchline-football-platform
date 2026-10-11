import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import * as marketPolicy from "../lib/touchlineFantasy/market-plan-policy.ts";

const source = readFileSync(new URL("../app/clubowner/page.tsx", import.meta.url), "utf8");
type Params = { lang?: string; club?: string; planPreview?: string | string[] };
type Element = { props: Record<string, unknown> };

function fixture(environment: string, patch: Record<string, unknown> = {}) {
  const user = { id: "customer", email: "customer@example.test" };
  const plan = Object.freeze({ active: true, expiresAt: "2026-11-10T00:00:00.000Z" });
  const snapshot = Object.freeze({ entitlementActive: true, marketAccess: marketPolicy.resolveTouchlineFantasyMarketAccess("standard"),
    config: { budgetEur: 500_000_000 }, userGameweek: { totalMarketValueEur: 379_000_000 }, plan, ...patch });
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "next/headers": { headers: async () => ({ get: () => null }) },
    "next/navigation": { redirect: () => assert.fail("Customer must remain signed in"), notFound: () => assert.fail("Customer must remain allowed") },
    "@/lib/touchlineArena/match-centre": { normalizeTouchlineMatchCentreTimeZone: () => "Europe/London" },
    "@/lib/touchlineArena/site-locales-release": { isTouchLineSiteLocalesEnabled: () => false },
    "@/lib/touchlineArena/club-owner-profile-metrics": { clubOwnerRankingPoints: () => 63.25, clubOwnerRankingPosition: () => 1 },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ error: null, data: { user } }) } }) },
    "@/lib/admin/owner": { isOwnerEmail: () => false },
    "@/lib/touchlineArena/club-owner-page-identity": { resolveTouchlineClubOwnerPageIdentity: () => ({ isAuthenticatedClubOwner: true, name: "Customer", avatarUrl: "" }) },
    "@/lib/touchlineArena/club-owner-avatar-context-server": { createClubOwnerAvatarContextReader: () => async () => null },
    "@/lib/touchlineArena/auth-i18n": { touchLineAuthEntryHref: () => assert.fail("No login navigation expected") },
    "@/lib/touchlineArena/server-read-deadline": { resolveServerReadWithin: (read: unknown) => read },
    "@/lib/touchlineFantasy/server": { loadTouchlineFantasySnapshot: async () => snapshot },
    "@/lib/touchlineFantasy/market-plan-policy": marketPolicy,
    "@/lib/touchlineArena/demo-data": { TOUCHLINE_ENGLAND_CLUBS: [{ slug: "arsenal", teamId: 19 }] },
    "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale: (locale: string) => locale === "pt-BR" ? locale : "en-GB" },
    "@/lib/touchlineFantasy/market-workflow-i18n": { getTouchlineFantasyMarketWorkflowCopy: () => ({ metadataDescription: "ClubOwner" }) },
    "./market-game.module.css": { default: { page: "page", content: "content" } },
  };
  for (const name of ["@/components/touchline/ClubOwnerMarketHeader", "@/components/touchline/TouchlineBrandHeader", "@/components/touchline/TouchlineGlobalNavigation", "@/app/fantasy/FantasyGameweekClient"]) {
    dependencies[name] = { default: () => null };
  }
  const exports: { default?: (props: { searchParams: Promise<Params> }) => Promise<Element> } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, process: { env: { NODE_ENV: environment } },
    require(name: string) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; },
  });
  return { plan, async render(params: Params) {
    const root = await exports.default!({ searchParams: Promise.resolve(params) });
    const [brand, content] = root.props.children as Element[];
    const [header, fantasy] = content.props.children as Element[];
    assert.equal(header.props.plan, plan, "Navigation must not replace the real subscription");
    assert.equal(fantasy.props.initialSnapshot, snapshot);
    return { href: brand.props.href, header };
  } };
}

test("ClubOwner logo preserves the accepted development preview, locale and club after navigation", async () => {
  for (const selected of ["pro", "standard"]) {
    const h = fixture("development");
    const first = await h.render({ lang: "pt-BR", club: "arsenal", planPreview: selected });
    assert.equal(first.href, `/clubowner?lang=pt-BR&club=arsenal&planPreview=${selected}`);
    assert.equal(first.header.props.remainingMarketPower, 121_000_000);
    assert.equal(first.header.props.realUnlimited, false);
    const url = new URL(String(first.href), "http://localhost:3318");
    const next = await h.render(Object.fromEntries(url.searchParams));
    assert.equal(next.header.props.planPreview, selected, "Following the logo must not drop the showcase");
  }
});

test("real VIP capability is explicit and independent of preview; missing, inactive and malformed policies stay unavailable", async () => {
  const vip = marketPolicy.resolveTouchlineFantasyMarketAccess("vip");
  for (const planPreview of [undefined, "pro", "standard", "vip"]) {
    const actual = await fixture("development", { marketAccess: vip, config: { budgetEur: null } }).render({ planPreview });
    assert.equal(actual.header.props.realUnlimited, true);
    assert.equal(actual.header.props.remainingMarketPower, null);
    const standard = await fixture("development").render({ planPreview });
    assert.equal(standard.header.props.realUnlimited, false);
    assert.equal(standard.header.props.remainingMarketPower, 121_000_000);
  }
  for (const patch of [{ marketAccess: undefined }, { marketAccess: null },
    { marketAccess: { planKey: "vip", budgetEur: 900_000_000, allowedClubTeamIds: null } },
    { marketAccess: vip, entitlementActive: false }]) {
    const result = await fixture("production", patch).render({ planPreview: "vip" });
    assert.equal(result.header.props.realUnlimited, false);
    assert.equal(result.header.props.remainingMarketPower, null);
  }
  const authoritative = await fixture("production", { config: { budgetEur: 900_000_000 } }).render({});
  assert.equal(authoritative.header.props.remainingMarketPower, 121_000_000, "config drift cannot replace the recognized plan budget");
});

test("normal and production navigation cannot promote an arbitrary preview into a real plan", async () => {
  for (const environment of ["development", "production"]) {
    for (const value of [undefined, "vip", "master", "<script>", "pro", "standard"]) {
      const result = await fixture(environment).render({ lang: "en-GB", planPreview: value });
      const allowed = environment === "development" && (value === "pro" || value === "standard");
      assert.equal(result.header.props.planPreview, allowed ? value : null);
      assert.equal(result.href, `/clubowner?lang=en-GB${allowed ? `&planPreview=${value}` : ""}`);
    }
  }
  const array = await fixture("development").render({ lang: "pt-BR", planPreview: ["standard", "pro"] });
  assert.equal(array.href, "/clubowner?lang=pt-BR&planPreview=standard");
});
