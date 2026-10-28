import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, root), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const ownerCode = compile("lib/admin/owner.ts");
const pages = {
  analytics: compile("app/(app)/admin/analytics/page.tsx"),
  promotions: compile("app/(app)/admin/promotions/page.tsx"),
  cards: compile("app/(app)/admin/cards/page.tsx"),
};

type Mode = "filled" | "empty" | "error" | "rejected" | "denied" | "missing-schema";
const ownerEmail = "owner@example.test";
type Props = { children?: React.ReactNode; label?: string; value?: string; delta?: string; locale?: string } & Record<string, unknown>;
type QueryChain = { select: (...args: unknown[]) => QueryChain; gte: (...args: unknown[]) => QueryChain; order: (...args: unknown[]) => QueryChain; limit: (...args: unknown[]) => QueryChain; returns: (...args: unknown[]) => QueryChain; eq: (...args: unknown[]) => QueryChain; then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => unknown };
const ui = {
  GamePanel: ({ children, ...props }: Props) => React.createElement("section", props, children),
  LivePill: ({ children }: Props) => React.createElement("span", null, children),
  StatTile: ({ label, value, delta }: Props) => React.createElement("dl", null, React.createElement("dt", null, label), React.createElement("dd", null, value), React.createElement("small", null, delta)),
};
const link = { __esModule: true, default: ({ children, ...props }: Props) => React.createElement("a", props, children) };
const auth = { normalizeTouchLineAuthLocale: (value: string | null) => value === "pt-BR" ? "pt-BR" : "en-GB", touchLineAuthHref: (p: string, l: string) => `${p}?lang=${l}`, touchLineAuthEntryHref: (p: string, l: string, r: string) => `${p}?lang=${l}&redirect=${encodeURIComponent(r)}` };

function fixture(page: keyof typeof pages, mode: Mode) {
  const pageExports: Record<string, unknown> = {};
  const ownerExports: Record<string, unknown> = {};
  runInNewContext(ownerCode, { exports: ownerExports, process: { env: { TOUCHLINE_OWNER_EMAILS: ownerEmail } } });
  const query = (table: string) => {
    const chain: QueryChain = {
      select: () => chain, gte: () => chain, order: () => chain, limit: () => chain, returns: () => chain, eq: () => chain,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (mode === "rejected") return Promise.reject(new Error("PRIVATE_REVIEW_ERROR")).then(resolve, reject);
        if (mode === "missing-schema") return Promise.resolve({ data: [], count: 0, error: { message: "PRIVATE_REVIEW_ERROR schema cache touchline_card_inventory" } }).then(resolve, reject);
        if (mode === "error") return Promise.resolve({ data: [], count: 0, error: { message: "PRIVATE_REVIEW_ERROR" } }).then(resolve, reject);
        const filled = mode === "filled";
        const data: Record<string, unknown> = {
          touchline_analytics_sessions: filled ? [{ user_id: "u1", active_seconds: 120, started_at: "2026-10-27T09:00:00Z", last_seen_at: new Date().toISOString(), current_area: "market", device_class: "phone" }] : [],
          touchline_beta_tc_grants: filled ? [{ user_id: "u1", slot_number: 1, amount_tc: 10, granted_at: "2026-10-27T09:00:00Z" }] : [],
          touchline_promotions: filled ? [{ id: "p1", name: "Synthetic", description: null, status: "active", starts_at: null, ends_at: null, created_at: "2026-10-27T09:00:00Z" }] : [],
          clubowner_credit_ledger: filled ? [{ id: "l1", user_id: "u1", amount_cents: 100, currency: "TC", entry_type: "grant", reason: "Synthetic", idempotency_key: "k1", created_at: "2026-10-27T09:00:00Z" }] : [],
          touchline_card_inventory: filled ? [{ id: "c1", player_name: "Synthetic Player", club_name: "Synthetic Club", frame_color: "gold", frame_url: "frame", card_template_url: "template", avatar_image_url: "avatar", art_status: "ready", card_status: "published", sale_status: "available", published_at: null, reserved_at: null, sold_at: null, updated_at: "2026-10-27T09:00:00Z" }] : [],
          touchline_card_publications: [], football_players: [],
        };
        return Promise.resolve({ data: data[table] ?? [], count: filled && table === "touchline_card_publications" ? 1 : (data[table] as unknown[] ?? []).length, error: null }).then(resolve, reject);
      },
    };
    return chain;
  };
  runInNewContext(pages[page], { exports: pageExports, process: { env: { TOUCHLINE_OWNER_EMAILS: ownerEmail } }, Intl, URL, Date,
    require(name: string) {
      if (name === "react/jsx-runtime") return jsx;
      if (name === "next/link") return link;
      if (name === "next/navigation") return { notFound: () => { throw new Error("ADMIN_NOT_FOUND"); } };
      if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (name === "@/components/arena-admin-ui") return ui;
      if (name === "@/components/admin-promotions-actions" || name === "@/components/admin-card-inventory-actions") return new Proxy({}, { get: (_t, key) => (props: Props) => React.createElement("button", { "data-action": String(key), "data-locale": props?.locale }, String(key)) });
      if (name === "@/lib/admin/owner") return { isOwnerEmail: (email: string | null | undefined) => (ownerExports.isOwnerEmail as (email?: string | null) => boolean)(email) };
      if (name === "@/lib/supabase/server") return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mode === "denied" ? { id: "member", email: "member@example.test" } : { id: "owner", email: ownerEmail } } }) } }) };
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => ({ from: query, auth: { admin: { listUsers: async () => mode === "rejected" ? Promise.reject(new Error("PRIVATE_REVIEW_ERROR")) : ({ data: { users: mode === "filled" ? [{ id: "u1", email: "owner@example.test" }] : [] }, error: mode === "error" ? { message: "PRIVATE_REVIEW_ERROR" } : null }) } } }) };
      if (name === "@/lib/touchlineArena/auth-i18n") return auth;
      if (name === "@/lib/touchlineArena/card-publication-read-model") return { loadTouchlinePublishedCardPresentations: async () => new Map() };
      throw new Error(`Unmocked dependency ${name}`);
    },
  });
  const Page = pageExports.default as (p: { searchParams: Promise<Record<string, string>> }) => Promise<React.ReactNode>;
  return { render: async (lang = "en-GB") => renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ lang }) })) };
}

for (const page of ["analytics", "promotions", "cards"] as const) {
  for (const mode of ["filled", "empty", "error", "rejected"] as const) {
    test(`${page} SSR ${mode} is safe and rendered`, async () => {
      const html = await fixture(page, mode).render("en-GB");
      assert.doesNotMatch(html, /PRIVATE_REVIEW_ERROR/);
      if (mode === "error" || mode === "rejected") assert.match(html, /temporarily unavailable|unavailable|could not be reconciled/i);
      if (mode === "empty") assert.match(html, /No activity collected yet|No promotions yet|No cards in inventory yet/);
      if (mode === "filled") assert.match(html, /Synthetic|ClubOwner Activity|Promotions|Card Inventory/);
    });
  }
  test(`${page} SSR denied is not exposed`, async () => {
    await assert.rejects(() => fixture(page, "denied").render("en-GB"), /ADMIN_NOT_FOUND/);
  });
  test(`${page} SSR localizes Portuguese`, async () => {
    const html = await fixture(page, "filled").render("pt-BR");
    assert.match(html, /Área do proprietário|Admin do proprietário|Promoções|Inventário de cards|Nenhuma atividade coletada ainda|Saúde do inventário/);
    if (page === "promotions") assert.match(html, /Promoções|Créditos|Idempotência|chaves únicas/);
    if (page === "cards") assert.match(html, /Inventário legado|Elegíveis publicamente|Reservados|Vendidos|Revisão necessária|Admin do proprietário/);
  });
}

test("missing card inventory schema is localized without exposing private database errors", async () => {
  const pt = await fixture("cards", "missing-schema").render("pt-BR");
  const en = await fixture("cards", "missing-schema").render("en-GB");
  assert.match(pt, /O inventário protegido ainda não foi configurado/);
  assert.match(en, /The protected card inventory is not configured/);
  for (const html of [pt, en]) assert.doesNotMatch(html, /PRIVATE_REVIEW_ERROR|schema cache|018_touchline/);
});
