import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("shared avatar validation types do not pull the Sharp implementation into Edge", () => {
  const types = readFileSync(new URL("../lib/touchlineArena/club-owner-avatar-validation-types.ts", import.meta.url), "utf8");
  const contract = readFileSync(new URL("../lib/touchlineArena/club-owner-avatar-upload-contract.ts", import.meta.url), "utf8");
  const validator = readFileSync(new URL("../lib/touchlineArena/club-owner-avatar-validation.ts", import.meta.url), "utf8");
  assert.match(types, /import type \{ Buffer \} from "node:buffer"/);
  assert.doesNotMatch(types, /from ["'][^"']*(?:sharp|validation\.ts)["']/);
  assert.match(contract, /import type \{ ClubOwnerAvatarValidation \} from "\.\/club-owner-avatar-validation-types\.ts"/);
  assert.doesNotMatch(contract, /from "\.\/club-owner-avatar-validation\.ts"/);
  assert.match(validator, /export type \{ ClubOwnerAvatarError, ClubOwnerAvatarValidation \}/);
  const compiled = ts.transpileModule(types, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  assert.doesNotMatch(compiled, /import|require\(/, "shared types emit no runtime dependencies");
});
