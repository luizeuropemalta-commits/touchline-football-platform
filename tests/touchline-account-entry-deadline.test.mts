import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as authCopy from "../lib/touchlineArena/auth-i18n.ts";
import * as catalogue from "../lib/touchlineArena/catalogue-locale.ts";

const source = readFileSync(new URL("../app/account/page.tsx", import.meta.url), "utf8");
const deadlineSource = readFileSync(new URL("../lib/touchlineArena/server-read-deadline.ts", import.meta.url), "utf8");
const compile = (value: string) => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function harness(createClient: () => Promise<unknown>) {
  let expire: (() => void) | undefined;
  let clearCount = 0;
  const deadlineExports = {};
  runInNewContext(compile(deadlineSource), {
    exports: deadlineExports,
    setTimeout: (callback: () => void, delay: number) => { assert.equal(delay, 8000); expire = callback; return 1; },
    clearTimeout: () => { clearCount++; },
  });
  const targets: string[] = [];
  const modules: Record<string, unknown> = {
    "next/navigation": { redirect: (href: string) => { targets.push(href); throw new Error("NEXT_REDIRECT"); } },
    "@supabase/supabase-js": { AuthSessionMissingError: class extends Error {} },
    "@/lib/supabase/server": { createClient },
    "@/lib/admin/owner": { isOwnerEmail: () => false },
    "@/lib/touchlineArena/server-read-deadline": deadlineExports,
    "@/lib/touchlineArena/catalogue-locale": catalogue,
    "@/lib/touchlineArena/site-locales-release": { isTouchLineSiteLocalesEnabled: () => false },
    "@/lib/touchlineArena/auth-i18n": authCopy,
  };
  const exports = {} as { default: (props: { searchParams: Promise<{ lang: string }> }) => Promise<never> };
  runInNewContext(compile(source), { exports, require: (name: string) => { assert.ok(name in modules); return modules[name]; } });
  const settled = assert.rejects(exports.default({ searchParams: Promise.resolve({ lang: "pt-BR" }) }), /NEXT_REDIRECT/);
  return { settled, targets, expire: () => { assert.ok(expire, "deadline armed before upstream settles"); expire(); }, clearCount: () => clearCount };
}

test("account deadline includes stalled setup and never starts auth after the timeout", async () => {
  let release!: (client: unknown) => void;
  let reads = 0;
  const h = harness(() => new Promise(resolve => { release = resolve; }));
  await flush();
  h.expire();
  await h.settled;
  assert.equal(new URL(h.targets[0], "https://test.local").searchParams.get("error"), "auth_unavailable");
  release({ auth: { getUser: async () => { reads++; return { data: { user: { email: "customer@test.local" } }, error: null }; } } });
  await flush();
  assert.equal(reads, 0);
  assert.equal(h.targets.length, 1);
  assert.equal(h.clearCount(), 1);
});

test("account auth has the same budget and a late response cannot redirect a second time", async () => {
  let finish!: (value: unknown) => void;
  let reads = 0;
  const h = harness(async () => ({ auth: { getUser: () => { reads++; return new Promise(resolve => { finish = resolve; }); } } }));
  await flush();
  assert.equal(reads, 1);
  h.expire();
  await h.settled;
  finish({ data: { user: { email: "customer@test.local" } }, error: null });
  await flush();
  assert.equal(h.targets.length, 1);
  assert.match(h.targets[0], /error=auth_unavailable/);
  assert.equal(h.clearCount(), 1);
});

test("client setup failure is sanitized and the deadline is cleared", async () => {
  const h = harness(async () => { throw new Error("private setup details"); });
  await h.settled;
  await flush();
  assert.equal(h.targets.length, 1);
  assert.match(h.targets[0], /error=auth_unavailable/);
  assert.doesNotMatch(h.targets[0], /private|setup/);
  assert.equal(h.clearCount(), 1);
});
