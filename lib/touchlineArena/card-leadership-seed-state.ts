import {
  advanceCardLeadershipRead,
  resetCardLeadershipSeed,
  type CardLeadershipReadState,
  type TouchlineCardLeadershipAuthority,
} from "./card-leadership-authority.ts";

export type CardLeadershipSeedState = Readonly<{
  seedKey: string;
  scopeKey: string;
  hasAcceptedRead: boolean;
  state: CardLeadershipReadState;
}>;

/**
 * RSC seeds have no client request epoch or publication activation order. Once
 * a completed shared read has been accepted, a later-arriving seed in the same
 * scope must not replace it, including an empty seed after a read/withdrawal.
 * A subsequent shared read can still withdraw or reactivate an older snapshot.
 * New explicit scopes or non-null seasons/leagues start a fresh request floor.
 */
export function reconcileCardLeadershipSeed(
  previous: CardLeadershipSeedState,
  input: {
    seedKey: string;
    scopeKey: string;
    value: TouchlineCardLeadershipAuthority;
    read: Parameters<typeof advanceCardLeadershipRead>[1];
    revision: number;
    requestFloor: number;
  },
): CardLeadershipSeedState {
  const seasonId = input.value.playerRanking?.seasonId
    ?? input.value.coachRanking?.seasonId ?? input.value.coachLeader?.seasonId ?? null;
  const leagueKey = input.value.playerRanking?.leagueKey ?? null;
  // A first explicit server anchor is a scope transition too. Otherwise a
  // simultaneous read from S1 could beat the newly supplied S2 seed merely
  // because the mount began without a season/league to compare against.
  const scopeChanged = input.scopeKey !== previous.scopeKey
    || Boolean(seasonId && seasonId !== previous.state.seasonId)
    || Boolean(leagueKey && leagueKey !== previous.state.leagueKey);
  const reset = (): CardLeadershipSeedState => ({
    seedKey: input.seedKey,
    scopeKey: input.scopeKey,
    hasAcceptedRead: false,
    state: resetCardLeadershipSeed(input.value, input.revision, input.requestFloor),
  });
  if (scopeChanged) return reset();

  // Reconcile the completed read first: React can deliver a new read and an
  // older RSC seed in the same render. Resetting first would discard that read.
  const state = advanceCardLeadershipRead(previous.state, input.read);
  const hasAcceptedRead = previous.hasAcceptedRead || state.current !== previous.state.current;
  const seedChanged = input.seedKey !== previous.seedKey;
  if (seedChanged && !hasAcceptedRead) return reset();
  if (!seedChanged && state === previous.state && hasAcceptedRead === previous.hasAcceptedRead) return previous;
  return { seedKey: input.seedKey, scopeKey: input.scopeKey, hasAcceptedRead, state };
}
