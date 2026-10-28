import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import * as auth from "../../lib/touchlineArena/auth-i18n.ts";
import * as deadline from "../../lib/touchlineArena/server-read-deadline.ts";
import * as rosterContract from "../../lib/football-data/roster-reconciliation-contract.ts";
import { cn } from "../../lib/utils.ts";
const compile = (file: string) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const controlsCode = compile("../../components/admin-football-data-sync-controls.tsx"), buttonCode = compile("../../components/ui.tsx");
const rosterCode = compile("../../components/admin-football-roster-controls.tsx");
const pageCode = compile("../../app/(app)/admin/football-data/page.tsx"), uiCode = compile("../../components/arena-admin-ui.tsx"), ownerCode = compile("../../lib/admin/owner.ts");
export function footballDataFixture(options: { user?: { email: string } | null; state?: "empty" | "populated" | "error" | "rejected" | "stalled"; admin?: boolean } = {}) {
  const calls: string[] = [], filters: string[] = [], exports: Record<string, unknown> = {}, ui: Record<string, unknown> = {}, owner: Record<string, unknown> = {};
  runInNewContext(ownerCode, { exports: owner, process: { env: { TOUCHLINE_OWNER_EMAILS: "owner@example.test" } } });
  const common = (name: string): unknown => {
    if (name === "react/jsx-runtime") return jsx;
    if (name === "react") return React;
    if (name === "lucide-react") return icons;
    if (name === "@/lib/utils") return { cn };
    throw new Error(`Unexpected dependency ${name}`);
  };
  runInNewContext(uiCode, { exports: ui, require: common });
  const buttonUi: Record<string, unknown> = {}, controls: Record<string, unknown> = {};
  runInNewContext(buttonCode, { exports: buttonUi, require: common });
  runInNewContext(controlsCode, { exports: controls, require(name: string) {
    if (name === "next/navigation") return { useRouter: () => ({ refresh: () => assert.fail("No SSR mutation") }) };
    if (name === "@/components/ui") return buttonUi;
    return common(name);
  } });
  const roster: Record<string, unknown> = {};
  runInNewContext(rosterCode, { exports: roster, require(name: string) {
    if (name === "@/components/ui") return buttonUi;
    if (name === "@/lib/touchlineArena/auth-i18n") return auth;
    if (name === "@/lib/football-data/roster-reconciliation-contract") return rosterContract;
    return common(name);
  } });
  const query = (table: string) => {
    calls.push(table); let head = false;
    const chain = {
      select(_columns: string, opts?: { head?: boolean }) { head = Boolean(opts?.head); return chain; },
      order() { return chain; }, limit() { return chain; }, returns() { return chain; }, eq() { return chain; }, in() { return chain; },
      ilike(column: string, pattern: string) { filters.push(`${column}:${pattern}`); return chain; },
      then(resolve: (result: unknown) => unknown, reject: (reason: unknown) => unknown) {
        if (options.state === "stalled") return new Promise(() => {});
        const rows: Record<string, unknown[]> = {
          football_competitions: [{ id: "league", provider: "sportmonks", provider_competition_id: "8", name: "Synthetic League", country: null, logo_url: null, source_updated_at: "invalid" }],
          football_clubs: [{ id: "club", provider: "sportmonks", provider_team_id: "10", name: "Synthetic Club", short_code: "SC", country: null, logo_url: null, venue_id: null, source_updated_at: null }],
          football_squad_members: [{ id: "member", club_id: "club", player_id: "player", jersey_number: 7, position: null, status: "active" }],
          football_players: [{ id: "player", provider_player_id: "20", display_name: "Synthetic Player", photo_url: null, nationality: null, position: null }],
          football_data_sync_runs: [{ id: "run", provider: "sportmonks", sync_type: "live_scores", status: "partial", records_updated: 2, records_skipped: 1, started_at: "2026-10-27T08:00:00Z", completed_at: null, error_message: "PRIVATE_FOOTBALL_ERROR" }],
        };
        const data = options.state === "populated" ? rows[table] ?? [] : [];
        return (options.state === "rejected" ? Promise.reject(new Error("PRIVATE_FOOTBALL_ERROR")) : Promise.resolve({ data: head ? null : data, count: head ? data.length : null, error: options.state === "error" ? { message: "PRIVATE_FOOTBALL_ERROR" } : null })).then(resolve, reject);
      },
    }; return chain;
  };
  runInNewContext(pageCode, { exports, Intl, URL, setTimeout, clearTimeout, process: { env: {} }, fetch: () => assert.fail("No network permitted"),
    require(name: string) {
      if (name === "next/link") return { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) };
      if (name === "next/navigation") return { notFound: () => { throw new Error("FOOTBALL_DENIED"); } };
      if (name === "@/components/arena-admin-ui") return ui;
      if (name === "@/lib/admin/owner") return owner;
      if (name === "@/lib/touchlineArena/auth-i18n") return auth;
      if (name === "@/lib/touchlineArena/server-read-deadline") return deadline;
      if (name === "@/lib/football-data/provider-factory") return { getConfiguredFootballDataProviderName: () => "sportmonks" };
      if (name === "@/components/admin-football-data-sync-controls") return { FootballDataSyncControls: ({ locale, allowQaMaintenance }: { locale: string; allowQaMaintenance: boolean }) => React.createElement("div", { "data-control-locale": locale, "data-qa-controls": String(allowQaMaintenance) }, React.createElement(controls.FootballDataSyncControls as React.ComponentType<{ locale: string; allowQaMaintenance: boolean }>, { locale, allowQaMaintenance })) };
      if (name === "@/components/admin-football-roster-controls") return { FootballRosterControls: ({ locale }: { locale: string }) => React.createElement("div", { "data-roster-locale": locale }, React.createElement(roster.FootballRosterControls as React.ComponentType<{ locale: string }>, { locale })) };
      if (name === "@/lib/supabase/server") return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.user === undefined ? { email: "owner@example.test" } : options.user } }) } }) };
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => options.admin === false ? null : { from: query } };
      return common(name);
    },
  });
  const Page = exports.default as (props: { searchParams: Promise<{ lang: string; q: string }> }) => Promise<React.ReactNode>;
  return { calls, filters, render: async (lang = "pt-BR", q = "") => renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ lang, q }) })) };
}
