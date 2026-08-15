#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { TOUCHLINE_QA_PROJECT_REF, assertTouchlineQaProjectRef } from "./build-touchline-representative-package.mts";
import type { buildTouchlineRepresentativeQaPackage } from "./build-touchline-representative-package.mts";

type TouchlineRepresentativeQaPlan = ReturnType<typeof buildTouchlineRepresentativeQaPackage>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export function renderTouchlineRepresentativeQaStageFiles(plan: TouchlineRepresentativeQaPlan, actorId: string, chunkSize = 50) {
  assertTouchlineQaProjectRef(String(plan?.target?.projectRef ?? ""));
  invariant(plan?.schemaVersion === "touchline-representative-qa-package-v1" && plan?.target?.environment === "qa", "TL_QA_STAGE_PLAN_INVALID");
  invariant(plan?.policy?.productionAllowed === false, "TL_QA_STAGE_PRODUCTION_FORBIDDEN");
  invariant(/^[0-9a-f-]{36}$/i.test(actorId), "TL_QA_STAGE_ACTOR_INVALID");
  invariant(Number.isInteger(chunkSize) && chunkSize >= 10 && chunkSize <= 100, "TL_QA_STAGE_CHUNK_SIZE_INVALID");
  const expectedCounts = JSON.stringify(plan.counts);
  const kinds = [
    ["clubs", plan.clubs],
    ["players", plan.players],
    ["memberships", plan.memberships],
    ["publication_rows", plan.publicationRows],
    ["inventory", plan.inventory],
  ] as const;
  const files: Array<{ name: string; sql: string }> = [];
  for (const [kind, rows] of kinds) {
    invariant(Array.isArray(rows) && rows.length > 0, `TL_QA_STAGE_PAYLOAD_INVALID:${kind}`);
    for (const [index, chunk] of chunks(rows, chunkSize).entries()) {
      const payload = JSON.stringify(chunk);
      files.push({
        name: `${String(files.length).padStart(3, "0")}-${kind}-${String(index).padStart(3, "0")}.sql`,
        sql: `select * from public.touchline_stage_representative_qa_chunk(\n  '${TOUCHLINE_QA_PROJECT_REF}',\n  '${plan.fixture.runId}'::uuid,\n  ${sqlText(plan.fixture.version)},\n  '${plan.fixture.sourceFingerprintSha256}',\n  '${plan.packageFingerprintSha256}',\n  ${sqlText(expectedCounts)}::jsonb,\n  '${kind}',\n  ${index},\n  ${sqlText(payload)}::jsonb,\n  '${sha256(payload)}'\n);\n`,
      });
    }
  }
  files.push({
    name: "900-apply.sql",
    sql: `select * from public.touchline_apply_representative_qa_package('${TOUCHLINE_QA_PROJECT_REF}', '${plan.fixture.runId}'::uuid, '${plan.source.ownerApprovedPublicationFingerprintSha256}', '${actorId}'::uuid);\n`,
  });
  files.push({
    name: "999-rollback.sql",
    sql: `select * from public.touchline_rollback_representative_qa_package('${TOUCHLINE_QA_PROJECT_REF}', '${plan.fixture.runId}'::uuid, '${plan.source.ownerApprovedPublicationFingerprintSha256}', '${actorId}'::uuid);\n`,
  });
  return files;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce<string[][]>((pairs, item, index, all) => {
    if (index % 2 === 0) pairs.push([item.replace(/^--/, ""), all[index + 1] ?? ""]);
    return pairs;
  }, []));
  invariant(args.plan && args["actor-id"] && args["write-new-dir"], "TL_QA_STAGE_ARGUMENT_REQUIRED");
  const plan = JSON.parse(await readFile(resolve(args.plan), "utf8"));
  const files = renderTouchlineRepresentativeQaStageFiles(plan, args["actor-id"]);
  const target = resolve(args["write-new-dir"]);
  await mkdir(target, { recursive: false, mode: 0o700 });
  for (const file of files) await writeFile(resolve(target, file.name), file.sql, { flag: "wx", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ target: plan.target, runId: plan.fixture.runId, stageFiles: files.length - 2, applyFile: "900-apply.sql", rollbackFile: "999-rollback.sql" })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "TL_QA_STAGE_UNKNOWN_ERROR"}\n`);
    process.exitCode = 1;
  });
}
