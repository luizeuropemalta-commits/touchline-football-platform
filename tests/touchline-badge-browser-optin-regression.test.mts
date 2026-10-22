import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Install in tests/. Only read/transpile the four sources; never import them.
const families = [
  { flag: "TOUCHLINE_RUN_MATCH_CARD_BROWSER_TESTS", files: [
    ["touchline-match-card-badge-visual-browser.test.mts", 1],
    ["touchline-match-card-badge-interactions-browser.test.mts", 2],
  ] },
  { flag: "TOUCHLINE_RUN_PLAYER_AVAILABILITY_BROWSER_TESTS", files: [
    ["touchline-player-availability-visual-browser.test.mts", 1],
    ["touchline-player-availability-interactions-browser.test.mts", 2],
  ] },
] as const;

type Registration = { name: string; skip: unknown; timeout: unknown; family: string };

function inspect(env: Record<string, string>) {
  const registrations: Registration[] = [];
  let callbackInvocations = 0;
  let launchCalls = 0;
  const forbidden = () => { throw new Error("Unexpected top-level side effect"); };
  const engine = Object.freeze({ launch: () => { launchCalls++; throw new Error("Browser forbidden"); } });
  for (const family of families) {
    for (const [filename, count] of family.files) {
      const source = readFileSync(new URL(`./${filename}`, import.meta.url), "utf8");
      const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
      const localRequireDeclarations = ast.statements.flatMap(statement => ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.filter(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === "require")
        : []);
      assert.equal(localRequireDeclarations.length, filename.includes("-interactions-") ? 1 : 0);
      for (const declaration of localRequireDeclarations) {
        assert.ok(declaration.initializer && ts.isCallExpression(declaration.initializer)
          && ts.isIdentifier(declaration.initializer.expression)
          && declaration.initializer.expression.text === "createRequire", "review local require binding before transforming");
      }
      const declarations = ast.statements.filter((node): node is ts.ExpressionStatement =>
        ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "test");
      assert.equal(declarations.length, count, `${filename}: all test registrations accounted for`);
      const transformed = ts.transform(ast, [context => root => {
        const visit: ts.Visitor = node => {
          // These four reviewed sources have one local `require` binding
          // (createRequire) in each interactions file, with references only
          // inside its harness. Rename source identifiers before CJS emit:
          // generated import require() must retain the closed VM loader and
          // must not hit the local binding's temporal dead zone. Embedded
          // harness strings are untouched, and callbacks are replaced below.
          if (localRequireDeclarations.length === 1 && ts.isIdentifier(node) && node.text === "require") {
            return ts.factory.createIdentifier("__fixtureRequire");
          }
          if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "test") {
            const args = [...node.arguments];
            const callback = args.at(-1);
            assert.ok(callback && ts.isArrowFunction(callback), `${filename}: expected inline callback`);
            // Substitute only the callback, retaining real names/options/gates.
            // Its sentinel proves the capture harness never invokes test bodies.
            args[args.length - 1] = ts.factory.createIdentifier("__forbiddenCallback");
            return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, args);
          }
          return ts.visitEachChild(node, visit, context);
        };
        return ts.visitNode(root, visit) as ts.SourceFile;
      }]);
      const transformedSource = ts.createPrinter().printFile(transformed.transformed[0] as ts.SourceFile);
      transformed.dispose();
      // CJS cannot evaluate import.meta; these sources only pass its URL to
      // createRequire at top level. Replace that syntax using AST, not regex.
      const parsed = ts.createSourceFile(filename, transformedSource, ts.ScriptTarget.Latest, true);
      const metaTransform = ts.transform(parsed, [context => root => {
        const visit: ts.Visitor = node => ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword
          ? ts.factory.createIdentifier("__importMeta") : ts.visitEachChild(node, visit, context);
        return ts.visitNode(root, visit) as ts.SourceFile;
      }]);
      const text = ts.createPrinter().printFile(metaTransform.transformed[0] as ts.SourceFile);
      metaTransform.dispose();
      const code = ts.transpileModule(text, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      } }).outputText;
      const start = registrations.length;
      const capture = (name: string, options: { skip?: unknown; timeout?: unknown }, callback: unknown) => {
        assert.equal(typeof name, "string");
        assert.equal(typeof options, "object", `${filename}: explicit options required`);
        assert.equal(typeof callback, "function");
        registrations.push({ name, skip: options.skip, timeout: options.timeout, family: family.flag });
      };
      const fakeRequire = Object.assign(forbidden, { resolve: forbidden });
      const modules: Record<string, unknown> = {
        "node:test": Object.assign(capture, { test: capture }),
        "node:assert/strict": {},
        "node:fs": { readFileSync: forbidden },
        "node:vm": { runInNewContext: forbidden },
        "node:module": { createRequire: () => fakeRequire },
        "node:path": { dirname: forbidden, join: forbidden },
        "@playwright/test": { chromium: engine, webkit: engine, expect: forbidden },
        react: {}, "react-dom/server": { renderToStaticMarkup: forbidden },
        "react/jsx-runtime": {}, typescript: {},
        "../lib/touchlineFantasy/match-card-i18n.ts": { matchCardLabel: forbidden },
        "../lib/touchlineArena/player-availability-badge.ts": {
          resolvePlayerAvailabilityBadge: forbidden, playerAvailabilityBadgeLabel: forbidden,
        },
      };
      runInNewContext(code, {
        exports: {}, process: { env: Object.freeze({ ...env }) },
        __importMeta: { url: "file:///synthetic/test.mts" },
        __forbiddenCallback: () => { callbackInvocations++; throw new Error("Test callback forbidden"); },
        require: (name: string) => {
          assert.ok(Object.hasOwn(modules, name), `Unreviewed import: ${name}`);
          return modules[name];
        },
      }, { timeout: 1000 });
      assert.equal(registrations.length - start, count);
    }
  }
  assert.equal(registrations.length, 6);
  assert.equal(callbackInvocations, 0);
  assert.equal(launchCalls, 0);
  for (const row of registrations) {
    assert.equal(row.timeout, row.name.startsWith("hydrated ") ? 120_000 : undefined, row.name);
  }
  return registrations;
}

test("badge browser registration defaults to skip and requires exact opt-in", () => {
  for (const value of [undefined, "0", "true"]) {
    const env = value === undefined ? {} : Object.fromEntries(families.map(({ flag }) => [flag, value]));
    for (const row of inspect(env)) assert.equal(row.skip, true, row.name);
  }
  for (const row of inspect(Object.fromEntries(families.map(({ flag }) => [flag, "1"])))) {
    assert.equal(row.skip, false, row.name);
  }
});

test("badge browser families opt in independently without callbacks or browser launch", () => {
  for (const enabled of families) {
    const rows = inspect({ [enabled.flag]: "1" });
    assert.equal(rows.filter(row => row.skip === false).length, 3);
    for (const row of rows) assert.equal(row.skip, row.family !== enabled.flag, row.name);
  }
});

test("screenshot paths do not opt either badge browser family in", () => {
  const screenshots = {
    TOUCHLINE_MATCH_CARD_VISUAL_CAPTURE: "/synthetic/never-written/match",
    TOUCHLINE_VISUAL_CAPTURE: "/synthetic/never-written/availability.png",
    TOUCHLINE_MATCH_CARD_INTERACTION_CAPTURE_PREFIX: "/synthetic/never-written/match-interactions",
    TOUCHLINE_AVAILABILITY_CAPTURE_PREFIX: "/synthetic/never-written/availability-interactions",
  };
  for (const row of inspect(screenshots)) assert.equal(row.skip, true, row.name);
  for (const enabled of families) {
    for (const row of inspect({ ...screenshots, [enabled.flag]: "1" })) {
      assert.equal(row.skip, row.family !== enabled.flag, row.name);
    }
  }
});
