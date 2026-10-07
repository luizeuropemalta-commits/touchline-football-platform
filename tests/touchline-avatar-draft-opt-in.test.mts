import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as copy from "../lib/touchlineArena/club-owner-avatar-ui-i18n.ts";
import * as selectionContract from "../lib/touchlineArena/club-owner-avatar-selection-contract.ts";

const require = createRequire(import.meta.url);
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;

test("avatar copy opts into authored catalogues without changing default locale gates", () => {
  for (const locale of locales) {
    assert.equal(copy.getTouchlineClubOwnerAvatarUiCopy(locale, true), copy.TOUCHLINE_CLUB_OWNER_AVATAR_UI_CATALOGUES[locale]);
    const fallback = locale === "pt-BR" ? "pt-BR" : "en-GB";
    assert.equal(copy.getTouchlineClubOwnerAvatarUiCopy(locale), copy.TOUCHLINE_CLUB_OWNER_AVATAR_UI_CATALOGUES[fallback]);
    assert.equal(copy.getTouchlineClubOwnerAvatarUiCopy(locale, false), copy.getTouchlineClubOwnerAvatarUiCopy(locale));
  }
  for (const locale of [null, undefined, "", "unknown", "constructor", "__proto__"]) {
    assert.equal(copy.getTouchlineClubOwnerAvatarUiCopy(locale, true), copy.TOUCHLINE_CLUB_OWNER_AVATAR_UI_CATALOGUES["en-GB"]);
  }
});

function renderAvatar(locale: string, enabled: boolean, draftLocalesEnabled?: boolean) {
  let actionCalls = 0;
  const noAction = () => { actionCalls++; throw Error("Presentation must not invoke an avatar action"); };
  const modules: Record<string, unknown> = {
    "react": require("react"),
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/navigation": { useRouter: () => ({ refresh: noAction }) },
    "@/lib/supabase/client": { createClient: noAction },
    "@/lib/touchlineArena/club-owner-avatar-client": { createClubOwnerAvatarRecoveryClient: noAction },
    "@/lib/touchlineArena/club-owner-avatar-ui-i18n": copy,
    "@/lib/touchlineArena/club-owner-avatar-selection-contract": selectionContract,
    "./ClubOwnerAvatarUploadSelection": { default: () => { throw Error("Closed selection gate must not mount upload UI"); } },
  };
  const exports: { default?: (props: Record<string, unknown>) => ReactNode } = {};
  const source = readFileSync(new URL("../components/touchline/ClubOwnerAvatarControl.tsx", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require(name: string) {
    if (name in modules) return modules[name];
    if (name.endsWith(".css")) return { default: {} };
    throw Error(`Unexpected avatar dependency: ${name}`);
  } });
  assert.ok(exports.default);
  // Server rendering intentionally does not run the authentication/recovery effects.
  const html = renderToStaticMarkup(createElement(exports.default, {
    accountId: "test-account", locale, draftLocalesEnabled,
    context: enabled ? { accountId: "test-account", uploadAllowed: true, canUpload: false, readyForSelection: false } : null,
  }, createElement("span", null, "Official Owner")));
  assert.equal(actionCalls, 0);
  return html;
}

test("actual avatar presentation propagates draft copy and keeps initial actions disabled", () => {
  const escaped = (value: string) => renderToStaticMarkup(createElement("span", null, value)).slice(6, -7);
  for (const locale of locales) {
    for (const enabled of [false, true]) {
      const html = renderAvatar(locale, enabled, true);
      const dictionary = copy.TOUCHLINE_CLUB_OWNER_AVATAR_UI_CATALOGUES[locale];
      assert.ok(html.includes(escaped(enabled ? dictionary.blocked : dictionary.off)), locale);
      assert.ok(html.includes(`aria-label="${escaped(dictionary.open)}"`), locale);
      assert.ok(html.includes('disabled=""'));
      assert.ok(html.includes("Official Owner"));
      assert.ok(!html.includes('data-avatar-action="observe"'));
      assert.ok(!html.includes('data-avatar-action="confirm-fence"'));
      assert.ok(!html.includes('type="file"'));
      if (locale === "en-GB" || locale === "pt-BR") {
        assert.equal(html, renderAvatar(locale, enabled));
      } else {
        assert.ok(renderAvatar(locale, enabled).includes(escaped(enabled
          ? copy.TOUCHLINE_CLUB_OWNER_AVATAR_UI_CATALOGUES["en-GB"].blocked
          : copy.TOUCHLINE_CLUB_OWNER_AVATAR_UI_CATALOGUES["en-GB"].off)));
      }
    }
  }
});
