import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { isTouchLineSiteLocalesEnabled } from "../lib/touchlineArena/site-locales-release.ts";

const pages = ["intro", "live", "clubowner", "rankings", "my-club", "fantasy", "arena", "touchline-clubs", "touchline-clubs/[club]", "touchline-coaches/[coach]", "touchline-players/[player]", "touchline-player-card-rankings", "(app)/football-search", "(app)/inbox", "notifications/rehearsal"];

test("exported public page and metadata wrappers pass the trusted release policy, never query flags", async () => {
  const previous = process.env.TOUCHLINE_SITE_LOCALES_ENABLED;
  try {
    for (const page of pages) {
      const text = readFileSync(new URL(`../app/${page}/page.tsx`, import.meta.url), "utf8");
      const source = ts.createSourceFile(page, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const wrappers = source.statements.filter(ts.isFunctionDeclaration).filter(node => node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) && /return (?:render\w+|generate\w+Metadata|rehearsalMetadata)\(props/.test(node.getText(source)));
      assert.ok(wrappers.length, page);
      for (const wrapper of wrappers) for (const setting of [undefined, "false", "true"]) {
        if (setting === undefined) delete process.env.TOUCHLINE_SITE_LOCALES_ENABLED;
        else process.env.TOUCHLINE_SITE_LOCALES_ENABLED = setting;
        const input = { searchParams: Promise.resolve({ lang: "ar-SA", siteLocalesEnabled: "true" }) };
        const seam = wrapper.getText(source).match(/return (\w+)\(props/)![1];
        const exportedName = wrapper.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) ? "default" : wrapper.name!.text;
        const exports: Record<string, (props: unknown) => Promise<unknown>> = {};
        let received: unknown[] | undefined;
        runInNewContext(ts.transpileModule(wrapper.getText(source), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
          exports, isTouchLineSiteLocalesEnabled,
          [seam]: (...args: unknown[]) => { received = args; return null; },
        });
        await exports[exportedName](input);
        assert.equal(received?.[0], input);
        assert.equal(received?.[1], setting === "true", `${page}:${exportedName}:${setting}`);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.TOUCHLINE_SITE_LOCALES_ENABLED;
    else process.env.TOUCHLINE_SITE_LOCALES_ENABLED = previous;
  }
});
