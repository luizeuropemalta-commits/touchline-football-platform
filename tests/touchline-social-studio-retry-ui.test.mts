import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const path = "components/touchline/admin/TouchlineSocialStudio.tsx";
const source = readFileSync(path, "utf8");
const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function retryState(input: { sourceIntegrationError: string | null; mediaError: string | null; videoError: boolean; mediaCurrent: boolean; mediaAvailable: boolean }): { disabled: boolean; reason: string | null } {
  const node = parsed.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === "studioRetryUiState");
  assert.ok(node, "The retry control needs a shared fail-closed UI decision before the click");
  const javascript = ts.transpileModule(`${node.getText(parsed)}\nexports.resolve = studioRetryUiState;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { resolve?: (value: typeof input) => { disabled: boolean; reason: string | null } } = {};
  vm.runInNewContext(javascript, { exports }, { timeout: 1000 });
  return exports.resolve!(input);
}

const ready = { sourceIntegrationError: null, mediaError: null, videoError: false, mediaCurrent: true, mediaAvailable: true };

test("unavailable canonical adapter disables retry and exposes its reason even when delivery checks pass", () => {
  const reason = "Integração de fonte oficial publicada ainda não verificada.";
  const state = retryState({ ...ready, sourceIntegrationError: reason });
  assert.equal(state.disabled, true);
  assert.equal(state.reason, reason);
  assert.equal(retryState(ready).disabled, false, "The new gate does not replace the existing delivery/revision/reason guards");
});

test("current media/source errors, expired facts and missing video also disable retry before the click", () => {
  for (const changed of [{ mediaError: "Origem atual não verificada." }, { videoError: true }, { mediaCurrent: false }, { mediaAvailable: false }]) {
    const state = retryState({ ...ready, ...changed });
    assert.equal(state.disabled, true);
    assert.ok(state.reason?.trim());
  }
});

test("snapshot gate reaches the retry button, its visible explanation and the click handler", () => {
  assert.match(source, /sourceIntegrationError=\{snapshot\.sourceIntegrationError\}/);
  assert.match(source, /const retryUi = studioRetryUiState\(\{ sourceIntegrationError, mediaError, videoError, mediaCurrent,/);
  assert.match(source, /disabled=\{!writable \|\| pending \|\| retryUi\.disabled \|\| !retryAllowed/);
  assert.match(source, /action === "request-retry" && retryUi\.disabled/);
  assert.match(source, /retryUi\.reason \? <p[^>]*role="status"[^>]*>Retentativa bloqueada: \{retryUi\.reason\}/);
});
