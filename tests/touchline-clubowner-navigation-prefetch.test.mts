import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as navigation from "../lib/touchlineArena/global-navigation.ts";
import * as rootLocale from "../lib/touchlineArena/root-locale.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as copy from "../lib/touchlineArena/navigation-i18n.ts";

const native = createRequire(import.meta.url);
const Link = Symbol("NextLink");
type Element = { type: unknown; props: Record<string, unknown> };
const exports: { default?: (props: Record<string, unknown>) => Element } = {};
const source = readFileSync(new URL("../components/touchline/TouchlineGlobalNavigation.tsx", import.meta.url), "utf8");
runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText, { exports, require: (name: string) => {
  if (name === "react/jsx-runtime") return native(name);
  if (name === "next/link") return { __esModule: true, default: Link };
  if (name.endsWith("global-navigation")) return navigation;
  if (name.endsWith("root-locale")) return rootLocale;
  if (name.endsWith("catalogue-locale")) return catalogueLocale;
  if (name.endsWith("navigation-i18n")) return copy;
  if (name.endsWith(".css")) return { __esModule: true, default: {} };
  if (name === "lucide-react") return new Proxy({}, { get: () => "svg" });
  if (name.endsWith("auth-ambient-audio")) return { AuthAmbientAudio: "audio-control" };
  if (name.endsWith("TouchlineNavigationLabel")) return { __esModule: true, default: "navigation-label" };
  throw Error(`Unexpected import ${name}`);
} });

function links(element: unknown): Element[] {
  if (!element || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap(links);
  const node = element as Element;
  if (typeof node.type === "function") return links(node.type(node.props));
  return [...(node.type === Link ? [node] : []), ...links(node.props?.children)];
}

test("ClubOwner prepares its full destination from every shared return route, without preloading other links", () => {
  for (const surface of ["public", "authenticated"]) {
    for (const currentRoute of ["clubHub", "clubProfile", "live", "rankings", "playerProfile", "coachProfile"]) {
      for (const locale of ["pt-BR", "en-GB", "ar-SA"]) {
        const rendered = links(exports.default!({ surface, currentRoute, locale, draftLocalesEnabled: true }));
        const owner = rendered.filter(node => String(node.props.href).startsWith("/clubowner?"));
        assert.equal(owner.length, 1);
        assert.equal(owner[0].props.href, `/clubowner?lang=${locale}`);
        assert.equal(owner[0].props.prefetch, true, `${surface}/${currentRoute}/${locale}`);
        for (const node of rendered.filter(node => node !== owner[0])) assert.equal(node.props.prefetch, undefined);
      }
    }
  }
});

test("Admin keeps its existing destination and prefetch policy; gated locales stay gated", () => {
  const admin = links(exports.default!({ surface: "auth", currentRoute: "rankings", locale: "pt-BR" }));
  assert.equal(admin[0].props.href, "/admin?lang=pt-BR");
  assert.equal(admin[0].props.prefetch, undefined);
  const publicLinks = links(exports.default!({ surface: "public", currentRoute: "live", locale: "ar-SA" }));
  assert.equal(publicLinks[0].props.href, "/clubowner?lang=en-GB");
});
