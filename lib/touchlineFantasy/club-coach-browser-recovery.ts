import { inspectClubAcquisition, type ClubAcquisitionState } from "./club-acquisition.ts";
import { parseClubCommandAuthority, type ClubCommandAuthority } from "./club-command-authority.ts";
import { parseClubCoachLifecycleCommand, type ClubCoachLifecycleCommand } from "./club-coach-lifecycle.ts";
import { submitClubCoachLifecycle, recoverClubCoachLifecycle } from "./club-coach-lifecycle-client.ts";

type Pending = { command: ClubCoachLifecycleCommand; before: ClubAcquisitionState };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** Per-tab journal survives reload. It grants no authorization; the server still
 * verifies identity, complete command, revision, wallet and historical receipt. */
export function createClubCoachBrowserRecovery(authority: ClubCommandAuthority, store: Store,
  fetcher: typeof fetch = fetch, timeoutMs = 20_000) {
  if (!parseClubCommandAuthority(authority)) throw Error("CLUB_CONTEXT_CHANGED");
  const captured = { ...authority };
  const key = `touchline:coach-command:v1:${captured.expectedAccountId}:${captured.expectedSeasonId}`;
  let active = true, busy = false;
  function read(): Pending | null {
    const raw = store.getItem(key);
    if (raw === null) return null;
    if (raw.length > 100_000) throw Error("CLUB_COACH_RECOVERY_UNAVAILABLE");
    const value = JSON.parse(raw);
    const command = parseClubCoachLifecycleCommand(value?.command);
    if (!command || Object.keys(value).length !== 2 || !value.before) throw Error("CLUB_COACH_RECOVERY_UNAVAILABLE");
    inspectClubAcquisition(value.before);
    if (value.before.seasonId !== captured.expectedSeasonId || value.before.revision !== command.expectedRevision) throw Error("CLUB_CONTEXT_CHANGED");
    return { command, before: value.before };
  }
  async function run(pending: Pending, mutate: boolean, previouslyAmbiguous = false) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const boundedFetch: typeof fetch = (input, init) => fetcher(input, { ...init, signal: controller.signal });
      const operation = mutate ? submitClubCoachLifecycle(pending.command, pending.before, captured, boundedFetch)
        : recoverClubCoachLifecycle(pending.command, pending.before, captured, boundedFetch);
      const result = await Promise.race([operation, new Promise<{ status: "unresolved" }>(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve({ status: "unresolved" }); }, timeoutMs);
      })]);
      if (!active) return { status: "unresolved" } as const;
      // A rejected retry cannot prove that an earlier timed-out POST did not commit.
      // Keep its identity until a durable receipt resolves that first attempt.
      if (result.status === "rejected" && previouslyAmbiguous) return { status: "unresolved" } as const;
      if (result.status === "committed" || result.status === "rejected") store.removeItem(key);
      return result;
    } finally { if (timer) clearTimeout(timer); }
  }
  return {
    hasPending: () => read() !== null,
    async submit(command: ClubCoachLifecycleCommand, before: ClubAcquisitionState) {
      if (!active || busy || read()) return { status: "unresolved" } as const;
      busy = true;
      try {
        const serialized = JSON.stringify({ command, before });
        // A write failure prevents the POST; never lose an ambiguous operation.
        store.setItem(key, serialized);
        if (store.getItem(key) !== serialized) throw Error("CLUB_COACH_RECOVERY_UNAVAILABLE");
        const pending = read();
        if (!pending) throw Error("CLUB_COACH_RECOVERY_UNAVAILABLE");
        return await run(pending, true);
      } finally { busy = false; }
    },
    async recover() {
      if (!active || busy) return { status: "unresolved" } as const;
      const pending = read();
      if (!pending) return { status: "empty" } as const;
      busy = true;
      try { return await run(pending, false); }
      finally { busy = false; }
    },
    /** Explicit user action only; retain identical key, revision and before-state. */
    async retryPending() {
      if (!active || busy) return { status: "unresolved" } as const;
      const pending = read();
      if (!pending) return { status: "empty" } as const;
      busy = true;
      try { return await run(pending, true, true); }
      finally { busy = false; }
    },
    close() { active = false; },
  };
}
