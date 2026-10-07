import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as copy from "../lib/touchlineArena/auth-i18n.ts";

const source = ts.transpileModule(readFileSync(new URL("../components/reset-password-form.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function render(locale: string, enabled: boolean, status: string) {
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    react: { useEffect() {}, useState(initial: unknown) { return [initial === "checking" ? status : initial, () => {}]; } },
    "next/link": { default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) },
    "lucide-react": { ArrowRight: () => null, Eye: () => null, EyeOff: () => null, Loader2: () => null },
    "./ui": { Button: () => null, Input: () => null },
    "@/lib/touchlineArena/auth-i18n": copy,
  };
  const exports = {} as { ResetPasswordForm: React.ComponentType<Record<string, unknown>> };
  runInNewContext(source, { exports, require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  return renderToStaticMarkup(React.createElement(exports.ResetPasswordForm, { locale, siteLocalesEnabled: enabled }));
}

test("recovery terminal states preserve released locale, without widening default-off navigation", () => {
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    for (const enabled of [false, true]) {
      const effective = enabled ? locale : copy.normalizeTouchLineAuthLocale(locale);
      const messages = copy.getTouchLineAuthCopy(effective, enabled).form;
      const invalid = render(locale, enabled, "invalid");
      assert.ok(invalid.includes(`href="/forgot-password?lang=${effective}"`));
      assert.ok(invalid.includes(messages.recoveryInvalid));
      const complete = render(locale, enabled, "complete");
      assert.ok(complete.includes(`href="/intro?lang=${effective}"`));
      assert.ok(complete.includes(messages.recoveryUpdated));
    }
  }
});
