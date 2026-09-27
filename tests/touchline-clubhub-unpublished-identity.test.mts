import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the real component's publication/render guard. This is not a
// browser or full-component rendering claim; no second guard is implemented.
const source = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("card.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "TouchlineEliteExactCard");
assert.ok(component?.body);
const names = new Set(["editorialCard", "reviewRequired", "editorialTier", "contractedTier", "inventoryPreviewTier", "marketTier", "publicationPending", "neutralIdentity", "cardTemplateUrl"]);
const declarations = component.body.statements.filter(ts.isVariableStatement).flatMap((statement) =>
  statement.declarationList.declarations.filter((declaration) => names.has(declaration.name.getText(tree))).map((declaration) => `const ${declaration.getText(tree)};`));
const guard = component.body.statements.find((node) => ts.isIfStatement(node) && node.expression.getText(tree).includes("!editorialCard") && node.thenStatement.getText(tree) === "return null;");
assert.ok(guard);
let editorialState = "";
let filter = "";
function visit(node: ts.Node) {
  if (ts.isJsxAttribute(node) && node.name.getText(tree) === "data-card-editorial-state" && node.initializer && ts.isJsxExpression(node.initializer)) editorialState = node.initializer.expression!.getText(tree);
  if (ts.isPropertyAssignment(node) && node.name.getText(tree) === "filter" && node.initializer.getText(tree).includes("grayscale")) filter = node.initializer.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(editorialState && filter);
function inspect(input: Record<string, unknown>) {
  const code = ts.transpileModule(`(() => {${declarations.join("\n")} ${guard!.getText(tree)} return { tier: marketTier?.key ?? null, reviewRequired, template: cardTemplateUrl, state: ${editorialState}, filter: ${filter} };})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(code, {
    player: { cardReview: { state: "COMPLETE", missingFields: [] } },
    allowVisualInventoryPreview: false,
    showUnpublishedIdentity: false,
    touchlineArenaTierForKey: (key: string) => ({ key }),
    touchlineArenaClubTemplateForTierPreview: () => "/published-art.webp",
    assignedVisualTemplateUrl: "/untrusted-coloured-art.webp",
    ...input,
  });
}

test("ClubHub opt-in preserves a complete footballer's identity before card publication", () => {
  const result = inspect({ showUnpublishedIdentity: true });
  assert.notEqual(result, null, "a complete but unpublished footballer must not collapse to an empty pitch trigger");
  assert.equal(result.tier, null);
  assert.equal(result.template, null, "unpublished identity must not borrow coloured art");
  assert.equal(result.state, "publication_pending");
  assert.match(result.filter, /grayscale\(1\)/);
  assert.equal(result.reviewRequired, false, "publication pending must not invent missing editorial fields");
});

test("default commercial surfaces remain closed, with existing publication and contract exceptions", () => {
  assert.equal(inspect({}), null);
  assert.equal(inspect({ player: {} }), null);
  assert.equal(inspect({ player: { editorialCard: { tierKey: "radiant-gold" } } }).tier, "radiant-gold");
  assert.equal(inspect({ player: { cardPriceAuthority: "active-contract", cardTier: "ruby-red" } }).tier, "ruby-red");
  assert.equal(inspect({ player: { cardReview: { state: "REVIEW_REQUIRED" } } }).reviewRequired, true);
  assert.equal(inspect({ showUnpublishedIdentity: true, player: {} }), null, "unassessed identities remain closed");
  assert.equal(inspect({ showUnpublishedIdentity: true, player: { cardReview: { state: "REVIEW_REQUIRED" } } }).state, "review_required");
  assert.equal(inspect({ showUnpublishedIdentity: true, player: { cardPriceAuthority: "active-contract", cardTier: "ruby-red" } }).state, "unpublished");
  assert.equal(inspect({ showUnpublishedIdentity: true, allowVisualInventoryPreview: true, player: { cardTier: "ruby-red" } }).state, "unpublished");
});

test("only explicit ClubHub card and zoom consumers request the non-commercial display", () => {
  assert.match(source, /showUnpublishedIdentity = false/);
  assert.match(source, /Card publication pending/);
  assert.match(source, /Publicação do card pendente/);
  for (const name of ["ClubHubOfficialLineup", "ClubHubSquadGrid", "ClubHubMatchdayTechnicalArea"]) {
    const caller = readFileSync(new URL(`../components/touchline/${name}.tsx`, import.meta.url), "utf8");
    assert.equal((caller.match(/showUnpublishedIdentity/g) ?? []).length, 2, `${name}: pitch/bench/roster plus zoom`);
    assert.doesNotMatch(caller, /allowVisualInventoryPreview/);
  }
});
