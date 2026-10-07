import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const source = readFileSync(new URL("../components/touchline/SiteLocaleReleaseContext.tsx", import.meta.url), "utf8");
test("client release context defaults closed and excludes administrative paths", () => {
  for (const enabled of [false, true]) for (const pathname of ["/live", "/notifications", "/admin", "/admin/login", "/visual-qa", "/visual-qa/cards"]) {
    const exports = {} as { useSiteLocaleRelease: () => boolean };
    const modules: Record<string, unknown> = {
      "react/jsx-runtime": jsx,
      react: { createContext(value: boolean) { assert.equal(value, false); return {}; }, useContext() { return enabled; } },
      "next/navigation": { usePathname() { return pathname; } },
    };
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      exports, require(name: string) { assert.ok(name in modules); return modules[name]; },
    });
    assert.equal(exports.useSiteLocaleRelease(), enabled && ["/live", "/notifications"].includes(pathname));
  }
});
