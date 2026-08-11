import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLUB_OWNER_SQUAD_CARDS,
  clubOwnerSquadMarketValue,
  clubOwnerSquadTcValue,
  rankClubOwnerCards,
} from "../lib/touchlineArena/demo-data.ts";
import {
  canonicalClubOwnerRosterCard,
  clubOwnerRosterMarketValue,
  partitionClubOwnerRoster,
  parseClubOwnerRoster,
  serializeClubOwnerRoster,
  uniqueClubOwnerRosterCards,
  writeBrowserClubOwnerRoster,
} from "../lib/touchlineArena/club-owner-roster.ts";
import { arenaPersistenceKeys } from "../lib/touchlineArena/arena-persistence-namespace.ts";
import { parseMarketValueEur } from "../lib/touchlineArena/card-rules.ts";
import { normalizeOfficialShirtNumber } from "../lib/football-data/arena-lineup.ts";

function withFakeBrowser(
  run: (browser: {
    cookieWrites: string[];
    events: Event[];
    localStorage: Map<string, string>;
  }) => void,
) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const localStorage = new Map<string, string>();
  const cookieWrites: string[] = [];
  const events: Event[] = [];

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        setItem(key: string, value: string) {
          localStorage.set(key, value);
        },
      },
      dispatchEvent(event: Event) {
        events.push(event);
        return true;
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      set cookie(value: string) {
        cookieWrites.push(value);
      },
    },
  });

  try {
    run({ cookieWrites, events, localStorage });
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

describe("TouchLine ClubOwner roster accounting", () => {
  it("derives the current squad TC value from every owned card", () => {
    assert.equal(clubOwnerSquadTcValue(CLUB_OWNER_SQUAD_CARDS), 0);
    assert.equal(clubOwnerSquadTcValue(CLUB_OWNER_SQUAD_CARDS.slice(0, 11)), 0);
  });

  it("keeps local demo cards neutral rather than presenting a valuation", () => {
    assert.equal(clubOwnerSquadMarketValue(CLUB_OWNER_SQUAD_CARDS), 0);
    assert.ok(CLUB_OWNER_SQUAD_CARDS.every((card) => card.marketValue === ""));
    assert.ok(CLUB_OWNER_SQUAD_CARDS.every((card) => card.marketValueSource === "unavailable"));
  });

  it("subtracts the exact card value when a contract is released", () => {
    const providerRoster = CLUB_OWNER_SQUAD_CARDS.map((card, index) => ({
      ...card,
      marketValue: `€${index + 1}M`,
      marketValueSource: "provider" as const,
    }));
    const released = providerRoster[0];
    const before = clubOwnerRosterMarketValue(providerRoster);
    const afterRoster = providerRoster.filter((card) => card.id !== released.id);

    assert.equal(afterRoster.length, providerRoster.length - 1);
    assert.equal(
      clubOwnerRosterMarketValue(afterRoster),
      before - parseMarketValueEur(released.marketValue),
    );
  });

  it("keeps the reduced roster and value through the cookie serialization round trip", () => {
    const reducedRoster = CLUB_OWNER_SQUAD_CARDS.slice(3);
    const restoredRoster = parseClubOwnerRoster(serializeClubOwnerRoster(reducedRoster));

    assert.deepEqual(restoredRoster.map((card) => card.id), reducedRoster.map((card) => card.id));
    assert.equal(
      clubOwnerRosterMarketValue(restoredRoster),
      clubOwnerRosterMarketValue(reducedRoster),
    );
  });

  it("preserves the exact field, bench and reserve order through save and reload", () => {
    const reorderedRoster = [
      CLUB_OWNER_SQUAD_CARDS[12],
      CLUB_OWNER_SQUAD_CARDS[3],
      CLUB_OWNER_SQUAD_CARDS[28],
      ...CLUB_OWNER_SQUAD_CARDS.filter((_, index) => ![12, 3, 28].includes(index)),
    ];
    const restoredRoster = parseClubOwnerRoster(serializeClubOwnerRoster(reorderedRoster));

    assert.deepEqual(
      restoredRoster.map((card) => card.id),
      reorderedRoster.map((card) => card.id),
    );
  });

  it("does not count the same contract twice", () => {
    const first = {
      ...CLUB_OWNER_SQUAD_CARDS[0],
      marketValue: "€25M",
      marketValueSource: "provider" as const,
    };
    const deduplicated = uniqueClubOwnerRosterCards([first, first]);

    assert.equal(deduplicated.length, 1);
    assert.equal(clubOwnerRosterMarketValue(deduplicated), parseMarketValueEur(first.marketValue));
  });

  it("keeps every owned card in one explicit ClubOwner view: XI and a unified position-ready bench", () => {
    const repeatedFirstCard = { ...CLUB_OWNER_SQUAD_CARDS[0] };
    const sections = partitionClubOwnerRoster([
      ...CLUB_OWNER_SQUAD_CARDS,
      repeatedFirstCard,
    ]);

    assert.equal(sections.allCards.length, CLUB_OWNER_SQUAD_CARDS.length);
    assert.equal(sections.startingXiCards.length, 11);
    assert.equal(sections.matchdayBenchCards.length, 9);
    assert.equal(sections.reserveVaultCards.length, CLUB_OWNER_SQUAD_CARDS.length - 20);
    assert.equal(sections.allBenchCards.length, CLUB_OWNER_SQUAD_CARDS.length - 11);
    assert.deepEqual(
      [...sections.startingXiCards, ...sections.matchdayBenchCards, ...sections.reserveVaultCards]
        .map((card) => card.id),
      CLUB_OWNER_SQUAD_CARDS.map((card) => card.id),
    );
    assert.deepEqual(
      [...sections.startingXiCards, ...sections.allBenchCards].map((card) => card.id).sort(),
      CLUB_OWNER_SQUAD_CARDS.map((card) => card.id).sort(),
    );
  });

  it("discards a legacy local value that has no provenance", () => {
    const canonical = canonicalClubOwnerRosterCard({
      ...CLUB_OWNER_SQUAD_CARDS[0],
      marketValue: "€180M",
      marketValueSource: undefined,
    });

    assert.equal(canonical.marketValue, "");
    assert.equal(canonical.marketValueSource, "unavailable");
  });

  it("never overwrites a provider market value with a demo seed", () => {
    const seeded = CLUB_OWNER_SQUAD_CARDS.find((card) => card.id === "haaland")!;
    const canonical = canonicalClubOwnerRosterCard({
      ...seeded,
      marketValue: "€200M",
      marketValueSource: "provider",
    });

    assert.equal(canonical.marketValue, "€200M");
    assert.equal(canonical.marketValueSource, "provider");
  });

  it("keeps a provider market value and its authority after save and reload", () => {
    const seeded = CLUB_OWNER_SQUAD_CARDS.find((card) => card.id === "haaland")!;
    const providerCard = {
      ...seeded,
      marketValue: "€200M",
      marketValueSource: "provider" as const,
      cardPriceVersion: "provider-regression-v2",
    };
    const restored = parseClubOwnerRoster(serializeClubOwnerRoster([
      providerCard,
      ...CLUB_OWNER_SQUAD_CARDS.filter((card) => card.id !== providerCard.id),
    ])).find((card) => card.id === providerCard.id)!;

    assert.equal(restored.marketValue, "€200M");
    assert.equal(restored.marketValueSource, "provider");
    assert.equal(restored.cardPriceVersion, "provider-regression-v2");
  });

  it("preserves the authoritative contract identity through the current roster round trip", () => {
    const inventoryId = "cb58b289-dbb6-4a2f-8db5-bf3af1cb8d6e";
    const seeded = CLUB_OWNER_SQUAD_CARDS[0];
    const restored = parseClubOwnerRoster(serializeClubOwnerRoster([
      { ...seeded, inventoryId, cardPriceAuthority: "active-contract" as const },
    ]), { fallback: "empty" });

    assert.equal(restored.length, 1);
    assert.equal(restored[0].inventoryId, inventoryId);
    assert.equal(restored[0].cardPriceAuthority, "active-contract");
  });

  it("preserves canonical public states and verified EUR 0 through the V6 roster round trip", () => {
    const seeded = CLUB_OWNER_SQUAD_CARDS[0];
    const restored = parseClubOwnerRoster(serializeClubOwnerRoster([
      {
        ...seeded,
        marketValue: "€0",
        marketValueSource: "verified-cache",
        marketValueState: "verified",
        classificationState: "verified",
        cardTier: "ruby-red",
      },
    ]), { fallback: "empty" });

    assert.equal(restored.length, 1);
    assert.equal(restored[0]?.marketValue, "€0");
    assert.equal(restored[0]?.marketValueState, "verified");
    assert.equal(restored[0]?.classificationState, "verified");
    assert.equal(restored[0]?.cardTier, "ruby-red");
  });

  it("keeps an active contract's stored nominal value when its live market value is pending", () => {
    const activeContract = {
      ...CLUB_OWNER_SQUAD_CARDS[0],
      marketValue: "Pending",
      marketValueSource: "unavailable" as const,
      marketValueState: "pending" as const,
      classificationState: "pending" as const,
      cardTier: "emerald-green" as const,
      cardPriceVersion: "2026-07-premier-v1",
      cardPriceAuthority: "active-contract" as const,
    };

    assert.equal(clubOwnerSquadTcValue([activeContract]), 7);
  });

  it("keeps a new authenticated roster empty when no namespaced value exists", () => {
    assert.deepEqual(parseClubOwnerRoster(null, { fallback: "empty" }), []);
    assert.equal(parseClubOwnerRoster(null).length, CLUB_OWNER_SQUAD_CARDS.length);
  });

  it("keeps authenticated roster data in localStorage and expires its legacy namespaced cookie", () => {
    const principal = {
      kind: "authenticated" as const,
      userId: "9f5b298d-e2d4-4f96-aa89-927994e73976",
    };
    const keys = arenaPersistenceKeys(principal, "club-owner-roster");

    withFakeBrowser(({ cookieWrites, events, localStorage }) => {
      writeBrowserClubOwnerRoster(CLUB_OWNER_SQUAD_CARDS.slice(0, 3), { principal });

      assert.ok(localStorage.get(keys.storageKey));
      assert.deepEqual(cookieWrites, [
        `${keys.cookieName}=; Path=/; Max-Age=0; SameSite=Lax`,
      ]);
      assert.equal(events.length, 1);
    });
  });

  it("continues persisting the demo roster cookie for demo server-rendered pages", () => {
    const principal = {
      kind: "demo" as const,
      demoId: "touchline-release-preview",
    };
    const keys = arenaPersistenceKeys(principal, "club-owner-roster");

    withFakeBrowser(({ cookieWrites, events, localStorage }) => {
      writeBrowserClubOwnerRoster(CLUB_OWNER_SQUAD_CARDS.slice(0, 3), { principal });

      const serializedRoster = localStorage.get(keys.storageKey);
      assert.ok(serializedRoster);
      assert.deepEqual(cookieWrites, [
        `${keys.cookieName}=${serializedRoster}; Path=/; Max-Age=31536000; SameSite=Lax`,
      ]);
      assert.equal(events.length, 1);
    });
  });

  it("preserves a missing official shirt number instead of inventing one", () => {
    const seeded = CLUB_OWNER_SQUAD_CARDS[0];
    const restored = parseClubOwnerRoster(serializeClubOwnerRoster([
      { ...seeded, shirtNumber: null },
    ])).find((card) => card.id === seeded.id)!;

    assert.equal(restored.shirtNumber, null);
  });

  it("does not use market value to break equal TouchLine Points", () => {
    const lowerMarket = {
      ...CLUB_OWNER_SQUAD_CARDS[0],
      id: "alpha",
      name: "Alpha",
      clubName: "Alpha FC",
      marketValue: "€1M",
      touchlinePoints: 10,
    };
    const higherMarket = {
      ...CLUB_OWNER_SQUAD_CARDS[1],
      id: "zulu",
      name: "Zulu",
      clubName: "Zulu FC",
      marketValue: "€300M",
      touchlinePoints: 10,
    };

    assert.deepEqual(
      [higherMarket, lowerMarket].sort(rankClubOwnerCards).map((card) => card.id),
      ["alpha", "zulu"],
    );
  });

  it("accepts only official football shirt-number range values", () => {
    assert.equal(normalizeOfficialShirtNumber("9"), 9);
    assert.equal(normalizeOfficialShirtNumber(99), 99);
    assert.equal(normalizeOfficialShirtNumber(0), null);
    assert.equal(normalizeOfficialShirtNumber(100), null);
    assert.equal(normalizeOfficialShirtNumber("unknown"), null);
  });
});
