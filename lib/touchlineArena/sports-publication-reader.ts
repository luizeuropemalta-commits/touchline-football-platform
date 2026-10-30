import type { createTouchlineLivePresentationStore, TouchlinePresentationRead } from "./live-presentation-client-store";
import type { TouchlinePublicFixture } from "../football-data/public-fixture";
import type { TouchlineLiveReadMetadata } from "./match-centre";
import { projectTouchlinePublishedLive, type TouchlineLiveAdmissionScope } from "./sports-publication-live-view.ts";

/** Per-mount adapter: never replay another route's cache over a newer SSR seed. */
export function createTouchlineSportsPublicationReader(store: ReturnType<typeof createTouchlineLivePresentationStore>) {
  const requestFloor = store.getRequestEpoch();
  let current: TouchlinePresentationRead | null = null;
  return {
    getSnapshot: () => current,
    subscribe(notify: () => void) {
      return store.subscribe((read) => {
        if (read.requestEpoch <= requestFloor) {
          // Coalesces even if many new consumers share the older in-flight read.
          store.revalidate();
          return;
        }
        const publication = read.sportsPublication;
        if (!publication || !read.state.liveFreshness
          || read.state.liveFreshness.fetchedAt !== publication.live.fetchedAt
          || read.state.livePresentationSnapshotId !== publication.publication.contentDigest
          || read.state.playerRankingSnapshotId !== publication.publication.playerRankingSnapshotId
          || read.state.coachRankingSnapshotId !== publication.publication.coachRankingSnapshotId) return;
        current = read;
        notify();
      }, true);
    },
  };
}

/** Per-SSR-scope last-known-good view. Missing fixtures do not undo an accepted goal/VAR correction. */
export function createTouchlinePublishedLiveReader(
  store: ReturnType<typeof createTouchlineLivePresentationStore>,
  seed: TouchlinePublicFixture[],
  metadata: TouchlineLiveReadMetadata | null,
  admissionScope: TouchlineLiveAdmissionScope | null = null,
  updateSameFixtureKickoff = false,
) {
  const reader = createTouchlineSportsPublicationReader(store);
  const initial = { fixtures: seed, metadata, read: null as TouchlinePresentationRead | null };
  let current = initial;
  return {
    getSnapshot: () => current,
    getServerSnapshot: () => initial,
    subscribe(notify: () => void) {
      return reader.subscribe(() => {
        const read = reader.getSnapshot();
        if (!read) return;
        current = { ...projectTouchlinePublishedLive(current.fixtures, current.metadata, read, read.receivedAt, admissionScope, null, updateSameFixtureKickoff), read };
        notify();
      });
    },
  };
}
