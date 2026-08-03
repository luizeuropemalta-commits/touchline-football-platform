import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TOUCHLINE_ARENA_PERSISTENCE_NAMESPACE_VERSION,
  arenaPersistenceKeys,
  arenaPersistenceNamespace,
  planArenaLegacyPersistenceMigration,
} from "../lib/touchlineArena/arena-persistence-namespace.ts";

describe("TouchLine Arena persistence namespaces", () => {
  it("builds stable storage and cookie names for the same authenticated user", () => {
    const principal = { kind: "authenticated", userId: "user-123" } as const;
    const first = arenaPersistenceKeys(principal, "field-lineup");
    const second = arenaPersistenceKeys(principal, "field-lineup");

    assert.deepEqual(first, second);
    assert.equal(first.namespace.version, TOUCHLINE_ARENA_PERSISTENCE_NAMESPACE_VERSION);
    assert.equal(first.namespace.principalKind, "authenticated");
    assert.match(first.storageKey, /^touchline:arena:persistence:v2:authenticated:/);
    assert.match(first.cookieName, /^touchline_arena_persistence_v2_authenticated_/);
    assert.match(first.cookieName, /^[a-z0-9_]+$/);
  });

  it("never shares a namespace between authenticated accounts", () => {
    const first = arenaPersistenceKeys(
      { kind: "authenticated", userId: "user-one" },
      "field-lineup",
    );
    const second = arenaPersistenceKeys(
      { kind: "authenticated", userId: "user-two" },
      "field-lineup",
    );

    assert.notEqual(first.namespace.storagePrefix, second.namespace.storagePrefix);
    assert.notEqual(first.namespace.cookiePrefix, second.namespace.cookiePrefix);
    assert.notEqual(first.storageKey, second.storageKey);
    assert.notEqual(first.cookieName, second.cookieName);
  });

  it("keeps authenticated, demo and anonymous state in distinct scopes", () => {
    const authenticated = arenaPersistenceKeys(
      { kind: "authenticated", userId: "same-visible-id" },
      "formation",
    );
    const demo = arenaPersistenceKeys(
      { kind: "demo", demoId: "same-visible-id" },
      "formation",
    );
    const anonymous = arenaPersistenceKeys(
      { kind: "anonymous", sessionId: "same-visible-id" },
      "formation",
    );

    assert.equal(new Set([
      authenticated.storageKey,
      demo.storageKey,
      anonymous.storageKey,
    ]).size, 3);
    assert.equal(new Set([
      authenticated.cookieName,
      demo.cookieName,
      anonymous.cookieName,
    ]).size, 3);
  });

  it("isolates separate anonymous sessions and optional demo sandboxes", () => {
    const anonymousA = arenaPersistenceNamespace({
      kind: "anonymous",
      sessionId: "session-a",
    });
    const anonymousB = arenaPersistenceNamespace({
      kind: "anonymous",
      sessionId: "session-b",
    });
    const defaultDemo = arenaPersistenceNamespace({ kind: "demo" });
    const namedDemo = arenaPersistenceNamespace({ kind: "demo", demoId: "qa-2" });

    assert.notEqual(anonymousA.storagePrefix, anonymousB.storagePrefix);
    assert.notEqual(defaultDemo.storagePrefix, namedDemo.storagePrefix);
  });

  it("rejects empty identities and unstable resource names", () => {
    assert.throws(
      () => arenaPersistenceNamespace({ kind: "authenticated", userId: "   " }),
      /must not be empty/,
    );
    assert.throws(
      () => arenaPersistenceNamespace({ kind: "anonymous", sessionId: "" }),
      /must not be empty/,
    );
    assert.throws(
      () => arenaPersistenceKeys({ kind: "demo" }, "Field Lineup"),
      /lowercase key/,
    );
  });
});

describe("TouchLine Arena legacy persistence migration", () => {
  const principal = { kind: "authenticated", userId: "user-123" } as const;

  it("does not produce a migration without explicit authorization", () => {
    assert.equal(
      planArenaLegacyPersistenceMigration({
        principal,
        resource: "field-lineup",
        legacyStorageKey: "touchline-arena:field-lineup-v1",
      }),
      null,
    );
    assert.equal(
      planArenaLegacyPersistenceMigration({
        principal,
        resource: "field-lineup",
        legacyStorageKey: "touchline-arena:field-lineup-v1",
        authorization: { allowed: false },
      }),
      null,
    );
  });

  it("rejects authorization issued for a different account", () => {
    assert.equal(
      planArenaLegacyPersistenceMigration({
        principal,
        resource: "field-lineup",
        legacyStorageKey: "touchline-arena:field-lineup-v1",
        authorization: { allowed: true, userId: "user-456" },
      }),
      null,
    );
  });

  it("never migrates global legacy state into demo or anonymous scopes", () => {
    assert.equal(
      planArenaLegacyPersistenceMigration({
        principal: { kind: "demo" },
        resource: "field-lineup",
        legacyStorageKey: "touchline-arena:field-lineup-v1",
        authorization: { allowed: true, userId: "user-123" },
      }),
      null,
    );
    assert.equal(
      planArenaLegacyPersistenceMigration({
        principal: { kind: "anonymous", sessionId: "session-a" },
        resource: "field-lineup",
        legacyStorageKey: "touchline-arena:field-lineup-v1",
        authorization: { allowed: true, userId: "user-123" },
      }),
      null,
    );
  });

  it("returns a copy-once plan only for the explicitly authorized account", () => {
    const plan = planArenaLegacyPersistenceMigration({
      principal,
      resource: "field-lineup",
      legacyStorageKey: "touchline-arena:field-lineup-v1",
      legacyCookieName: "touchline_club_owner_roster_v1",
      authorization: { allowed: true, userId: "user-123" },
    });

    assert.ok(plan);
    assert.equal(plan.mode, "copy-once");
    assert.equal(plan.removeLegacyAfterWrite, true);
    assert.deepEqual(plan.source, {
      storageKey: "touchline-arena:field-lineup-v1",
      cookieName: "touchline_club_owner_roster_v1",
    });
    assert.deepEqual(
      plan.target,
      arenaPersistenceKeys(principal, "field-lineup"),
    );
  });

  it("rejects empty migration sources and namespaced self-migrations", () => {
    assert.throws(
      () => planArenaLegacyPersistenceMigration({
        principal,
        resource: "field-lineup",
        authorization: { allowed: true, userId: "user-123" },
      }),
      /requires a storage key or cookie name/,
    );

    const target = arenaPersistenceKeys(principal, "field-lineup");
    assert.throws(
      () => planArenaLegacyPersistenceMigration({
        principal,
        resource: "field-lineup",
        legacyStorageKey: target.storageKey,
        authorization: { allowed: true, userId: "user-123" },
      }),
      /source must differ/,
    );
  });
});
