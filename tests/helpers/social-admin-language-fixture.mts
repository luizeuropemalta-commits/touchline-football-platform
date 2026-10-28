import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as language from "../../lib/touchlineArena/social-admin-language.ts";
import * as access from "../../lib/touchlineArena/auth-access.ts";
import * as health from "../../lib/touchlineArena/social-draft-executor-health.ts";
import * as icons from "lucide-react";
import { cn } from "../../lib/utils.ts";

const compile = (path: string) => ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const paths = ["app/(app)/admin/social-publications/page.tsx", "components/arena-admin-ui.tsx", "lib/admin/owner.ts",
  ...["DeliveryControl", "DraftReview", "TemplatePolicy"].map(name => `components/touchline/admin/TouchlineSocial${name}Actions.tsx`)];
const compiled = new Map(paths.map(path => [path, compile(path)]));
const ownerEmail = "social-owner@example.test";
type Result = { data: unknown; error: { message: string } | null; count?: number };
type Options = {
  user?: { email: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null;
  configured?: boolean;
  drafts?: Record<string, unknown>[];
  error?: string;
  invalidDates?: boolean;
  templateState?: string;
};

export const socialDraft = { id: "draft-test", fixture_provider_id: "123", event_provider_id: "456", team_provider_id: "14",
  scope_provider_id: "4", subject_player_provider_id: "99", content_type: "LINEUP", placement: "FEED", locale: "en-GB", revision: 3,
  width: 1080, height: 1350, caption: "HISTORICAL_CAPTION_UNCHANGED", artifact_storage_bucket: "private-fixture", artifact_storage_key: "art.png",
  artifact_checksum: "sha256:a", caption_checksum: "sha256:b", manifest_checksum: "sha256:c", source_revision_checksum: "sha256:d",
  approval_state: "APPROVAL_REQUIRED", artwork_approval_state: "APPROVAL_REQUIRED", caption_approval_state: "APPROVAL_REQUIRED", created_at: "invalid" };

// Real page, action components, owner/access policy, health and UI. Only transport,
// storage signing and Next navigation are replaced. Never loads an SDK or session.
export function socialAdminFixture(options: Options = {}) {
  const calls: unknown[] = [];
  const date = options.invalidDates ? "invalid" : new Date(Date.now() - 1000).toISOString();
  const cycle = { lease_name: "lineup-draft-watcher", lease_token: null, lease_expires_at: null, next_eligible_at: date,
    consecutive_failures: 0, last_started_at: date, last_completed_at: date, last_outcome: "SUCCESS", timeout_recovery_count: 0 };
  const cycles = ["SCHEDULER", "RUNNER"].map(component => ({ ...cycle, component }));
  const drafts = options.drafts ?? [socialDraft];
  const blockedReview = { id: "review-test", fixture_provider_id: "123", team_provider_id: "14", template_version: "EXACT_VERSION",
    review_state: "REVIEW_REQUIRED", reason_code: "SOURCE_CHECK_PENDING", first_observed_at: date, last_checked_at: date, generated_draft_id: null };
  function result(table: string): Result {
    if (options.error) return { data: null, error: { message: options.error } };
    if (table === "touchline_social_publication_drafts") return { data: drafts, error: null, count: drafts.length ? 151 : 0 };
    if (table === "touchline_social_generation_reviews") return { data: [blockedReview], error: null, count: 151 };
    if (table === "touchline_social_generation_cycles") return { data: cycle, error: null };
    if (table.endsWith("executor_cycles")) return { data: cycles, error: null };
    return { data: [{ id: "job-test", fixture_provider_id: "123", team_provider_id: "14", job_state: "REVIEW_REQUIRED", reason_code: "SOURCE_CHECK_PENDING", attempt_count: 1 }], error: null, count: 1 };
  }
  function query(table: string) {
    assert.match(table, /^touchline_social_/);
    calls.push(["from", table]);
    const builder = Object.fromEntries(["select", "order", "range", "in", "eq", "returns", "maybeSingle"].map(method => [method, (...args: unknown[]) => { calls.push([method, ...args]); return builder; }])) as Record<string, unknown>;
    builder.then = (yes: (value: Result) => unknown, no: (error: unknown) => unknown) => Promise.resolve(result(table)).then(yes, no);
    return builder;
  }
  const cache = new Map<string, Record<string, unknown>>();
  function load(path: string): Record<string, unknown> {
    if (cache.has(path)) return cache.get(path)!;
    assert.ok(compiled.has(path), `Unexpected product dependency: ${path}`);
    const exports: Record<string, unknown> = {}; cache.set(path, exports);
    runInNewContext(compiled.get(path)!, { exports, Intl, URL, Error, process: { env: { TOUCHLINE_OWNER_EMAILS: ownerEmail } },
      fetch: () => assert.fail("No real fetch is permitted in the social Admin fixture"),
      require(name: string) {
        if (name === "react") return React;
        if (name === "react/jsx-runtime") return jsx;
        if (name === "lucide-react") return icons;
        if (name === "@/lib/utils") return { cn };
        if (name === "next/link") return { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) };
        if (name === "next/navigation") return { notFound: () => { calls.push(["notFound"]); throw new Error("SOCIAL_NOT_FOUND"); }, useRouter: () => ({ refresh: () => assert.fail("No refresh during SSR") }) };
        if (name === "@/lib/touchlineArena/social-admin-language") return language;
        if (name === "@/lib/touchlineArena/auth-access") return access;
        if (name === "@/lib/touchlineArena/social-draft-executor-health") return health;
        if (name === "@/lib/supabase/server") return { createClient: async () => options.configured === false ? null : { auth: { getUser: async () => {
          calls.push(["getUser"]); return { data: { user: options.user === undefined ? { email: ownerEmail, app_metadata: { touchline_arena_access_v1: true } } : options.user } };
        } } } };
        if (name === "@/lib/supabase/admin") return { createAdminClient: () => options.configured === false ? null : {
          from: query,
          rpc: async (name: string) => {
            assert.ok(["touchline_social_045_admin_status", "touchline_social_046_admin_status"].includes(name)); calls.push(["rpc", name]);
            if (options.error) return { data: null, error: { message: options.error } };
            return { error: null, data: name.endsWith("045_admin_status") ? { cycles, jobs: [], postCount: 1, posts: [{ id: "post-test", content_type: "FULL_TIME", published_at: date, expires_at: date }], tombstoneCount: 2 } : {
              outboundMode: "DISABLED", templateCount: 1, readyCount: 0, deliveryUnknownCount: 1,
              controls: [{ scope_key: "GLOBAL", kill_switch_engaged: true, daily_quota: null, minimum_gap_seconds: null, outbound_mode: "DISABLED" }],
              templates: [{ id: "template-test", content_type: "LINEUP", placement: "FEED", locale: "en-GB", width: 1080, height: 1350,
                template_version: "EXACT_TEMPLATE_VERSION", template_identity_checksum: "sha256:a", visual_template_checksum: "sha256:b", base_copy_checksum: "sha256:c",
                state: options.templateState ?? "REVOKED", artwork_template_approval_state: "TEMPLATE_APPROVAL_REQUIRED", caption_template_approval_state: "TEMPLATE_APPROVAL_REQUIRED", updated_at: date }],
            } };
          },
          storage: { from: (bucket: string) => ({ createSignedUrl: async (key: string, seconds: number) => {
            calls.push(["sign", bucket, key, seconds]); return { data: { signedUrl: "https://social-fixture.invalid/art.png" } };
          } }) },
        } };
        if (name.startsWith("@/")) return load(`${name.slice(2)}${name === "@/lib/admin/owner" ? ".ts" : ".tsx"}`);
        throw new Error(`Unexpected import: ${name}`);
      },
    });
    return exports;
  }
  const Page = load(paths[0]).default as (props: { searchParams: Promise<Record<string, string | string[]>> }) => Promise<React.ReactNode>;
  return { calls, render: async (query: Record<string, string | string[]> = {}) => renderToStaticMarkup(await Page({ searchParams: Promise.resolve(query) })) };
}
