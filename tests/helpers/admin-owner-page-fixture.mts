import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import * as auth from "../../lib/touchlineArena/auth-i18n.ts";
import * as ledger from "../../lib/admin/tc-ledger-summary.ts";
import { cn } from "../../lib/utils.ts";

const compile = (file: string) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const pageCode = compile("../../app/(app)/admin/page.tsx");
const ownerCode = compile("../../lib/admin/owner.ts");
const uiCode = compile("../../components/arena-admin-ui.tsx");
export function ownerFixture(options: { user?: { id: string; email: string } | null; fail?: boolean; session?: boolean; admin?: boolean; populated?: boolean; frameCode?: string } = {}) {
  const calls: string[] = [];
  const env = { TOUCHLINE_OWNER_EMAILS: "owner@example.test", NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic", SUPABASE_SERVICE_ROLE_KEY: "synthetic", SPORTMONKS_API_TOKEN: "synthetic" };
  const owner: Record<string, unknown> = {}, ui: Record<string, unknown> = {}, exports: Record<string, unknown> = {};
  runInNewContext(ownerCode, { exports: owner, process: { env } });
  const common = (name: string): unknown => {
    if (name === "react/jsx-runtime") return jsx;
    if (name === "lucide-react") return icons;
    if (name === "@/lib/utils") return { cn };
    throw new Error(`Unexpected UI dependency ${name}`);
  };
  runInNewContext(uiCode, { exports: ui, require: common });
  const rows: Record<string, unknown[]> = {
    users: [{ id: "member", full_name: "Synthetic Member", created_at: "2026-10-27T09:00:00Z" }],
    football_data_sync_runs: [{ id: "sync", provider: "sportmonks", sync_type: "live_scores", status: "success", records_created: 2, records_updated: 3, started_at: "2026-10-27T09:00:00Z", completed_at: "2026-10-27T09:01:00Z" }],
    touchline_card_inventory: [{ id: "card", player_name: "Synthetic Player", frame_color: options.frameCode ?? "unassigned", card_status: "published", sale_status: "available" }],
    touchline_user_arena_state: [{ user_id: "member", formation_key: "4-3-3" }],
    touchline_beta_tc_grants: [{ user_id: "member", slot_number: 3, amount_tc: 100 }],
    clubowner_credit_ledger: [{ currency: "TC", amount_cents: 12345 }],
    touchline_analytics_sessions: [{ user_id: "member", active_seconds: 300, last_seen_at: "2026-10-27T09:00:00Z", current_area: "market", device_class: "phone" }],
  };
  const query = (table: string) => {
    calls.push(`read:${table}`);
    let head = false;
    const chain = {
      select(_columns: string, opts?: { head?: boolean }) { head = Boolean(opts?.head); return chain; },
      order() { return chain; }, limit() { return chain; }, returns() { return chain; }, eq() { return chain; },
      then(resolve: (result: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return (options.fail ? Promise.reject(new Error("PRIVATE_OWNER_ERROR")) : Promise.resolve({ data: head ? null : options.populated ? rows[table] ?? [] : [], count: head ? options.populated ? (rows[table]?.length ?? 0) : 0 : null, error: null })).then(resolve, reject);
      },
    };
    return chain;
  };
  runInNewContext(pageCode, { exports, process: { env }, Intl, URL,
    fetch: () => assert.fail("No network permitted in owner fixture"),
    require(name: string) {
      if (name === "next/link") return { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) };
      if (name === "next/navigation") return { notFound: () => { throw new Error("OWNER_NOT_FOUND"); } };
      if (name === "@/components/arena-admin-ui") return ui;
      if (name === "@/lib/admin/owner") return { isOwnerEmail: (email: string) => { calls.push("ownerCheck"); return (owner.isOwnerEmail as (email: string) => boolean)(email); } };
      if (name === "@/lib/touchlineArena/auth-i18n") return auth;
      if (name === "@/lib/admin/tc-ledger-summary") return ledger;
      if (name === "@/lib/supabase/server") return { createClient: async () => options.session === false ? null : { auth: { getUser: async () => ({ data: { user: options.user === undefined ? { id: "owner", email: env.TOUCHLINE_OWNER_EMAILS } : options.user } }) } } };
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => options.admin === false ? null : { from: query, auth: { admin: { listUsers: async () => { calls.push("authList"); if (options.fail) throw new Error("PRIVATE_OWNER_ERROR"); return { data: { users: options.populated ? [{ id: "member", email: "member@example.test", created_at: "2026-10-27T09:00:00Z" }] : [] }, error: null }; } } } } };
      return common(name);
    },
  });
  const Page = exports.default as (props: { searchParams: Promise<{ lang: string }> }) => Promise<React.ReactNode>;
  return { calls, render: async (lang = "pt-BR") => renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ lang }) })) };
}
