import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import { AuthSessionMissingError } from "@supabase/supabase-js";

const source = readFileSync(new URL("../app/(app)/layout.tsx", import.meta.url), "utf8");
const redirectedTo = (value: unknown, href: string) => typeof value === "object" && value !== null && "href" in value && value.href === href;
function fixture(result: unknown, options: { missingClient?: boolean; rejection?: Error } = {}) {
  let reads = 0;
  const ownerEmails: unknown[] = [];
  const Shell = () => null;
  const redirects: string[] = [];
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/navigation": { redirect(href: string) { redirects.push(href); throw Object.assign(Error("redirect"), { href }); } },
    "@supabase/supabase-js": { AuthSessionMissingError },
    "@/components/arena-admin-shell": { ArenaAdminShell: Shell },
    "@/lib/admin/owner": { isOwnerEmail(email: unknown) { ownerEmails.push(email); return email === "owner@example.test"; } },
    "@/lib/supabase/server": { createClient: async () => options.missingClient ? null : { auth: { getUser: async () => { reads++; if (options.rejection) throw options.rejection; return result; } } } },
  };
  const exports = {} as {default: (props: {children: React.ReactNode}) => Promise<React.ReactElement<Record<string, unknown>>>};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require(id: string) { assert.ok(Object.hasOwn(modules, id), id); return modules[id]; },
  });
  return { page: exports.default, Shell, redirects, ownerEmails, reads: () => reads };
}

test("protected layout rejects real auth errors before identity/owner presentation using one lookup", async () => {
  const user = { id: "account", email: "owner@example.test", user_metadata: { full_name: "Private Owner" } };
  for (const result of [
    { data: { user }, error: Error("private provider detail") },
    { data: { user }, error: new AuthSessionMissingError() },
    { data: { user: null }, error: Error("provider unavailable") },
    { data: { user: null }, error: { name: "AuthSessionMissingError" } },
    { data: { user } },
  ]) {
    const f = fixture(result);
    await assert.rejects(f.page({ children: "private child" }), (error: unknown) => redirectedTo(error, "/login?error=auth_unavailable"));
    assert.equal(f.reads(), 1);
    assert.deepEqual(f.ownerEmails, []);
    assert.deepEqual(f.redirects, ["/login?error=auth_unavailable"]);
  }
  const rejected = fixture(null, { rejection: Error("network") });
  await assert.rejects(rejected.page({ children: "child" }), (error: unknown) => redirectedTo(error, "/login?error=auth_unavailable"));
  assert.equal(rejected.reads(), 1);
  assert.deepEqual(rejected.ownerEmails, []);
});

test("canonical missing session and absent user keep existing login destination", async () => {
  for (const error of [null, new AuthSessionMissingError()]) {
    const f = fixture({ data: { user: null }, error });
    await assert.rejects(f.page({ children: "child" }), (caught: unknown) => redirectedTo(caught, "/login"));
    assert.equal(f.reads(), 1);
    assert.deepEqual(f.ownerEmails, []);
  }
  const unavailable = fixture(null, { missingClient: true });
  await assert.rejects(unavailable.page({ children: "child" }), (caught: unknown) => redirectedTo(caught, "/login"));
  assert.equal(unavailable.reads(), 0);
});

test("verified customer and owner keep names, children and existing authority; no draft activation", async () => {
  for (const email of ["customer@example.test", "owner@example.test"]) {
    const child = React.createElement("main", {}, "private child");
    const f = fixture({ data: { user: { id: "account", email, user_metadata: { full_name: "  Official $& <name>  ", is_owner: true } } }, error: null });
    const tree = await f.page({ children: child });
    assert.equal(tree.type, f.Shell);
    assert.equal(tree.props.profileName, "Official $& <name>");
    assert.equal(tree.props.profileEmail, email);
    assert.equal(tree.props.isOwner, email === "owner@example.test");
    assert.equal(tree.props.children, child);
    assert.equal(tree.props.draftLocalesEnabled, undefined);
    assert.equal(f.reads(), 1);
    assert.deepEqual(f.ownerEmails, [email]);
    assert.deepEqual(f.redirects, []);
  }
});
