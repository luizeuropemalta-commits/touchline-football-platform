import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "../..");
const BIN = resolve(process.env.TL_CARD_PROVISIONAL_SHADOW_PG_BIN?.trim() || "/");
const EXPECTED_VERSION = /^postgres \(PostgreSQL\) 17\.11(?: \(Postgres\.app\))?$/;
if (BIN === "/" || basename(BIN) !== "bin") throw new Error("TL_CARD_PROVISIONAL_SHADOW_PG_BIN_REQUIRED");

function command(executable: string, args: string[], options: { env?: NodeJS.ProcessEnv; expectedExit?: number } = {}) {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: ROOT,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += String(chunk); });
    child.stderr?.on("data", (chunk) => { output += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => code === (options.expectedExit ?? 0)
      ? resolvePromise(output.trim())
      : reject(new Error(`TL_CARD_PROVISIONAL_SHADOW_COMMAND_FAILED:${basename(executable)}:${code}\n${output}`)));
  });
}

async function freePort() {
  return new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePromise(port));
    });
  });
}

const root = mkdtempSync(join("/tmp", "tl-card-provisional-shadow-"));
const data = join(root, "data");
const socket = join(root, "socket");
mkdirSync(socket);
const port = await freePort();
const database = `tl_card_provisional_${process.pid}`;
const cleanDatabase = `tl_card_provisional_clean_${process.pid}`;
const postgres = join(BIN, "postgres");
const pgCtl = join(BIN, "pg_ctl");
const psql = join(BIN, "psql");
let started = false;
const connection = (databaseName: string) => ({ PGHOST: "127.0.0.1", PGPORT: String(port), PGDATABASE: databaseName });
const file = (databaseName: string, path: string, expectedExit = 0) => command(
  psql,
  ["-v", "ON_ERROR_STOP=1", "-f", resolve(ROOT, path)],
  { env: connection(databaseName), expectedExit },
);
const sql = (databaseName: string, value: string) => command(
  psql,
  ["-v", "ON_ERROR_STOP=1", "-At", "-c", value],
  { env: connection(databaseName) },
);

try {
  const version = await command(postgres, ["--version"]);
  if (!EXPECTED_VERSION.test(version)) throw new Error(`TL_CARD_PROVISIONAL_SHADOW_VERSION_MISMATCH:${version}`);
  await command(join(BIN, "initdb"), ["-D", data, "--auth-local=trust", "--auth-host=trust", "--no-locale", "--encoding=UTF8"]);
  await command(pgCtl, ["-D", data, "-o", `-h 127.0.0.1 -p ${port} -k ${socket}`, "-w", "start"]);
  started = true;
  for (const databaseName of [database, cleanDatabase]) {
    await command(join(BIN, "createdb"), [databaseName], { env: { PGHOST: "127.0.0.1", PGPORT: String(port) } });
    await file(databaseName, "supabase/tests/card_engine_provisional_shadow_bootstrap.sql");
    await file(databaseName, "supabase/migrations/20260901090000_touchline_card_engine_provisional_fields.sql");
  }
  await file(database, "supabase/tests/card_engine_provisional_shadow_verification.sql");
  const evidence = await sql(database, `select json_build_object(
    'provisionalDefaults', (select count(*) from public.touchline_card_editorial_audit_events where event_type='provisional_defaulted'),
    'provisionalResolved', (select count(*) from public.touchline_card_editorial_audit_events where event_type='provisional_resolved'),
    'publishedCards', (select count(*) from public.touchline_card_publications where publication_status='published')
  )`);
  const rollbackBlocked = await file(database, "supabase/rollback/20260901090000_touchline_card_engine_provisional_fields.sql", 3);
  if (!rollbackBlocked.includes("TL_CARD_PROVISIONAL_ROLLBACK_DATA_PRESENT")) {
    throw new Error("TL_CARD_PROVISIONAL_SHADOW_ROLLBACK_DID_NOT_FAIL_CLOSED");
  }
  await file(cleanDatabase, "supabase/rollback/20260901090000_touchline_card_engine_provisional_fields.sql");
  const remainingFunctions = await sql(cleanDatabase, "select count(*) from pg_proc where proname like 'touchline_card_engine_%provisional%'");
  if (remainingFunctions !== "0") throw new Error("TL_CARD_PROVISIONAL_SHADOW_CLEAN_ROLLBACK_INCOMPLETE");
  process.stdout.write(`${JSON.stringify({
    postgres: version,
    database,
    evidence,
    rollbackWithData: "FAIL_CLOSED",
    cleanRollback: "PASS",
  })}\n`);
} finally {
  if (started) await command(pgCtl, ["-D", data, "-m", "fast", "-w", "stop"]).catch(() => undefined);
  rmSync(root, { recursive: true, force: true });
}
