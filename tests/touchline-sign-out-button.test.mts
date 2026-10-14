import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { getTouchlineArenaShellCopy } from "../lib/touchlineArena/arena-shell-i18n.ts";
import { touchLineAuthHref } from "../lib/touchlineArena/auth-i18n.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../components/touchline/TouchlineSignOutButton.tsx", import.meta.url), "utf8");
type TestNode = { type: unknown; props: { children: TestNode[]; onClick: () => Promise<void>; disabled: boolean; role?: string } };
function mount(client: unknown) {
  const states: unknown[] = []; let cursor = 0;
  const ref = { current: false }; const destinations: string[] = [];
  const exports = {} as { default: (props: { locale: string; draftLocalesEnabled: boolean }) => TestNode };
  const jsx = (type: unknown, props: TestNode["props"]) => ({ type, props });
  const modules: Record<string, unknown> = {
    react: { useRef: () => ref, useState: (initial: unknown) => {
      const i = cursor++; if (!(i in states)) states[i] = initial;
      return [states[i], (next: unknown) => { states[i] = next; }];
    } },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "lucide-react": { LogOut: "svg" },
    "@/lib/supabase/client": { createClient: () => client },
    "@/lib/touchlineArena/arena-shell-i18n": { getTouchlineArenaShellCopy },
    "@/lib/touchlineArena/auth-i18n": { touchLineAuthHref },
    "./TouchlineGlobalNavigation.module.css": { default: { link: "canonical-link" } },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; }, window: { location: { replace: (url: string) => destinations.push(url) } } });
  return { destinations, render: (locale = "pt-BR") => { cursor = 0; return exports.default({ locale, draftLocalesEnabled: true }); } };
}

test("customer header mounts the canonical local-session sign-out control", () => {
  const page = readFileSync(new URL("../app/clubowner/page.tsx", import.meta.url), "utf8");
  assert.match(page, /brandAccessory=\{<TouchlineSignOutButton/);
  assert.doesNotMatch(source, /localStorage\.clear|document\.cookie|scope: "global"/);
});

test("sign-out revokes only the local session, blocks double-clicks and redirects to login", async () => {
  let complete!: (result: { error: null }) => void; const calls: unknown[] = [];
  const instance = mount({ auth: { signOut: (options: unknown) => { calls.push(options); return new Promise(resolve => { complete = resolve; }); } } });
  const button = instance.render().props.children[0];
  assert.equal(button.props.children[1], "Sair da conta");
  const pending = button.props.onClick(); await button.props.onClick();
  assert.equal(calls.length, 1); assert.equal((calls[0] as { scope: string }).scope, "local");
  assert.equal(instance.render().props.children[0].props.disabled, true);
  complete({ error: null }); await pending;
  assert.deepEqual(instance.destinations, [touchLineAuthHref("/login", "pt-BR", true)]);
});

for (const mode of ["missing", "error", "throw"]) test(`sign-out ${mode} stays on page with safe error and permits retry`, async () => {
  const instance = mount(mode === "missing" ? null : { auth: { signOut: async () => {
    if (mode === "throw") throw new Error("private provider diagnostic");
    return { error: new Error("private provider diagnostic") };
  } } });
  await instance.render().props.children[0].props.onClick();
  const children = instance.render().props.children;
  assert.equal(children[0].props.disabled, false);
  assert.equal(children[1].props.role, "alert");
  assert.equal(children[1].props.children, getTouchlineArenaShellCopy("pt-BR").authUnavailable);
  assert.deepEqual(instance.destinations, []);
});

test("all eight language labels remain available", () => {
  const instance = mount(null);
  for (const locale of ["en-GB", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    assert.equal(instance.render(locale).props.children[0].props.children[1], getTouchlineArenaShellCopy(locale, true).signOut);
  }
});
