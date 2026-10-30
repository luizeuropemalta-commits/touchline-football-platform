/**
 * QA-only operational probe. This is NOT customer-route/UI or cadence proof.
 *
 * node --experimental-strip-types scripts/qa/verify-touchline-avatar-retention.mts \
 *   --project-ref xgxbwqxjssxxuihuwmgy --fixture-id <existing CUSTOMER UUID> \
 *   --env-file /absolute/private/existing.env --state-file /absolute/private/run.json
 * Default: LOCAL checks only, no network, no state creation. Private files must
 * belong to this OS user, be regular non-symlink files and have mode 0600.
 * Required env names: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * TOUCHLINE_OWNER_EMAILS. Nothing is downloaded or read from implicit dotenv.
 * Alternatively replace --env-file with explicit --env-source process to keep
 * an operator-injected credential in memory only. These two inputs are mutually
 * exclusive; only the three required names and NEXT_PUBLIC_SUPABASE_URL (when
 * present) are captured and checked for drift. No credential enters state/logs.
 *
 * The release owner runs ONE explicit --execute --step at a time:
 * inspect -> publish-first -> publish-second -> retain -> verify.
 * inspect requires revision zero, no current managed photo and no pending work.
 * It creates two tiny local WebP fixtures and one durable run (never reset it).
 * publish-first/second use the real begin -> immutable Storage -> publishV2 chain.
 * Every mutation step requires the owner's fresh external Supabase SELECT
 * preflight: QA identity; fixture is CUSTOMER; no foreign eligible operation,
 * retention candidate or active lease; no concurrent avatar writer/scheduler.
 * Before retain, also inspect all discovery-eligible operations (not just the
 * bounded list_due RPC), both receipts, current tuple, and SQL terminal_at+5min.
 * These SELECTs are performed through the authenticated connector by the owner:
 * the service HTTP adapter cannot read the private journal. This script NEVER
 * fabricates an attestation, claims a global empty queue, or grants itself that
 * authority. Each invocation stops at the next external-check boundary.
 *
 * retain waits >=5 real minutes after the first confirmed commit (no sleep or
 * backdating), dispatches the REAL deployed Edge POST once, bodyless, then stops.
 * A lost Edge response is NOT retried: use verify and external journal reads.
 * verify checks origin metadata + cache-busted bytes, with the current photo as
 * a positive control before/after. Even success remains AWAITING_EXTERNAL_JOURNAL:
 * owner must inspect retention_attempts/retention_candidates/discovery rows,
 * exact old-key authority/outcome/times and unchanged out-of-scope snapshots.
 * Cadence, published customer flow and rollout remain separate gates.
 *
 * Recovery: preserve this 0600 state and its .lock after a process crash. Inspect
 * remote operation status before an operator removes a stale local lock. A
 * committed operation is reconciled; pending/unknown is RECOVERY_REQUIRED, never
 * resumed as a new worker, fenced, reset, or replaced with a fresh operation ID.
 * There is no cleanup DELETE, scheduler, grant, SQL mutation, activation or flag
 * write here. The second fixture photo remains current. Existing managed photos
 * are refused, so this probe cannot supersede a customer's real uploaded photo.
 * App flags (NOT enabled here): TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED,
 * UPLOAD_ENABLED, SELECTION_ENABLED, RETENTION_READY, UPLOAD_ACCOUNT_ID (all with
 * the TOUCHLINE_CLUB_OWNER_AVATAR_ prefix). Edge requires its already configured
 * TOUCHLINE_QA_AVATAR_RETENTION_ENABLED=true and JWT verification ON.
 */
import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { ownerEmails, isOwnerEmail } from "../../lib/admin/owner.ts";
import { hasTouchLineArenaAccess } from "../../lib/touchlineArena/auth-access.ts";
import { createClubOwnerAvatarPersistence } from "../../lib/touchlineArena/club-owner-avatar-persistence.ts";
import { CLUB_OWNER_AVATAR_BUCKET, createClubOwnerAvatarStorage } from "../../lib/touchlineArena/club-owner-avatar-storage.ts";
import { createAvatarRetentionRpc } from "../../lib/touchlineArena/club-owner-avatar-retention-rpc.ts";
import { isAvatarAccountId, isAvatarRevision, type AvatarCurrent, type AvatarReceipt, type AvatarControlSnapshot } from "../../lib/touchlineArena/club-owner-avatar-upload-contract.ts";

export const QA_PROJECT = "xgxbwqxjssxxuihuwmgy";
export const QA_ORIGIN = `https://${QA_PROJECT}.supabase.co`;
export const GRACE_MS = 5 * 60_000;
const STEPS = ["inspect", "publish-first", "publish-second", "retain", "verify"] as const;
type Step = typeof STEPS[number];
type Options = { projectRef: string; fixtureId: string; envFile: string | null; envSource: "file" | "process"; stateFile: string; execute: boolean; step: Step | null };
type Fixture = { operationId: string; digest: string; bytes: string; expectedRevision: string | null; baseGeneration: string | null;
  dispatch: "prepared" | "begin_sent" | "storage_sent" | "publish_sent" | "committed"; receipt: AvatarReceipt | null; committedObservedAt: string | null };
export type ProbeState = { version: 1; projectRef: string; fixtureId: string; createdAt: string; baseline: AvatarCurrent;
  fixtures: [Fixture, Fixture]; edge: null | { dispatchedAt: string; status: number | null }; bytesVerifiedAt: string | null };
function fail(code: string): never { throw new ProbeError(code); }
class ProbeError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const uuid = (v: unknown): v is string => isAvatarAccountId(v) && v === v.toLowerCase();
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : fail("INVALID_LOCAL_STATE");
const time = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const keyFor = (actor: string, f: Pick<Fixture, "operationId" | "digest">) => `${actor}/${f.operationId}/${f.digest}.webp`;

export function parseOptions(argv: string[]): Options {
  const values: Record<string, string> = {}; let execute = false;
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (name === "--execute") { if (execute) fail("INVALID_ARGUMENTS"); execute = true; continue; }
    if (!["--project-ref", "--fixture-id", "--env-file", "--env-source", "--state-file", "--step"].includes(name)
      || Object.hasOwn(values, name) || !argv[i + 1] || argv[i + 1].startsWith("--")) fail("INVALID_ARGUMENTS");
    values[name] = argv[++i];
  }
  const fileSource = values["--env-file"] !== undefined, processSource = values["--env-source"] === "process";
  if (values["--project-ref"] !== QA_PROJECT || !uuid(values["--fixture-id"])
    || fileSource === processSource || (values["--env-source"] !== undefined && !processSource)
    || (fileSource && !isAbsolute(values["--env-file"])) || !isAbsolute(values["--state-file"] ?? "")
    || (values["--step"] !== undefined && !STEPS.includes(values["--step"] as Step))
    || execute !== (values["--step"] !== undefined) || values["--env-file"] === values["--state-file"]) fail("INVALID_ARGUMENTS");
  return { projectRef: QA_PROJECT, fixtureId: values["--fixture-id"], envFile: values["--env-file"] ?? null, envSource: processSource ? "process" : "file",
    stateFile: values["--state-file"], execute, step: values["--step"] as Step ?? null };
}

const ENV_NAMES = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TOUCHLINE_OWNER_EMAILS", "NEXT_PUBLIC_SUPABASE_URL"] as const;
export function captureEnvironment(env: Record<string, string | undefined>) {
  return Object.fromEntries(ENV_NAMES.map(name => [name, env[name]]));
}

export function validateEnvironment(env: Record<string, string | undefined>) {
  if (env.SUPABASE_URL !== QA_ORIGIN || (env.NEXT_PUBLIC_SUPABASE_URL !== undefined && env.NEXT_PUBLIC_SUPABASE_URL !== QA_ORIGIN)) fail("QA_CONFIGURATION_REQUIRED");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    if (typeof serviceRoleKey !== "string" || serviceRoleKey.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(serviceRoleKey)) throw Error();
    const claims = record(JSON.parse(Buffer.from(serviceRoleKey.split(".")[1], "base64url").toString("utf8")));
    if (claims.ref !== QA_PROJECT || claims.role !== "service_role" || claims.sub !== undefined) throw Error();
  } catch { fail("QA_SERVICE_CREDENTIAL_REQUIRED"); }
  const ownerConfiguration = env.TOUCHLINE_OWNER_EMAILS ?? fail("OWNER_CONFIGURATION_REQUIRED");
  const owners = ownerConfiguration.split(",").map(v => v.trim().toLowerCase());
  if (!owners.length || owners.some(v => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) fail("OWNER_CONFIGURATION_REQUIRED");
  return { serviceRoleKey: serviceRoleKey!, ownerConfiguration };
}

export function validateState(value: unknown, fixtureId: string): ProbeState {
  const s = record(value), baseline = record(s.baseline);
  if (s.version !== 1 || s.projectRef !== QA_PROJECT || s.fixtureId !== fixtureId || !time(s.createdAt)
    || baseline.actorId !== fixtureId || baseline.revision !== "0" || baseline.operationId !== null || baseline.digest !== null
    || !(baseline.avatarUrl === null || typeof baseline.avatarUrl === "string") || !Array.isArray(s.fixtures) || s.fixtures.length !== 2) fail("INVALID_LOCAL_STATE");
  const fixtures = s.fixtures.map((value, index) => {
    const f = record(value);
    if (!uuid(f.operationId) || typeof f.digest !== "string" || !/^[a-f0-9]{64}$/.test(f.digest)
      || typeof f.bytes !== "string" || f.bytes.length > 8192 || Buffer.from(f.bytes, "base64").toString("base64") !== f.bytes
      || digest(Buffer.from(f.bytes, "base64")) !== f.digest || !["prepared", "begin_sent", "storage_sent", "publish_sent", "committed"].includes(String(f.dispatch))
      || !(f.expectedRevision === null || f.expectedRevision === String(index))
      || !(f.baseGeneration === null || isAvatarRevision(f.baseGeneration))
      || (f.expectedRevision === null) !== (f.baseGeneration === null)
      || (f.dispatch !== "prepared" && f.expectedRevision === null)
      || !(f.committedObservedAt === null || time(f.committedObservedAt))) fail("INVALID_LOCAL_STATE");
    if (f.receipt !== null) {
      const r = record(f.receipt);
      if (r.actorId !== fixtureId || r.operationId !== f.operationId || r.digest !== f.digest || r.objectKey !== keyFor(fixtureId, f as Fixture)
        || r.expectedRevision !== String(index) || r.revision !== String(index + 1) || r.avatarUrl !== `/api/account/avatar?version=${f.operationId}`
        || f.dispatch !== "committed" || !time(f.committedObservedAt)) fail("INVALID_LOCAL_STATE");
    } else if (f.dispatch === "committed" || f.committedObservedAt !== null) fail("INVALID_LOCAL_STATE");
    return f as Fixture;
  }) as [Fixture, Fixture];
  if (fixtures[0].operationId === fixtures[1].operationId || fixtures[0].digest === fixtures[1].digest
    || (fixtures[1].dispatch !== "prepared" && !fixtures[0].receipt)) fail("INVALID_LOCAL_STATE");
  if (s.edge !== null) {
    const edge = record(s.edge);
    if (!fixtures[1].receipt || !time(edge.dispatchedAt) || !(edge.status === null || Number.isInteger(edge.status) && Number(edge.status) >= 100 && Number(edge.status) <= 599)) fail("INVALID_LOCAL_STATE");
  }
  if (!(s.bytesVerifiedAt === null || time(s.bytesVerifiedAt) && s.edge !== null)) fail("INVALID_LOCAL_STATE");
  return { version: 1, projectRef: QA_PROJECT, fixtureId, createdAt: s.createdAt as string, baseline: baseline as AvatarCurrent,
    fixtures, edge: s.edge as ProbeState["edge"], bytesVerifiedAt: s.bytesVerifiedAt as string | null };
}

export function requireCurrent(current: AvatarCurrent, actor: string, receipt: AvatarReceipt | null, baseline?: AvatarCurrent) {
  const expected = receipt ? { actorId: actor, revision: receipt.revision, avatarUrl: receipt.avatarUrl, operationId: receipt.operationId, digest: receipt.digest } : baseline;
  if (!expected || Object.keys(expected).some(k => current[k as keyof AvatarCurrent] !== expected[k as keyof AvatarCurrent])) fail("CURRENT_PHOTO_CHANGED");
}
export function requireGrace(first: Fixture, now: number) {
  if (!first.receipt || !time(first.committedObservedAt)) fail("COMMIT_REQUIRED");
  if (now - Date.parse(first.committedObservedAt) < GRACE_MS) fail("REAL_GRACE_NOT_ELAPSED");
}
export function checkDueScope(data: unknown, actor: string, first: Fixture) {
  const row = record(data);
  if (row.version !== 1 || !Array.isArray(row.candidates) || row.candidates.length > 1) fail("EXTERNAL_GLOBAL_PREFLIGHT_REQUIRED");
  for (const value of row.candidates) {
    const c = record(value);
    if (!uuid(c.candidateId) || c.actorId !== actor || c.operationId !== first.operationId || c.digest !== first.digest || c.objectKey !== keyFor(actor, first)) fail("OUT_OF_SCOPE_CANDIDATE");
  }
  // Empty here means only this bounded RPC page is empty, NEVER global absence.
}
export function recoveryDecision(snapshot: AvatarControlSnapshot, f: Fixture): "new" | "committed" {
  const op = snapshot.operation;
  if (!op && f.dispatch === "prepared" && snapshot.activeOperationId === null) return "new";
  if (op?.state === "committed" && op.receipt && op.operationId === f.operationId && !op.legacy
    && op.receipt.digest === f.digest && op.receipt.expectedRevision === f.expectedRevision && op.baseGeneration === f.baseGeneration) return "committed";
  return fail("RECOVERY_REQUIRED");
}

function privateRead(path: string, maximum: number) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.uid !== process.getuid?.() || stat.size > maximum || realpathSync(path) !== resolve(path)) fail("PRIVATE_FILE_REQUIRED");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return readFileSync(fd, "utf8"); } finally { closeSync(fd); }
}
function assertPrivateDirectory(path: string) {
  const folder = dirname(path), stat = lstatSync(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.uid !== process.getuid?.() || realpathSync(folder) !== folder) fail("PRIVATE_STATE_DIRECTORY_REQUIRED");
}
function saveState(path: string, state: ProbeState) {
  validateState(state, state.fixtureId); assertPrivateDirectory(path);
  if (existsSync(path)) privateRead(path, 32_768);
  const temporary = `${path}.next`, fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, JSON.stringify(state, null, 2) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  const dir = openSync(dirname(path), constants.O_RDONLY); try { fsyncSync(dir); } finally { closeSync(dir); }
}
async function bounded(response: Response, maximum: number): Promise<Buffer> {
  const reader = response.body?.getReader(); if (!reader) fail("REMOTE_RESPONSE_UNCONFIRMED");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
      if (size > maximum) fail("REMOTE_RESPONSE_UNCONFIRMED"); chunks.push(part.value); }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseOptions(argv);
  const configuration = () => captureEnvironment(options.envSource === "process" ? process.env : parseEnv(privateRead(options.envFile!, 65_536)));
  const source = configuration(), settings = validateEnvironment(source);
  assertPrivateDirectory(options.stateFile);
  let state = existsSync(options.stateFile) ? validateState(JSON.parse(privateRead(options.stateFile, 32_768)), options.fixtureId) : null;
  const report = (status: string) => { console.log(JSON.stringify({ status, projectRef: QA_PROJECT, fixtureId: options.fixtureId,
    step: options.step, statePresent: state !== null, completeRetentionProof: false, customerFlowProved: false, flagsChanged: false })); };
  if (!options.execute) { report("LOCAL_PREFLIGHT_ONLY_NO_NETWORK"); return; }
  if (options.step === "inspect" ? state !== null : state === null) fail("CHECKPOINT_PHASE_REQUIRED");
  const lock = `${options.stateFile}.lock`, lockFd = openSync(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  writeFileSync(lockFd, String(process.pid)); fsyncSync(lockFd); closeSync(lockFd);
  try {
    // Re-read under the exclusive local lock: another invocation may have
    // finished between the initial dry-run inspection and acquiring this lock.
    state = existsSync(options.stateFile) ? validateState(JSON.parse(privateRead(options.stateFile, 32_768)), options.fixtureId) : null;
    if (options.step === "inspect" ? state !== null : state === null) fail("CHECKPOINT_PHASE_REQUIRED");
    const assertEnvironment = () => {
      const actual = configuration();
      if (ENV_NAMES.some(name => actual[name] !== source[name])) fail("PRIVATE_CONFIGURATION_CHANGED");
    };
    // Reuse the actual application owner classification with the captured file.
    process.env.TOUCHLINE_OWNER_EMAILS = settings.ownerConfiguration;
    if (!ownerEmails().length) fail("OWNER_CONFIGURATION_REQUIRED");
    const transport: typeof fetch = (input, init) => {
      assertEnvironment(); const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== QA_ORIGIN) fail("QA_TARGET_CHANGED");
      return fetch(input, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.any([AbortSignal.timeout(95_000), ...(init?.signal ? [init.signal] : [])]) });
    };
    const admin = createClient(QA_ORIGIN, settings.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transport } });
    const auth = await admin.auth.admin.getUserById(options.fixtureId);
    const user = auth.data?.user;
    if (auth.error || !user || user.id !== options.fixtureId || !user.email_confirmed_at || !user.email || !hasTouchLineArenaAccess(user) || isOwnerEmail(user.email)) fail("CUSTOMER_FIXTURE_UNCONFIRMED");
    const profile = await admin.from("users").select("id").eq("id", options.fixtureId).abortSignal(AbortSignal.timeout(10_000)).maybeSingle();
    if (profile.error || profile.data?.id !== options.fixtureId) fail("CUSTOMER_PROFILE_UNCONFIRMED");
    const persistence = createClubOwnerAvatarPersistence(admin, options.fixtureId);
    const storage = createClubOwnerAvatarStorage({ supabaseOrigin: QA_ORIGIN, serviceRoleKey: settings.serviceRoleKey, fetchImpl: transport, assertEnvironment });
    const rpc = createAvatarRetentionRpc({ supabaseOrigin: QA_ORIGIN, serviceRoleKey: settings.serviceRoleKey, fetchImpl: transport, assertEnvironment });
    const signal = () => AbortSignal.timeout(15_000);
    const current = () => persistence.readCurrent(options.fixtureId, signal());
    const checkpoint = () => saveState(options.stateFile, state!);
    async function dueScope() {
      const answer = await rpc("touchline_list_due_qa_avatar_retention_candidates", { p_project_ref: QA_PROJECT, p_limit: 25 }, signal());
      if (answer.error) fail("QUEUE_PAGE_UNCONFIRMED");
      checkDueScope(answer.data, options.fixtureId, state!.fixtures[0]);
    }
    async function exactBytes(f: Fixture, expected: "present" | "absent") {
      // Listing only this immutable operation prefix is bounded. Unknown sibling
      // metadata blocks the proof instead of disappearing behind pagination.
      const listing = await admin.storage.from(CLUB_OWNER_AVATAR_BUCKET).list(`${options.fixtureId}/${f.operationId}`, { limit: 2, offset: 0 });
      if (listing.error || !Array.isArray(listing.data)) fail("STORAGE_METADATA_UNCONFIRMED");
      const matching = listing.data.filter(x => x.name === `${f.digest}.webp` && typeof x.id === "string" && x.id.length > 0);
      if (expected === "present" ? listing.data.length !== 1 || matching.length !== 1 : listing.data.length !== 0) fail("STORAGE_METADATA_MISMATCH");
      const response = await transport(`${QA_ORIGIN}/storage/v1/object/authenticated/${CLUB_OWNER_AVATAR_BUCKET}/${keyFor(options.fixtureId, f)}?probe=${randomUUID()}`, {
        method: "GET", headers: { apikey: settings.serviceRoleKey, authorization: `Bearer ${settings.serviceRoleKey}`, "cache-control": "no-cache", "accept-encoding": "identity" }, signal: signal(),
      });
      const bytes = await bounded(response, 8192);
      if (expected === "present") {
        if (response.status !== 200 || response.headers.get("content-type")?.split(";", 1)[0] !== "image/webp"
          || digest(bytes) !== f.digest || !bytes.equals(Buffer.from(f.bytes, "base64"))) fail("STORED_BYTES_MISMATCH");
      } else {
        // Hosted Storage may wrap a precise 404 in HTTP 400. Generic 400/401/5xx
        // or malformed responses are never absence evidence.
        let missing: Record<string, unknown>; try { missing = record(JSON.parse(bytes.toString("utf8"))); } catch { return fail("ABSENCE_UNCONFIRMED"); }
        if (![400, 404].includes(response.status) || !["404", 404].includes(missing.statusCode as string | number)
          || !["not_found", "NoSuchKey"].includes(String(missing.code ?? missing.error))) fail("ABSENCE_UNCONFIRMED");
      }
    }
    if (options.step === "inspect") {
      const context = await persistence.readRecoveryContext(signal());
      if (context.current.revision !== "0" || context.current.operationId !== null || context.current.digest !== null || context.snapshot.activeOperationId !== null) fail("EMPTY_FIXTURE_REQUIRED");
      const fixtures: Fixture[] = [];
      for (const color of ["#ca4625", "#25a3ca"]) {
        const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: color } }).webp({ lossless: true }).toBuffer();
        fixtures.push({ operationId: randomUUID(), digest: digest(bytes), bytes: bytes.toString("base64"), expectedRevision: null, baseGeneration: null,
          dispatch: "prepared", receipt: null, committedObservedAt: null });
      }
      state = { version: 1, projectRef: QA_PROJECT, fixtureId: options.fixtureId, createdAt: new Date().toISOString(), baseline: context.current,
        fixtures: fixtures as [Fixture, Fixture], edge: null, bytesVerifiedAt: null };
      await dueScope(); checkpoint(); report("AWAITING_EXTERNAL_GLOBAL_PREFLIGHT_BEFORE_FIRST_PUBLICATION"); return;
    }
    if (!state) fail("CHECKPOINT_REQUIRED");
    if (options.step === "publish-first" || options.step === "publish-second") {
      const index = options.step === "publish-first" ? 0 : 1, f = state.fixtures[index];
      if (state.edge || index === 1 && !state.fixtures[0].receipt || index === 0 && state.fixtures[1].dispatch !== "prepared") fail("CHECKPOINT_PHASE_REQUIRED");
      const snapshot = await persistence.readOperationStatus(f.operationId, signal());
      const decision = recoveryDecision(snapshot, f);
      if (decision === "committed") {
        f.receipt = snapshot.operation!.receipt!; f.dispatch = "committed"; f.committedObservedAt ??= new Date().toISOString(); checkpoint();
        requireCurrent(await current(), options.fixtureId, f.receipt); await exactBytes(f, "present");
        report("COMMIT_RECONCILED_AWAITING_EXTERNAL_PREFLIGHT"); return;
      }
      requireCurrent(await current(), options.fixtureId, index === 1 ? state.fixtures[0].receipt : null, state.baseline);
      await dueScope();
      f.expectedRevision = String(index); f.baseGeneration = snapshot.generation; f.dispatch = "begin_sent"; checkpoint();
      const begin = await persistence.beginOperation({ actorId: options.fixtureId, operationId: f.operationId, expectedRevision: f.expectedRevision, baseGeneration: f.baseGeneration }, signal());
      if (begin.status !== "started" || !begin.snapshot.operation?.generation) fail("RECOVERY_REQUIRED");
      f.dispatch = "storage_sent"; checkpoint();
      const publication = { actorId: options.fixtureId, operationId: f.operationId, expectedRevision: f.expectedRevision, digest: f.digest, objectKey: keyFor(options.fixtureId, f) };
      await storage.createImmutable({ ...publication, bytes: Buffer.from(f.bytes, "base64"), contentType: "image/webp" }, signal());
      f.dispatch = "publish_sent"; checkpoint();
      const published = await persistence.publishV2({ ...publication, generation: begin.snapshot.operation.generation }, signal());
      if (published.status !== "committed" || !published.snapshot.operation?.receipt) fail("RECOVERY_REQUIRED");
      f.receipt = published.snapshot.operation.receipt; f.dispatch = "committed"; f.committedObservedAt = new Date().toISOString(); checkpoint();
      requireCurrent(await current(), options.fixtureId, f.receipt); await exactBytes(f, "present");
      report(index === 0 ? "AWAITING_EXTERNAL_PREFLIGHT_BEFORE_SECOND_PUBLICATION" : "AWAITING_REAL_GRACE_AND_EXTERNAL_GLOBAL_PREFLIGHT"); return;
    }
    if (!state.fixtures[0].receipt || !state.fixtures[1].receipt) fail("BOTH_COMMITS_REQUIRED");
    requireCurrent(await current(), options.fixtureId, state.fixtures[1].receipt);
    await exactBytes(state.fixtures[1], "present");
    if (options.step === "retain") {
      if (state.edge) fail("EDGE_ALREADY_DISPATCHED_VERIFY_ONLY");
      requireGrace(state.fixtures[0], Date.now()); await dueScope(); await exactBytes(state.fixtures[0], "present");
      requireCurrent(await current(), options.fixtureId, state.fixtures[1].receipt);
      state.edge = { dispatchedAt: new Date().toISOString(), status: null }; checkpoint();
      const response = await transport(`${QA_ORIGIN}/functions/v1/touchline-avatar-retention`, { method: "POST",
        headers: { apikey: settings.serviceRoleKey, authorization: `Bearer ${settings.serviceRoleKey}` }, signal: AbortSignal.timeout(90_000) });
      state.edge.status = response.status; checkpoint(); await response.body?.cancel();
      report("EDGE_DISPATCH_OBSERVED_AWAITING_EXTERNAL_JOURNAL_AND_VERIFY"); return;
    }
    if (!state.edge) fail("EDGE_DISPATCH_REQUIRED");
    await exactBytes(state.fixtures[0], "absent"); await exactBytes(state.fixtures[1], "present");
    requireCurrent(await current(), options.fixtureId, state.fixtures[1].receipt);
    state.bytesVerifiedAt = new Date().toISOString(); checkpoint(); report("BYTES_AND_CURRENT_VERIFIED_AWAITING_EXTERNAL_JOURNAL");
  } finally { unlinkSync(lock); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(JSON.stringify({ status: error instanceof ProbeError ? error.code : "PROBE_UNCONFIRMED_DETAILS_WITHHELD", completeRetentionProof: false })); process.exitCode = 1; });
}
