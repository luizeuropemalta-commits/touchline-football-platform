#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FOOTER_START = "<!-- TOUCHLINE_MISSION_FOOTER_START -->";
export const FOOTER_END = "<!-- TOUCHLINE_MISSION_FOOTER_END -->";

function extractFooter(source, label) {
  const start = source.indexOf(FOOTER_START);
  const end = source.indexOf(FOOTER_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`TL_MISSION_GOVERNANCE_MISSING_FOOTER:${label}`);
  }
  if (source.indexOf(FOOTER_START, start + FOOTER_START.length) >= 0
    || source.indexOf(FOOTER_END, end + FOOTER_END.length) >= 0) {
    throw new Error(`TL_MISSION_GOVERNANCE_DUPLICATE_MARKER:${label}`);
  }
  return source.slice(start, end + FOOTER_END.length).replaceAll("\r\n", "\n");
}

export function evaluateTouchlineMissionGovernance({ agents, footer, template }) {
  const failures = [];
  const requiredAgentReference = "docs/touchline/project-memory/TOUCHLINE_MISSION_FOOTER.md";
  if (!agents.includes(requiredAgentReference) || !agents.includes("TouchLine Mission Completion Gate")) {
    failures.push("AGENTS_MISSING_MISSION_GATE_REFERENCE");
  }
  if (!template.includes("Regra Nº 1") || !template.includes("Regra Nº 1B") || !template.includes("Regra Nº 1C")) {
    failures.push("TEMPLATE_MISSING_TOUCHLINE_RULES");
  }
  for (const [label, source] of [["footer", footer], ["template", template]]) {
    for (const token of [
      "TOUCHLINE MISSION COMPLETION GATE",
      "CODE → TEST → CODE VERIFICATION → QA DEPLOYMENT → REAL BROWSER",
      "PRODUCTION:** NOT TOUCHED",
    ]) {
      if (!source.includes(token)) failures.push(`${label.toUpperCase()}_MISSING:${token}`);
    }
  }
  const canonicalFooter = extractFooter(footer, "footer");
  const templateFooter = extractFooter(template, "template");
  if (canonicalFooter !== templateFooter) failures.push("MISSION_FOOTER_CONFLICT");

  return Object.freeze({
    schemaVersion: "touchline-mission-governance-v1",
    status: failures.length ? "INVALID" : "PASS",
    failures: Object.freeze(failures),
  });
}

async function main() {
  if (process.argv.length !== 2) throw new Error("TL_MISSION_GOVERNANCE_TAKES_NO_ARGUMENTS");
  const root = process.cwd();
  const [agents, footer, template] = await Promise.all([
    readFile(resolve(root, "AGENTS.md"), "utf8"),
    readFile(resolve(root, "docs/touchline/project-memory/TOUCHLINE_MISSION_FOOTER.md"), "utf8"),
    readFile(resolve(root, "docs/touchline/project-memory/TOUCHLINE_CODEX_PROMPT_TEMPLATE.md"), "utf8"),
  ]);
  const result = evaluateTouchlineMissionGovernance({ agents, footer, template });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_MISSION_GOVERNANCE_CHECK_FAILED"}\n`);
    process.exitCode = 1;
  });
}
