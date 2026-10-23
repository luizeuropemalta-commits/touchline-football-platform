import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import * as state from "../../lib/touchlineArena/live-presentation-state.ts";
import * as publication from "../../lib/touchlineArena/sports-publication.ts";
import * as reader from "../../lib/touchlineArena/sports-publication-reader.ts";
import * as projection from "../../lib/touchlineArena/sports-publication-live-view.ts";

/**
 * Actual browser hook, store, reader and projection under React SSR. Only
 * extensionless import resolution is adapted; no returned fixtures are mocked.
 * React must use getServerSnapshot, never subscribe or start browser work here.
 */
export function loadSportsPublicationClientForSsr() {
  const compile = (file: string, dependencies: Record<string, unknown>) => {
    const exports: Record<string, unknown> = {};
    const source = readFileSync(new URL(`../../lib/touchlineArena/${file}.ts`, import.meta.url), "utf8");
    runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText, {
      exports,
      require(name: string) {
        assert.ok(Object.hasOwn(dependencies, name), `Unexpected ${file} dependency: ${name}`);
        return dependencies[name];
      },
      fetch: () => assert.fail("SSR publication access must not fetch"),
      window: new Proxy({}, { get: () => assert.fail("SSR publication access must not use window") }),
      document: new Proxy({}, { get: () => assert.fail("SSR publication access must not use document") }),
    });
    return exports;
  };
  const store = compile("live-presentation-client-store", {
    "./live-presentation-state": state,
    "./sports-publication": publication,
  });
  return compile("sports-publication-client", {
    react: React,
    "./live-presentation-client-store": store,
    "./sports-publication-reader": reader,
    "./sports-publication-live-view": projection,
  }) as typeof import("../../lib/touchlineArena/sports-publication-client.ts");
}
