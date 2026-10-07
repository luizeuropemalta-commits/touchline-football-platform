import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { resultError } from "../lib/football-data/http.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const codes = ["not_configured", "unsupported", "provider_error", "not_found", "invalid_request", "deferred", "rate_limited"] as const;

test("resultError accepts the canonical error union including deferred and still rejects unknown codes", () => {
  const configPath = resolve(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.deepEqual(parsed.errors, []);
  const virtualPath = resolve(root, "tests/result-error-contract.virtual.ts");
  const virtual = `import { resultError } from "../lib/football-data/http.ts";
import type { FootballDataErrorCode, FootballDataResult } from "../lib/football-data/types.ts";
const codes = ${JSON.stringify(codes)} as const satisfies readonly FootballDataErrorCode[];
type Missing = Exclude<FootballDataErrorCode, typeof codes[number]>;
const complete: Missing extends never ? true : never = true;
void complete;
for (const code of codes) {
  const result: FootballDataResult<never> = resultError("sportmonks", code, "Synthetic message");
  void result;
}
resultError("sportmonks", "unknown_error_code", "Must be rejected");
`;
  const options = { ...parsed.options, noEmit: true, incremental: false };
  const host = ts.createCompilerHost(options);
  const read = host.readFile, exists = host.fileExists;
  host.readFile = path => resolve(path) === virtualPath ? virtual : read(path);
  host.fileExists = path => resolve(path) === virtualPath || exists(path);
  const program = ts.createProgram([resolve(root, "next-env.d.ts"), virtualPath], options, host);
  assert.ok(program.getSourceFile(resolve(root, "lib/football-data/http.ts")));
  assert.ok(program.getSourceFile(resolve(root, "lib/football-data/types.ts")));
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const format = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: path => path, getNewLine: () => "\n",
  });
  // Keep ALL diagnostics. Only the deliberately invalid call may fail; no
  // suppression, target/lib override or filtering away transitive errors.
  assert.equal(diagnostics.length, 1, format);
  assert.equal(diagnostics[0].code, 2345, format);
  assert.equal(diagnostics[0].file?.fileName, virtualPath, format);
  assert.equal(diagnostics[0].start, virtual.indexOf('"unknown_error_code"'), format);
});

test("resultError preserves the canonical error envelope without coercing deferral into provider failure", () => {
  for (const code of codes) {
    const before = Date.now();
    const result = resultError("sportmonks", code, "Synthetic message");
    const after = Date.now();
    assert.deepEqual(Object.keys(result), ["ok", "provider", "fetchedAt", "error"]);
    assert.equal(result.ok, false); assert.equal(result.provider, "sportmonks");
    assert.ok(Date.parse(result.fetchedAt) >= before && Date.parse(result.fetchedAt) <= after);
    assert.deepEqual(result.error, { provider: "sportmonks", code, message: "Synthetic message", status: undefined });
  }
  const details = Object.freeze({ retryAfterSeconds: 0, remaining: 0, requestedEntity: "Fixture" });
  const limited = resultError("sportmonks", "rate_limited", "Synthetic limit", 429, details);
  assert.deepEqual(limited.error, { provider: "sportmonks", code: "rate_limited", message: "Synthetic limit", status: 429, ...details });
  assert.deepEqual(details, { retryAfterSeconds: 0, remaining: 0, requestedEntity: "Fixture" });
});

test("resultError body and complete HTTP module emitted JavaScript remain byte-identical", () => {
  const source = readFileSync(resolve(root, "lib/football-data/http.ts"), "utf8");
  const ast = ts.createSourceFile("http.ts", source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "resultError");
  assert.ok(declaration && ts.isFunctionDeclaration(declaration) && declaration.body);
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  assert.equal(hash(declaration.body.getText(ast)), "ea61342655dd8368d1b39f5fa13357e48735b43b9435a8e8a1ad240b4e93f92a");
  const emitted = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.ESNext } }).outputText;
  assert.equal(hash(emitted), "26100ebeaaf8050d6b7e6722fbabeb665b788e2e1906ddf590b7d9d39d7a1cc2");
});
