import { openClubReleaseRecoveryJournal } from "./club-release-recovery-journal.ts";
import { parseClubReleaseRecoveryReference, parseClubReleaseRecoveryResult, type ClubReleaseRecoveryReference, type ClubReleaseRecoveryResult } from "./club-release-recovery.ts";
import { clubCommandMatchesAuthority, parseClubCommandAuthority, type ClubCommandAuthority } from "./club-command-authority.ts";
import { parseClubReleaseCommand, type ClubReleaseCommand } from "./club-release.ts";
import { requestClubCollection } from "./club-collection-request.ts";

type Journal = Awaited<ReturnType<typeof openClubReleaseRecoveryJournal>>;
export type ClubReleaseRecoveryDependencies = Readonly<{
  open: () => Promise<Journal>;
  read: (reference: ClubReleaseRecoveryReference, signal: AbortSignal) => Promise<unknown>;
  now: () => number;
}>;
const defaults: ClubReleaseRecoveryDependencies = {
  open: () => openClubReleaseRecoveryJournal("touchline-release-recovery-v1"),
  read: async (reference, signal) => {
    const { response, payload } = await requestClubCollection("/api/touchline-fantasy/collection/release/recovery", {
      method: "GET", cache: "no-store", credentials: "same-origin", signal,
      headers: { "X-Touchline-Release-Reference": JSON.stringify(reference) },
    }, 8000);
    if (!response.ok || payload?.ok !== true) throw new Error("RECOVERY_READ_UNAVAILABLE");
    return payload.result;
  },
  now: () => Date.now(),
};
/** Durable intent only; no balance, credential or POST is stored/replayed here. */
export function createClubReleaseBrowserRecovery(authority: ClubCommandAuthority, deps: ClubReleaseRecoveryDependencies = defaults) {
  if (!parseClubCommandAuthority(authority)) throw new Error("RECOVERY_CONTEXT_INVALID");
  const context = { ...authority, epoch: 0 };
  let closed = false;
  let journal: Journal | undefined;
  const references = new Map<string, ClubReleaseRecoveryReference>();
  const alive = () => { if (closed) throw new Error("RECOVERY_DISPOSED"); };
  let openingExpired = false;
  let openingTimer: ReturnType<typeof setTimeout>;
  const opened = deps.open().then(async value => {
    journal = value;
    if (closed || openingExpired) { value.close(); throw new Error("RECOVERY_DISPOSED"); }
    for (const input of await value.list(context)) {
      const reference = parseClubReleaseRecoveryReference(input);
      if (!reference || !clubCommandMatchesAuthority(context, reference.expectedAccountId, reference.expectedSeasonId))
        throw new Error("RECOVERY_CONTEXT_CHANGED");
      references.set(reference.idempotencyKey, reference);
    }
    if (openingExpired) { value.close(); throw new Error("RECOVERY_UNAVAILABLE"); }
    alive(); return value;
  });
  const opening = Promise.race([opened, new Promise<Journal>((_, reject) => {
    openingTimer = setTimeout(() => { openingExpired = true; journal?.close(); reject(new Error("RECOVERY_UNAVAILABLE")); }, 8000);
  })]).finally(() => clearTimeout(openingTimer));
  // Opening begins immediately; attach a rejection observer before any await.
  void opening.catch(() => undefined);
  const sameCommand = (reference: ClubReleaseRecoveryReference, command: ClubReleaseCommand) =>
    reference.playerId === command.playerId && reference.expectedRevision === command.expectedRevision
      && reference.idempotencyKey === command.idempotencyKey && command.action === "release";
  return {
    async prepare(command: ClubReleaseCommand) {
      const store = await opening; alive();
      if (!parseClubReleaseCommand(command)) throw new Error("RECOVERY_REFERENCE_INVALID");
      const prior = references.get(command.idempotencyKey);
      if (prior && !sameCommand(prior, command) || [...references.values()].some(ref => !sameCommand(ref, command)))
        throw new Error("RECOVERY_REFERENCE_CONFLICT");
      const reference = prior ?? parseClubReleaseRecoveryReference({ schemaVersion: 1, createdAt: deps.now(), ...authority, ...command });
      if (!reference) throw new Error("RECOVERY_REFERENCE_INVALID");
      await store.append(reference); alive(); references.set(reference.idempotencyKey, reference);
    },
    async settle(command: ClubReleaseCommand) {
      const store = await opening; alive();
      const reference = references.get(command.idempotencyKey);
      if (!reference || !sameCommand(reference, command)) throw new Error("RECOVERY_REFERENCE_CONFLICT");
      await store.remove(reference); alive(); references.delete(command.idempotencyKey);
    },
    async recover(signal: AbortSignal) {
      const store = await opening; alive(); signal.throwIfAborted();
      const confirmed: ClubReleaseRecoveryResult[] = [];
      for (const reference of [...references.values()]) {
        try {
          const body = await deps.read(reference, signal); alive(); signal.throwIfAborted();
          const result = parseClubReleaseRecoveryResult(body, reference, context);
          if (!result?.resolved) continue;
          await store.remove(reference); alive(); signal.throwIfAborted();
          references.delete(reference.idempotencyKey); confirmed.push(result);
        } catch { alive(); signal.throwIfAborted(); /* unknown stays durable and blocks a new intent */ }
      }
      return { pending: [...references.values()], confirmed };
    },
    close() { closed = true; journal?.close(); },
  };
}
