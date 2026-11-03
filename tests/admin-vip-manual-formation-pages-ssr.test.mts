import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { publicationBindingIssue } from "../lib/touchlineArena/card-publication-integrity.ts";

const compile = (path: string) => ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const ownerCode = compile("lib/admin/owner.ts");
const paths = { vip: "app/(app)/admin/vip-access/page.tsx", manual: "app/(app)/admin/manual-card-editorial/page.tsx", formation: "app/(app)/admin/formation-calibration/page.tsx" } as const;
function run(page: keyof typeof paths, user: { id: string; email: string } | null, adminAvailable = true, mode: "empty" | "filled" | "error" = "empty", lang = "pt-BR", membershipCase?: "stale" | "missing" | "unpublished" | "error", authFailure?: "error" | "throw", counts = { admins: 0, reads: 0 }) {
  const owner: Record<string, unknown> = {};
  runInNewContext(ownerCode, { exports: owner, process: { env: { TOUCHLINE_OWNER_EMAILS: "owner@example.test" } } });
  const pageExports: Record<string, unknown> = {};
  const canonicalRows: Record<string, unknown[]> = {
    football_players: [{ id: "player", current_club_id: "club", display_name: "Omar fixture", name: "Omar fixture", position: "Forward", nationality: "Egypt", football_clubs: { name: "Club" } }],
    football_clubs: [{ id: "club", name: "Club", competition_id: "league", provider: "sportmonks" }],
    football_competitions: [{ id: "league" }],
    touchline_card_publications: [{ player_id: "player", publication_status: membershipCase === "unpublished" ? "ready_for_review" : "published", current_membership_id: "old" }],
    football_squad_members: membershipCase === "missing" ? [] : [{ id: "new", player_id: "player", club_id: "club", competition_id: "league", jersey_number: 22, position: "Forward" }],
    football_player_market_values: [{ player_id: "player", status: "verified", confidence: "verified", market_value_eur: 50000000 }],
  };
  const chain = (table: string) => { counts.reads++; const q: Record<string, unknown> = {}; for (const method of ["select", "eq", "in", "not", "order", "limit", "returns"]) q[method] = () => q; q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: membershipCase ? canonicalRows[table] ?? [] : mode === "filled" ? [{ id: "synthetic", name: "Synthetic" }] : [], error: mode === "error" || (membershipCase === "error" && table === "football_squad_members") ? { message: "PRIVATE_REVIEW_ERROR" } : null, count: mode === "filled" ? 1 : 0 }).then(resolve); return q; };
  runInNewContext(compile(paths[page]), { exports: pageExports, Intl, URL, Date, require(name: string) {
    if (name === "react/jsx-runtime") return jsx;
    if (name === "next/link") return { default: ({ children, ...p }: { children?: React.ReactNode } & Record<string, unknown>) => React.createElement("a", p, children) };
    if (name === "next/navigation") return { notFound: () => { throw new Error("ADMIN_NOT_FOUND"); } };
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (name === "@/lib/admin/owner") return { isOwnerEmail: (email?: string | null) => email === "owner@example.test" };
    if (name === "@/lib/supabase/server") return { createClient: async () => ({ auth: { getUser: async () => { if(authFailure === "throw") throw Error("PRIVATE_AUTH_FAILURE"); return { data: { user }, error: authFailure === "error" ? { message: "PRIVATE_AUTH_FAILURE" } : null }; } } }) };
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => { counts.admins++; return adminAvailable ? { from: chain, auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } } } : null; } };
    if (name === "@/lib/touchlineArena/auth-i18n") return { normalizeTouchLineAuthLocale: (v: string) => v === "pt-BR" ? "pt-BR" : "en-GB", touchLineAuthHref: (p: string) => p, touchLineAuthEntryHref: (p: string) => p };
    if (name === "@/lib/touchlineArena/auth-access") return { hasTouchLineArenaAccess: () => true };
    if (name.includes("formation-geometry-server")) return { readTouchlineFormationGeometryRegistry: async () => { if (mode === "error") throw new Error("PRIVATE_REVIEW_ERROR"); return mode === "filled" ? { "4-3-3": { formationCode: "4-3-3", geometryVersion: "v1" } } : {}; }, readTouchlineFormationGeometryHistory: async () => mode === "filled" ? [{ id: "h1", formationCode: "4-3-3" }] : [] };
    if (name.includes("server-read-deadline")) return { resolveServerReadWithin: async (p: Promise<unknown>) => p };
    if (name.includes("card-publication-read-model")) return { loadTouchlineCardEditorialOverrides: async () => new Map() };
    if (name.includes("new-player-card-alerts")) return { findTouchlineNewPlayerCardAlerts: () => [], hasTouchlineVerifiedMarketValue: () => true };
    if (name.includes("card-publication-revert")) return { hasTouchlineCardPublicationRevertSnapshot: () => false };
    if (name.includes("card-publication-integrity")) return { publicationBindingIssue };
    if (name.includes("card-review-state")) return { evaluateTouchlineCardCompleteness: () => ({ state: "COMPLETE", missingFields: [] }) };
    if (name.includes("card-editorial-overrides")) return { loadTouchlineCardEditorialOverrides: async () => new Map() };
    if (name.includes("demo-data")) return { findTouchLineClub: () => null };
    if (name.includes("country-flags")) return { touchlineCountryCode3FromName: () => null };
    if (name.includes("position-eligibility")) return { touchlineMarketPositionBucket: (v: string) => v };
    if (name.includes("admin-vip-access")) return { default: () => React.createElement("form", null, "VIP") };
    if (name.includes("FormationCalibrationStudio")) return { default: (props: { locale?: string; registry?: Record<string, unknown>; history?: unknown[] }) => React.createElement("section", null, `${props.locale ?? ""} ${Object.keys(props.registry ?? {}).join(",")} ${(props.history ?? []).length}`) };
    if (name.includes("arena-admin-ui")) return { GamePanel: ({ children }: { children?: React.ReactNode }) => React.createElement("section", null, children), LivePill: ({ children }: { children?: React.ReactNode }) => React.createElement("span", null, children), StatTile: () => null };
    if (name.includes("card-engine-inbox") && membershipCase) return { CardEngineInbox: ({ rows }: { rows: unknown }) => React.createElement("pre", null, JSON.stringify(rows)) };
    if (name.includes("manual-card-editorial-actions") || name.includes("card-engine-inbox")) return new Proxy({}, { get: () => () => null });
    throw new Error(`unmocked ${name}`);
  } });
  const Page = pageExports.default as (p: { searchParams: Promise<Record<string, string>> }) => Promise<React.ReactNode>;
  return Page({ searchParams: Promise.resolve({ lang }) }).then((node) => renderToStaticMarkup(node));
}
for (const page of Object.keys(paths) as Array<keyof typeof paths>) {
  test(`${page} denies non-owner SSR`, async () => { await assert.rejects(() => run(page, { id: "member", email: "member@example.test" }), /ADMIN_NOT_FOUND/); });
}
test("VIP config-empty SSR is localized", async () => { const html = await run("vip", { id: "owner", email: "owner@example.test" }, false); assert.match(html, /configuração protegida|Protected configuration/i); });
for (const page of ["vip", "manual", "formation"] as const) {
  for (const lang of ["pt-BR", "en-GB"] as const) {
    test(`${page} authorized empty ${lang} SSR renders`, async () => {
      const html = await run(page, { id: "owner", email: "owner@example.test" }, true, "empty", lang);
      assert.ok(html.length > 0);
      assert.doesNotMatch(html, /PRIVATE_REVIEW_ERROR|SERVICE_ROLE/);
      if (page === "vip") assert.match(html, lang === "pt-BR" ? /Acesso|Convidados/ : /VIP|Guest/);
      if (page === "manual") assert.match(html, /Editorial|card/i);
      if (page === "formation") assert.match(html, new RegExp(lang));
    });
    test(`${page} authorized filled ${lang} SSR renders`, async () => {
      const html = await run(page, { id: "owner", email: "owner@example.test" }, true, "filled", lang);
      assert.ok(html.length > 0);
      if (page === "formation") assert.match(html, /4-3-3|v1|h1/);
      assert.doesNotMatch(html, /PRIVATE_REVIEW_ERROR|SERVICE_ROLE/);
    });
    test(`${page} authorized error ${lang} SSR does not leak private errors`, async () => {
      if (page === "formation") { await assert.rejects(() => run(page, { id: "owner", email: "owner@example.test" }, true, "error", lang), /PRIVATE_REVIEW_ERROR/); return; }
      const html = await run(page, { id: "owner", email: "owner@example.test" }, true, "error", lang);
      assert.ok(html.length > 0); assert.doesNotMatch(html, /PRIVATE_REVIEW_ERROR|SERVICE_ROLE/);
      if (page !== "vip") assert.match(html, lang === "pt-BR" ? /indisponível|temporariamente/i : /unavailable|temporarily/i);
    });
  }
}

for (const [membershipCase, expected] of [["stale", "STALE_PUBLICATION"], ["missing", "NO_ACTIVE_MEMBERSHIP"], ["unpublished", null], ["error", "Vínculos indisponíveis"]] as const) {
  test(`manual inbox classifies ${membershipCase} publication through actual SSR page`, async () => {
    const html = await run("manual", { id: "owner", email: "owner@example.test" }, true, "filled", "pt-BR", membershipCase);
    if (expected) assert.ok(html.includes(expected), html);
    else assert.doesNotMatch(html, /STALE_PUBLICATION/);
    assert.doesNotMatch(html, /PRIVATE_REVIEW_ERROR/);
  });
}

for(const failure of ['error','throw'] as const)test(`manual SSR rejects ${failure} auth without privileged reads`,async()=>{const counts={admins:0,reads:0};const html=await run('manual',{id:'owner',email:'owner@example.test'},true,'filled','pt-BR',undefined,failure,counts);assert.match(html,/autenticação.*confirmada/i);assert.doesNotMatch(html,/PRIVATE_AUTH_FAILURE|Omar fixture|Synthetic/);assert.deepEqual(counts,{admins:0,reads:0});});
