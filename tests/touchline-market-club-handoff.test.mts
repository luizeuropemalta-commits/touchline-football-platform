import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the component's filter initialization/reconciliation statements.
// This bounded state test does not replace the real mounted browser flow.
const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("client.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "FantasyGameweekClient")!;
const statements = component.body!.statements.filter((node) => {
  const text = node.getText(tree);
  return text.includes("initialPlayerClubTeamId") && !text.includes("initialSnapshot");
});
const code = ts.transpileModule(`(() => { ${statements.map(node => node.getText(tree)).join("\n")} return {playerClubTeamId, setPlayerClubTeamId}; })()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test("a new club hand-off changes only the filter; repeated props preserve manual browsing", () => {
  const states: unknown[] = [];
  let cursor = 0;
  let dirty = false;
  const clubs = [{teamId: "arsenal"}, {teamId: "chelsea"}, {teamId: "city"}];
  const render = (initialPlayerClubTeamId: string | null) => {
    let result!: { playerClubTeamId: string; setPlayerClubTeamId: (value: string) => void };
    let attempts = 0;
    do {
      cursor = 0; dirty = false;
      result = vm.runInNewContext(code, { initialPlayerClubTeamId, TOUCHLINE_ENGLAND_CLUBS_BY_RANK: clubs,
        useState(initial: unknown) {
          const index = cursor++;
          if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
          return [states[index], (value: unknown) => { dirty ||= states[index] !== value; states[index] = value; }];
        },
      });
      assert.ok(++attempts < 4, "club hand-off must settle without a render loop");
    } while (dirty);
    return result;
  };
  let filter = render("arsenal");
  assert.equal(filter.playerClubTeamId, "arsenal");
  filter.setPlayerClubTeamId("city");
  assert.equal(render("arsenal").playerClubTeamId, "city");
  filter = render("chelsea");
  assert.equal(filter.playerClubTeamId, "chelsea");
  filter.setPlayerClubTeamId("city");
  assert.equal(render("chelsea").playerClubTeamId, "city");
  assert.equal(render("arsenal").playerClubTeamId, "arsenal");
  assert.equal(render("unknown").playerClubTeamId, "arsenal");
  assert.equal(render(null).playerClubTeamId, "arsenal");
  assert.doesNotMatch(statements.map(node => node.getText(tree)).join("\n"), /setSelections|setSelectedCoachId|setFormationCode/);
});
