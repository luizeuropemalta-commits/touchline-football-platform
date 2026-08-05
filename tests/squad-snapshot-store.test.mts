import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, repositoryRoot).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  persistSquadSnapshot,
  readPersistedSquadSnapshot,
} = await import("../lib/football-data/squad-snapshot-store.ts");

type Row = Record<string, unknown>;
type TableName = "football_clubs" | "football_players" | "football_squad_members";
type QueryError = { message: string };
type QueryResult = { data: Row[] | Row | null; error: QueryError | null };
type Filter =
  | { operator: "eq" | "lt" | "lte"; column: string; value: unknown }
  | { operator: "in"; column: string; value: unknown[] }
  | { operator: "not-in"; column: string; value: string[] };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function comparable(value: unknown) {
  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return value;
}

class FakeQuery implements PromiseLike<QueryResult> {
  private readonly admin: FakeAdminClient;
  private readonly table: TableName;
  private operation: "select" | "upsert" | "update" = "select";
  private payload: Row | Row[] | null = null;
  private conflictColumns: string[] = [];
  private ignoreDuplicates = false;
  private selectedColumns: string | null = null;
  private filters: Filter[] = [];
  private cardinality: "many" | "single" | "maybeSingle" = "many";

  constructor(admin: FakeAdminClient, table: TableName) {
    this.admin = admin;
    this.table = table;
  }

  select(columns: string) {
    this.selectedColumns = columns;
    return this;
  }

  upsert(
    payload: Row | Row[],
    options: { onConflict?: string; ignoreDuplicates?: boolean } = {},
  ) {
    this.operation = "upsert";
    this.payload = payload;
    this.conflictColumns = (options.onConflict ?? "").split(",").filter(Boolean);
    this.ignoreDuplicates = options.ignoreDuplicates === true;
    return this;
  }

  update(payload: Row) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ operator: "eq", column, value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ operator: "lt", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ operator: "lte", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ operator: "in", column, value });
    return this;
  }

  not(column: string, operator: string, value: string) {
    assert.equal(operator, "in");
    this.filters.push({
      operator: "not-in",
      column,
      value: value.replace(/^\(|\)$/g, "").split(",").filter(Boolean),
    });
    return this;
  }

  single() {
    this.cardinality = "single";
    return this;
  }

  maybeSingle() {
    this.cardinality = "maybeSingle";
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every((filter) => {
      const rowValue = row[filter.column];
      if (filter.operator === "eq") return String(rowValue) === String(filter.value);
      if (filter.operator === "in") {
        return filter.value.some((value) => String(value) === String(rowValue));
      }
      if (filter.operator === "not-in") {
        return !filter.value.some((value) => String(value) === String(rowValue));
      }
      const left = comparable(rowValue);
      const right = comparable(filter.value);
      return filter.operator === "lt"
        ? (left as number) < (right as number)
        : (left as number) <= (right as number);
    });
  }

  private project(row: Row) {
    if (!this.selectedColumns) return { ...row };
    return Object.fromEntries(
      this.selectedColumns.split(",").map((column) => column.trim()).map((column) => [column, row[column]]),
    );
  }

  private async execute(): Promise<QueryResult> {
    const table = this.admin.table(this.table);

    if (this.operation === "select") {
      const rows = table.filter((row) => this.matches(row)).map((row) => this.project(row));
      if (this.cardinality === "single") {
        return rows.length === 1
          ? { data: rows[0], error: null }
          : { data: null, error: { message: "single row expected" } };
      }
      if (this.cardinality === "maybeSingle") {
        return rows.length <= 1
          ? { data: rows[0] ?? null, error: null }
          : { data: null, error: { message: "at most one row expected" } };
      }
      return { data: rows, error: null };
    }

    if (this.operation === "upsert") {
      const inputRows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      await this.admin.waitBeforeUpsert(this.table, inputRows);
      const affected: Row[] = [];
      for (const rawInput of inputRows) {
        const input = this.table === "football_clubs"
          ? { ...rawInput, updated_at: this.admin.nextDatabaseRevision() }
          : rawInput;
        const existing = table.find((row) => this.conflictColumns.every(
          (column) => String(row[column]) === String(input[column]),
        ));
        if (existing) {
          if (!this.ignoreDuplicates) {
            Object.assign(existing, input);
            affected.push(existing);
          }
          continue;
        }
        const inserted = { id: this.admin.nextId(), ...input };
        table.push(inserted);
        affected.push(inserted);
      }
      const rows = affected.map((row) => this.project(row));
      if (this.cardinality === "single") {
        return rows.length === 1
          ? { data: rows[0], error: null }
          : { data: null, error: { message: "single row expected" } };
      }
      return { data: rows, error: null };
    }

    if (this.admin.consumeStaleCleanupFailure(this.table, this.payload)) {
      return { data: null, error: { message: "stale membership cleanup failed" } };
    }

    const affected = table.filter((row) => this.matches(row));
    for (const row of affected) Object.assign(row, this.payload);
    return { data: affected.map((row) => this.project(row)), error: null };
  }
}

class FakeAdminClient {
  readonly clubs: Row[] = [];
  readonly players: Row[] = [];
  readonly memberships: Row[] = [];
  failNextStaleCleanup = false;
  private idSequence = 0;
  private databaseRevisionMs = Date.now();
  private pausedMemberCount: number | null = null;
  private pauseReached = deferred();
  private pauseRelease = deferred();

  from(table: TableName) {
    return new FakeQuery(this, table);
  }

  table(table: TableName) {
    if (table === "football_clubs") return this.clubs;
    if (table === "football_players") return this.players;
    return this.memberships;
  }

  nextId() {
    this.idSequence += 1;
    return `00000000-0000-4000-8000-${String(this.idSequence).padStart(12, "0")}`;
  }

  nextDatabaseRevision() {
    this.databaseRevisionMs += 1;
    return new Date(this.databaseRevisionMs).toISOString();
  }

  pauseNextMemberUpsert(playerCount: number) {
    this.pausedMemberCount = playerCount;
    this.pauseReached = deferred();
    this.pauseRelease = deferred();
    return {
      reached: this.pauseReached.promise,
      release: this.pauseRelease.resolve,
    };
  }

  async waitBeforeUpsert(table: TableName, rows: Row[]) {
    if (table !== "football_squad_members" || rows.length !== this.pausedMemberCount) return;
    this.pausedMemberCount = null;
    this.pauseReached.resolve();
    await this.pauseRelease.promise;
  }

  consumeStaleCleanupFailure(table: TableName, payload: Row | Row[] | null) {
    if (
      !this.failNextStaleCleanup
      || table !== "football_squad_members"
      || Array.isArray(payload)
      || payload?.status !== "inactive"
    ) return false;
    this.failNextStaleCleanup = false;
    return true;
  }
}

const clubA = {
  teamId: "19",
  clubName: "Arsenal FC",
  clubShortCode: "ARS",
  clubLogoUrl: "/arsenal.png",
};

const clubB = {
  teamId: "9",
  clubName: "Manchester City",
  clubShortCode: "MCI",
  clubLogoUrl: "/city.png",
};

const playerP = {
  providerId: "100",
  name: "Player P",
  position: "Forward",
  shirtNumber: 9,
};

const playerQ = {
  providerId: "200",
  name: "Player Q",
  position: "Midfielder",
  shirtNumber: 8,
};

function squadPlayers(startingProviderId: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    providerId: String(startingProviderId + index),
    name: `Squad Player ${startingProviderId + index}`,
    position: index === 0 ? "Goalkeeper" : "Defender",
    shirtNumber: index + 1,
  }));
}

const clubAFillers = squadPlayers(300, 10);
const clubBFillers = squadPlayers(500, 10);

function adminForStore(admin: FakeAdminClient) {
  return admin as never;
}

test("inactivates absent memberships and keeps a transferred player only at the new club", async () => {
  const admin = new FakeAdminClient();

  assert.deepEqual(
    await persistSquadSnapshot(clubA, [playerP, playerQ, ...clubAFillers], adminForStore(admin)),
    { stored: true },
  );
  assert.deepEqual(
    await persistSquadSnapshot(
      clubA,
      [{ ...playerQ, shirtNumber: null }, ...clubAFillers],
      adminForStore(admin),
    ),
    { stored: true },
  );
  assert.deepEqual(
    await persistSquadSnapshot(clubB, [playerP, ...clubBFillers], adminForStore(admin)),
    { stored: true },
  );

  const snapshotA = await readPersistedSquadSnapshot(clubA.teamId, adminForStore(admin));
  const snapshotB = await readPersistedSquadSnapshot(clubB.teamId, adminForStore(admin));
  assert.equal(snapshotA?.players.length, 11);
  assert.equal(snapshotA?.players.some((player) => player.providerId === playerP.providerId), false);
  assert.equal(
    snapshotA?.players.find((player) => player.providerId === playerQ.providerId)?.jerseyNumber,
    playerQ.shirtNumber,
  );
  assert.equal(snapshotB?.players.length, 11);
  assert.equal(snapshotB?.players.some((player) => player.providerId === playerP.providerId), true);

  const playerPRow = admin.players.find((player) => player.provider_player_id === playerP.providerId);
  const clubARow = admin.clubs.find((club) => club.provider_team_id === clubA.teamId);
  const oldMembership = admin.memberships.find(
    (member) => member.club_id === clubARow?.id && member.player_id === playerPRow?.id,
  );
  assert.equal(oldMembership?.status, "inactive");
  assert.ok(
    admin.memberships
      .filter((member) => member.club_id === clubARow?.id && member.status === "active")
      .every((member) => member.source_updated_at === clubARow?.updated_at),
  );
});

test("uses one coherent club revision for freshness and rejects a mixed revision", async () => {
  const admin = new FakeAdminClient();
  assert.deepEqual(
    await persistSquadSnapshot(clubA, [playerP, playerQ, ...clubAFillers], adminForStore(admin)),
    { stored: true },
  );

  const oldRevision = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  for (const membership of admin.memberships) membership.source_updated_at = oldRevision;
  const expiredSnapshot = await readPersistedSquadSnapshot(clubA.teamId, adminForStore(admin));

  assert.equal(expiredSnapshot?.capturedAt, oldRevision);
  assert.equal(expiredSnapshot?.fresh, false);

  admin.memberships[0].source_updated_at = new Date().toISOString();
  const mixedSnapshot = await readPersistedSquadSnapshot(clubA.teamId, adminForStore(admin));
  assert.equal(mixedSnapshot, null);
});

test("does not collapse distinct PostgreSQL microsecond revisions into one snapshot", async () => {
  const admin = new FakeAdminClient();
  assert.deepEqual(
    await persistSquadSnapshot(clubA, [playerP, playerQ, ...clubAFillers], adminForStore(admin)),
    { stored: true },
  );

  admin.memberships[0].source_updated_at = "2026-07-28T12:00:00.123456+00:00";
  admin.memberships[1].source_updated_at = "2026-07-28T12:00:00.123789+00:00";
  assert.equal(await readPersistedSquadSnapshot(clubA.teamId, adminForStore(admin)), null);
});

test("does not expose a coherent but incomplete persisted squad", async () => {
  const admin = new FakeAdminClient();
  assert.deepEqual(
    await persistSquadSnapshot(clubA, [playerQ, ...clubAFillers], adminForStore(admin)),
    { stored: true },
  );

  admin.memberships.pop();
  assert.equal(await readPersistedSquadSnapshot(clubA.teamId, adminForStore(admin)), null);
});

test("never publishes legacy unscoped members for a competition-scoped club and repairs them on refresh", async () => {
  const admin = new FakeAdminClient();
  const squad = [playerP, playerQ, ...clubAFillers];
  assert.deepEqual(
    await persistSquadSnapshot(clubA, squad, adminForStore(admin)),
    { stored: true },
  );

  const club = admin.clubs.find((row) => row.provider_team_id === clubA.teamId)!;
  club.competition_id = "touchline-england";
  for (const member of admin.memberships) member.competition_id = "touchline-england";
  admin.memberships[0]!.competition_id = null;

  const isolatedSnapshot = await readPersistedSquadSnapshot(clubA.teamId, adminForStore(admin));
  assert.equal(isolatedSnapshot?.players.length, 11);
  assert.equal(isolatedSnapshot?.players.some((player) => player.providerId === playerP.providerId), false);

  assert.deepEqual(
    await persistSquadSnapshot(clubA, squad, adminForStore(admin)),
    { stored: true },
  );
  assert.ok(admin.memberships.every((member) => member.competition_id === "touchline-england"));
  assert.equal((await readPersistedSquadSnapshot(clubA.teamId, adminForStore(admin)))?.players.length, 12);
});

test("an older concurrent persistence cannot reactivate a player removed by a newer revision", async () => {
  const admin = new FakeAdminClient();
  assert.deepEqual(
    await persistSquadSnapshot(clubA, [playerP, playerQ, ...clubAFillers], adminForStore(admin)),
    { stored: true },
  );

  const pause = admin.pauseNextMemberUpsert(12);
  const olderPersistence = persistSquadSnapshot(
    clubA,
    [playerP, playerQ, ...clubAFillers],
    adminForStore(admin),
  );
  await pause.reached;
  const newerPersistence = persistSquadSnapshot(clubA, [playerQ, ...clubAFillers], adminForStore(admin));
  assert.deepEqual(await newerPersistence, { stored: true });
  pause.release();
  assert.deepEqual(await olderPersistence, { stored: false, reason: "snapshot-superseded" });

  const snapshot = await readPersistedSquadSnapshot(clubA.teamId, adminForStore(admin));
  assert.equal(snapshot?.players.length, 11);
  assert.equal(snapshot?.players.some((player) => player.providerId === playerP.providerId), false);
  assert.equal(snapshot?.fresh, true);
});

test("rolls its own revision back and keeps the previous coherent fallback when cleanup fails", async () => {
  const admin = new FakeAdminClient();
  assert.deepEqual(
    await persistSquadSnapshot(clubA, [playerP, playerQ, ...clubAFillers], adminForStore(admin)),
    { stored: true },
  );
  const previousSnapshot = await readPersistedSquadSnapshot(clubA.teamId, adminForStore(admin));

  admin.failNextStaleCleanup = true;
  const result = await persistSquadSnapshot(clubA, [playerQ, ...clubAFillers], adminForStore(admin));
  assert.deepEqual(result, { stored: false, reason: "stale membership cleanup failed" });

  const snapshot = await readPersistedSquadSnapshot(clubA.teamId, adminForStore(admin));
  assert.equal(snapshot?.players.length, 12);
  assert.equal(snapshot?.players.some((player) => player.providerId === playerP.providerId), true);
  assert.equal(snapshot?.capturedAt, previousSnapshot?.capturedAt);
  assert.equal(snapshot?.fresh, true);
});

test("rejects incomplete or duplicate provider payloads before touching memberships", async () => {
  const admin = new FakeAdminClient();
  assert.deepEqual(
    await persistSquadSnapshot(clubA, [playerP], adminForStore(admin)),
    { stored: false, reason: "incomplete-squad" },
  );

  const duplicateSquad = [playerP, ...clubAFillers, { ...clubAFillers[0] }];
  assert.deepEqual(
    await persistSquadSnapshot(clubA, duplicateSquad, adminForStore(admin)),
    { stored: false, reason: "invalid-squad-identities" },
  );
  assert.equal(admin.memberships.length, 0);
});
