import { readFileSync, realpathSync, lstatSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
import { buildQaAvatarLocalEnvironment } from "./qa-avatar-local-environment.mts";
import { candidateRepository, assertNoImplicitEnvironment, runCandidateStage } from "./qa-candidate-runtime.mts";

export async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 3 || !["--check", "--start"].includes(argv[0]) || argv[1] !== "--env-file" || !isAbsolute(argv[2])) throw Error();
  const cwd = realpathSync(candidateRepository);
  if (realpathSync(execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim()) !== cwd) throw Error();
  assertNoImplicitEnvironment(cwd);
  const file = lstatSync(argv[2]);
  if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) !== 0 || file.size > 64 * 1024) throw Error();
  const { preview, preflight } = buildQaAvatarLocalEnvironment(parseEnv(readFileSync(argv[2], "utf8")), process.env);
  if (argv[0] === "--check") {
    console.log(JSON.stringify({ configuration: "checks_pending", runtimeVerificationRequired: true, serverStarted: false })); return 0;
  }
  const verified = await runCandidateStage({ executable: process.execPath, args: ["--experimental-strip-types", "scripts/assert-touchline-qa-persona.mts"], cwd,
    env: preflight, expectedExit: true, timeoutMs: 30_000 });
  if (verified !== 0) return verified;
  assertNoImplicitEnvironment(cwd);
  return runCandidateStage({ executable: process.execPath, args: ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "localhost", "--port", "3319"], cwd,
    env: preview, expectedExit: false });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then(code => { process.exitCode = code; }).catch(() => {
  console.error("Avatar local composition refused; configuration, private source and runtime gates require verification. Details withheld."); process.exitCode = 1;
});
