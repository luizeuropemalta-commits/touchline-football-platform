import { parseClubReleaseRecoveryReference, type ClubReleaseRecoveryReference } from "./club-release-recovery.ts";
import { parseClubCommandAuthority, type ClubCommandAuthority } from "./club-command-authority.ts";

const storeName = "references";
const key = (ref: ClubReleaseRecoveryReference): IDBValidKey =>
  [ref.expectedAccountId, ref.expectedSeasonId, ref.idempotencyKey];
const same = (a: ClubReleaseRecoveryReference, b: ClubReleaseRecoveryReference) =>
  a.schemaVersion === b.schemaVersion && a.createdAt === b.createdAt
  && a.expectedAccountId === b.expectedAccountId && a.expectedSeasonId === b.expectedSeasonId
  && a.action === b.action && a.playerId === b.playerId
  && a.expectedRevision === b.expectedRevision && a.idempotencyKey === b.idempotencyKey;

/** Isolated adapter, not wired to any page. No delete, expiry, auth, send or settlement. */
export async function openClubReleaseRecoveryJournal(name: string, factory: IDBFactory = indexedDB) {
  if (!name) throw new Error("RECOVERY_JOURNAL_NAME_REQUIRED");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: ["expectedAccountId", "expectedSeasonId", "idempotencyKey"] });
    };
    request.onerror = () => reject(request.error ?? new Error("RECOVERY_JOURNAL_OPEN_FAILED"));
    request.onblocked = () => { blocked = true; reject(new Error("RECOVERY_JOURNAL_BLOCKED")); };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
  });
  db.onversionchange = () => db.close();
  function transaction<T>(mode: IDBTransactionMode, prepare: (store: IDBObjectStore, result: (value: T) => void, fail: (error: Error) => void) => void) {
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      let value: T;
      let prepared = false;
      let failure: Error | null = null;
      tx.oncomplete = () => prepared ? resolve(value) : reject(new Error("RECOVERY_JOURNAL_INCOMPLETE"));
      tx.onabort = () => reject(failure ?? tx.error ?? new Error("RECOVERY_JOURNAL_ABORTED"));
      tx.onerror = () => { failure ??= tx.error ?? new Error("RECOVERY_JOURNAL_FAILED"); };
      const fail = (error: Error) => { failure = error; tx.abort(); };
      try { prepare(tx.objectStore(storeName), result => { value = result; prepared = true; }, fail); }
      catch (error) { fail(error instanceof Error ? error : new Error("RECOVERY_JOURNAL_FAILED")); }
    });
  }
  return {
    async append(input: unknown): Promise<"inserted" | "existing"> {
      const reference = parseClubReleaseRecoveryReference(input);
      if (!reference) throw new Error("RECOVERY_REFERENCE_INVALID");
      return transaction("readwrite", (store, result, fail) => {
        const read = store.get(key(reference));
        read.onsuccess = () => {
          if (read.result !== undefined) {
            const prior = parseClubReleaseRecoveryReference(read.result);
            if (!prior || !same(prior, reference)) { fail(new Error("RECOVERY_REFERENCE_CONFLICT")); return; }
            result("existing"); return;
          }
          const write = store.add(reference);
          write.onsuccess = () => result("inserted"); // Not resolved until tx.oncomplete.
        };
      });
    },
    async list(context: ClubCommandAuthority): Promise<readonly ClubReleaseRecoveryReference[]> {
      if (!parseClubCommandAuthority(context)) throw new Error("RECOVERY_CONTEXT_INVALID");
      return transaction("readonly", (store, result, fail) => {
        const read = store.getAll(IDBKeyRange.bound(
          [context.expectedAccountId, context.expectedSeasonId, ""],
          [context.expectedAccountId, context.expectedSeasonId, "\uffff"],
        ));
        read.onsuccess = () => {
          const references = (read.result as unknown[]).map(parseClubReleaseRecoveryReference);
          if (references.some(ref => !ref || ref.expectedAccountId !== context.expectedAccountId || ref.expectedSeasonId !== context.expectedSeasonId)) {
            fail(new Error("RECOVERY_JOURNAL_CORRUPT")); return;
          }
          result(references as ClubReleaseRecoveryReference[]);
        };
      });
    },
    close: () => db.close(),
  };
}
