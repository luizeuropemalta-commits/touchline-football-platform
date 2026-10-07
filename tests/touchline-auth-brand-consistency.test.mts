import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import * as auth from "../lib/touchlineArena/auth-i18n.ts";

type Element = React.ReactElement<Record<string, unknown>>;
function marker() { return null; }
const Logo = () => null;
const Controls = () => null;
const Form = () => null;
const Reset = () => null;
const Link = () => null;
function compile(path: string, modules: Record<string, unknown>) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports: Record<string, (props: Record<string, unknown>) => Element | Promise<Element>> = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, process: { env: {} }, require(name: string) {
    if (name === "react/jsx-runtime") return jsxRuntime;
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } });
  return exports;
}
function find(tree: unknown, type: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(item => find(item, type));
  if (!React.isValidElement<Record<string, unknown>>(tree)) return [];
  return [...(tree.type === type ? [tree] : []), ...find(tree.props.children, type)];
}
const Layout = compile("../components/auth-layout.tsx", {
  "next/link": { default: Link },
  "lucide-react": { Check: marker, Globe2: marker, Radio: marker, Trophy: marker, Users: marker, Zap: marker },
  "@/lib/touchlineArena/auth-i18n": auth,
  "./logo": { Logo }, "./auth-cinematic-media": { AuthCinematicMedia: marker },
  "./touchline/TouchlinePageControls": { default: Controls },
  "./auth-league-picker": { AuthLeaguePicker: marker },
}).AuthLayout;

for (const [route, formType, mode] of [
  ["register", Form, "register"], ["forgot-password", Form, "forgot"], ["reset-password", Reset, undefined],
] as const) {
  test(`${route} mounts the login brand through real AuthLayout without changing auth contracts`, async () => {
    const context = { mode: "account", accountId: "11111111-1111-4111-8111-111111111111" };
    let contextReads = 0;
    const Page = compile(`../app/(auth)/${route}/page.tsx`, {
      "next/link": { default: Link }, "lucide-react": { ArrowLeft: marker, FlaskConical: marker },
      "@/components/auth-layout": { AuthLayout: Layout }, "@/components/auth-form": { AuthForm: Form },
      "@/components/reset-password-form": { ResetPasswordForm: Reset },
      "@/lib/touchlineArena/auth-i18n": auth,
      "@/lib/touchlineArena/site-locales-release": compile("../lib/touchlineArena/site-locales-release.ts", {}),
      "@/lib/touchlineArena/account-locale-context-server": { loadAccountLocaleContext: async () => { contextReads += 1; return context; } },
    }).default;
    for (const requested of ["pt-BR", "en-GB", "ar-SA"]) {
      const locale = requested === "pt-BR" ? "pt-BR" : "en-GB";
      const returnTo = "/clubowner?lang=pt-BR";
      const page = await Page({ searchParams: Promise.resolve({ lang: requested, returnTo }) }) as Element;
      assert.equal(page.type, Layout);
      assert.equal(page.props.locale, locale);
      assert.equal(page.props.accountLocaleContext, context);
      assert.equal(page.props.draftLocalesEnabled, false);
      assert.equal(page.props.siteLocalesEnabled, false);
      assert.equal(page.props.showArenaHomeLink, false, "match the approved login control position without the extra header link");
      assert.equal(page.props.brandHref, undefined, "preserve shared default link");
      assert.equal(page.props.cinematic, route === "register" ? true : undefined);
      const form = find(page, formType);
      assert.equal(form.length, 1);
      assert.equal(form[0].props.locale, locale);
      assert.equal(form[0].props.mode, mode);
      assert.equal(form[0].props.returnTo, route === "reset-password" ? undefined : returnTo);
      const back = find(page, Link);
      assert.equal(back.length, 1);
      assert.equal(back[0].props.href, route === "reset-password"
        ? auth.touchLineAuthHref("/login", locale) : auth.touchLineAuthEntryHref("/login", locale, returnTo));
      const layout = await Layout(page.props);
      const logos = find(layout, Logo);
      assert.equal(logos.length, 1);
      assert.equal(logos[0].props.subtitle, "TouchLine Futebol Cards");
      assert.equal(logos[0].props.minimalMark, true);
      assert.equal(logos[0].props.officialArena, true);
      assert.equal(logos[0].props.showMark, true);
      assert.equal(logos[0].props.wordmarkClassName, "text-[clamp(26px,3.2vw,34px)]");
      assert.equal(logos[0].props.href, auth.touchLineAuthHref("/intro", locale));
      const controls = find(layout, Controls);
      assert.equal(controls.length, 1);
      assert.equal(controls[0].props.accountLocaleContext, context);
      assert.equal(controls[0].props.draftLocalesEnabled, false);
      assert.equal(controls[0].props.siteLocalesEnabled, false);
      const headers = find(layout, "header");
      assert.equal(headers.length, 1);
      assert.equal(find(headers[0], Link).length, 0, "no extra Arena link competes with the controls");
      assert.equal(find(headers[0], Logo).length, 1);
      assert.equal(find(headers[0], Controls).length, 1);
      const remainingLinks = find(layout, Link);
      assert.equal(remainingLinks.length, 1, "the form's accessible return-to-login link remains");
      assert.equal(remainingLinks[0].props.href, back[0].props.href);
    }
    assert.equal(contextReads, 3);
  });
}
