/** Local Mac QA launcher. Importing this file never starts a server or reads secrets. */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { buildQaCandidateEnvironments } from "./qa-candidate-environment.mts";

export const candidateRepository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const nextDevelopmentEnvFiles = [".env.development.local", ".env.local", ".env.development", ".env"];

export function assertNoImplicitEnvironment(cwd: string, present = existsSync) {
  if (nextDevelopmentEnvFiles.some((name) => present(resolve(cwd, name)))) {
    throw new Error("Local QA refuses implicit Next dotenv files; review configuration before starting.");
  }
}

/** No cleanup, no process termination and no estimate based on free-memory percentages. */
export function assertCandidateCapacity(cwd: string, allowWarning = false) {
  if (process.platform !== "darwin") throw new Error("This capacity gate requires macOS.");
  const pressure = Number(execFileSync("/usr/sbin/sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], { encoding: "utf8" }).trim());
  const rows = execFileSync("/bin/df", ["-Pk", cwd], { encoding: "utf8" }).trim().split("\n");
  const availableKiB = Number(rows.at(-1)?.trim().split(/\s+/)[3]);
  return assertCandidateCapacityReadings(pressure, availableKiB, allowWarning);
}

/** Owner-approved local preview floor; full-build capacity policy is unchanged. */
export function assertCandidateCapacityReadings(pressure: number, availableKiB: number, allowWarning = false) {
  if ((pressure !== 1 && !(allowWarning && pressure === 2)) || !Number.isFinite(availableKiB) || availableKiB <= 1024 * 1024) {
    throw new CandidateCapacityError(`pressure=${pressure}; availableKiB=${availableKiB}; allowWarning=${allowWarning}`);
  }
  return pressure;
}

class CandidateCapacityError extends Error {}

/** Start only at normal pressure; WARN alone never shuts down the candidate.
 * The sysctl exposes dispatch levels (1 normal, 2 warning, 4 critical), not the
 * kernel's internal enum. Critical/unknown pressure and low disk still stop now.
 */
export function createCapacityMonitor(check = assertCandidateCapacity) {
  let started = false;
  return (cwd: string) => {
    assertNoImplicitEnvironment(cwd);
    check(cwd, started);
    started = true;
  };
}

type Stage = {
  executable: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv;
  expectedExit: boolean; timeoutMs?: number;
};

/** An unexpected clean Next CLI exit is NOT successful browser validation. */
export function runCandidateStage(stage: Stage, dependencies = {
  spawnChild: spawn,
  killGroup: (pid: number, signal: NodeJS.Signals) => process.kill(-pid, signal),
  signalBus: process,
  // Next watches dotenv files after launch. Detect their appearance too.
  // This is a periodic guard, not an atomic filesystem/network sandbox.
  capacity: createCapacityMonitor(),
  setTimer: setTimeout, clearTimer: clearTimeout,
  setPoll: setInterval, clearPoll: clearInterval,
}): Promise<number> {
  dependencies.capacity(stage.cwd);
  return new Promise((resolveStage) => {
    const child = dependencies.spawnChild(stage.executable, stage.args, {
      cwd: stage.cwd, env: stage.env, stdio: "inherit", detached: true,
    });
    let settled = false;
    let stopping = false;
    let signalFailure = false;
    let stopCode = 1;
    let forced: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try { dependencies.killGroup(child.pid, signal); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          signalFailure = true;
          console.error("Local QA could not signal its process group; shutdown is not confirmed.");
        }
      }
    };
    const stop = (code: number) => {
      if (settled || stopping) return;
      stopping = true;
      stopCode = code;
      kill("SIGTERM");
      forced = dependencies.setTimer(() => kill("SIGKILL"), 5_000);
    };
    const interrupt = () => stop(130);
    const terminate = () => stop(143);
    dependencies.signalBus.on("SIGINT", interrupt);
    dependencies.signalBus.on("SIGTERM", terminate);
    const poll = dependencies.setPoll(() => {
      try { dependencies.capacity(stage.cwd); } catch (error) {
        // Only our numeric capacity readings are safe to print; never echo
        // filesystem, configuration or subprocess errors containing secrets.
        if (error instanceof CandidateCapacityError) console.error(`Local QA capacity stop: ${error.message}`);
        console.error("Local QA capacity/configuration monitor stopped its own process group.");
        stop(1);
      }
    }, 5_000);
    if (stage.timeoutMs) timeout = dependencies.setTimer(() => stop(1), stage.timeoutMs);
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      dependencies.clearPoll(poll);
      if (timeout) dependencies.clearTimer(timeout);
      if (forced) dependencies.clearTimer(forced);
      dependencies.signalBus.removeListener("SIGINT", interrupt);
      dependencies.signalBus.removeListener("SIGTERM", terminate);
      // Only this launcher's detached group; never unrelated Next/Codex processes.
      // Kill residual workers even when their CLI exited before them.
      kill("SIGKILL");
      resolveStage(code !== null && code !== 0 ? code : signalFailure ? 1 : stopping ? stopCode : stage.expectedExit && code === 0 ? 0 : 1);
    };
    child.once("error", () => finish(1));
    child.once("exit", (code) => finish(code));
  });
}

export function parseCandidateArguments(argv: string[]) {
  const mode = argv[0];
  const flags = argv.slice(3);
  if ((mode !== "--check" && mode !== "--start") || argv[1] !== "--env-file"
    || !argv[2] || !isAbsolute(argv[2]) || flags.length > 3
    || new Set(flags).size !== flags.length
    || flags.some(flag => !["--qa-market-context", "--club-collection", "--club-release"].includes(flag))
    || (flags.includes("--club-release") && (!flags.includes("--club-collection") || !flags.includes("--qa-market-context")))) {
    throw new Error("Usage: qa-candidate-runtime.mts --check|--start --env-file /absolute/existing/QA.env [--qa-market-context] [--club-collection] [--club-release requires both]");
  }
  return { mode, sourcePath: argv[2], qaMarketContext: flags.includes("--qa-market-context"), clubCollection: flags.includes("--club-collection"), clubRelease: flags.includes("--club-release") };
}

export async function main(argv = process.argv.slice(2)) {
  const { mode, sourcePath, qaMarketContext, clubCollection, clubRelease } = parseCandidateArguments(argv);
  const cwd = realpathSync(candidateRepository);
  const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
  if (realpathSync(gitRoot) !== cwd) throw new Error("Candidate repository mismatch.");
  assertNoImplicitEnvironment(cwd);
  const { preview, preflight } = buildQaCandidateEnvironments(parseEnv(readFileSync(sourcePath, "utf8")), process.env, { qaMarketContext, clubCollection, clubRelease });
  if (mode === "--check") {
    console.log("Local QA environment contract checked. No server, persona query or browser started.");
    return 0;
  }
  const before = await runCandidateStage({ executable: process.execPath,
    args: ["--experimental-strip-types", "scripts/assert-touchline-qa-persona.mts"], cwd, env: preflight,
    expectedExit: true, timeoutMs: 30_000 });
  if (before !== 0) return before;
  // Recheck after preflight, before Next can load any local configuration.
  assertNoImplicitEnvironment(cwd);
  console.log("Starting local QA at http://localhost:3100; startup is not authenticated browser validation.");
  return runCandidateStage({ executable: process.execPath,
    args: ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "localhost", "--port", "3100"],
    cwd, env: preview, expectedExit: false });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    // Do not echo parse/spawn/filesystem errors that might include secret input.
    console.error("Local QA launcher refused to start. Check arguments, QA contract, dotenv files and capacity; no success is implied.");
    process.exitCode = 1;
  });
}
