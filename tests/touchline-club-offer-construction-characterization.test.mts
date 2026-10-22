import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { clubPrimaryPositionIndex } from "../lib/touchlineFantasy/club-primary-position-index.ts";
import { clubPlayerPosition } from "../lib/touchlineFantasy/club-position.ts";

// Execute production declarations, not a copied offer-building implementation.
// Auth, DB reads, POST handler and purchase service are deliberately not executed.
const source = readFileSync(new URL("../app/api/touchline-fantasy/collection/route.ts", import.meta.url), "utf8");
const tree = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
const post = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "POST");
assert.ok(post && ts.isFunctionDeclaration(post));
const names = ["card", "primaryDetails", "primaryDetail", "position", "offer"];
const declarations = new Map<string, ts.VariableDeclaration>();
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
    assert.ok(!declarations.has(node.name.text)); declarations.set(node.name.text, node);
  }
  ts.forEachChild(node, visit);
}
visit(post);
assert.equal(declarations.size, names.length);
const script = ts.transpileModule(names.map(name => `const ${declarations.get(name)!.getText(tree)};`).join("\n") + "\noffer;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const id = "30000000-0000-4000-8000-000000000001";
const base = { id, canonicalPlayerId: id, primaryPositionDetail: "Goalkeeper", editorialCard: { marketValueEur: 70, marketValueState: "verified" } };
function project(catalogue: unknown[], football: unknown = { current_club_id: "club" }) {
  return runInNewContext(script, { snapshot: { catalogue }, command: { playerId: id }, football, clubPrimaryPositionIndex, clubPlayerPosition,
    fetch: () => { throw Error("Network forbidden"); } }, { timeout: 500 });
}
test("actual inline constructor preserves both verified and provisional prices", () => {
  for (const marketValueState of ["verified", "provisional"]) {
    const offer = project([{ ...base, editorialCard: { marketValueEur: 70, marketValueState } }]);
    assert.deepEqual(JSON.parse(JSON.stringify(offer)), { playerId: id, clubId: "club", position: "GK", primaryDetail: "Goalkeeper", valueEur: 70, published: true });
  }
});
test("actual inline constructor requires current club and recognized primary detail", () => {
  assert.equal(project([base], null), null);
  assert.equal(project([base], {}), null);
  assert.equal(project([{ ...base, primaryPositionDetail: "unknown" }]), null);
  assert.equal(project([{ ...base, primaryPositionDetail: undefined }]), null);
});
test("actual inline constructor requires exact canonical identity and rejects duplicate detail authority", () => {
  assert.equal(project([{ ...base, canonicalPlayerId: "different" }]), null);
  assert.equal(project([{ ...base, canonicalPlayerId: undefined }]), null);
  assert.equal(project([base, { ...base }]), null);
});
