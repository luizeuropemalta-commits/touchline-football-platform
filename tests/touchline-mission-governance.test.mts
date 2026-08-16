import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  evaluateTouchlineMissionGovernance,
  FOOTER_END,
} from "../scripts/check-touchline-mission-governance.mjs";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const validInputs = {
  agents: source("AGENTS.md"),
  footer: source("docs/touchline/project-memory/TOUCHLINE_MISSION_FOOTER.md"),
  template: source("docs/touchline/project-memory/TOUCHLINE_CODEX_PROMPT_TEMPLATE.md"),
};

test("canonical TouchLine mission governance is complete and conflict-free", () => {
  assert.deepEqual(evaluateTouchlineMissionGovernance(validInputs), {
    schemaVersion: "touchline-mission-governance-v1",
    status: "PASS",
    failures: [],
  });
});

test("mission governance fails when AGENTS no longer points to the gate", () => {
  const result = evaluateTouchlineMissionGovernance({ ...validInputs, agents: "# TouchLine" });
  assert.equal(result.status, "INVALID");
  assert.ok(result.failures.includes("AGENTS_MISSING_MISSION_GATE_REFERENCE"));
});

test("mission governance fails when the canonical footer is removed or conflicts", () => {
  assert.throws(
    () => evaluateTouchlineMissionGovernance({ ...validInputs, footer: validInputs.footer.replace(FOOTER_END, "") }),
    /TL_MISSION_GOVERNANCE_MISSING_FOOTER/,
  );
  const result = evaluateTouchlineMissionGovernance({
    ...validInputs,
    template: validInputs.template.replace("nenhuma regressão conhecida dentro do escopo", "regressões permitidas"),
  });
  assert.equal(result.status, "INVALID");
  assert.ok(result.failures.includes("MISSION_FOOTER_CONFLICT"));
});
