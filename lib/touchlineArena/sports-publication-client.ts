"use client";

import { useMemo, useSyncExternalStore } from "react";
import { touchlineLivePresentationStore } from "./live-presentation-client-store";
import { createTouchlinePublishedLiveReader, createTouchlineSportsPublicationReader } from "./sports-publication-reader";
import { projectTouchlinePublishedLive, type TouchlineLiveAdmissionScope } from "./sports-publication-live-view";
import type { TouchlinePublicFixture } from "../football-data/public-fixture";
import type { TouchlineLiveReadMetadata } from "./match-centre";

const empty = () => null;
const inactive = () => () => undefined;

/** Reset only when the caller's canonical SSR seed/scope changes, not on a sports update. */
export function useTouchlineSportsPublication(seedKey: string, enabled = true) {
  const reader = useMemo(() => ({ seedKey, enabled,
    adapter: createTouchlineSportsPublicationReader(touchlineLivePresentationStore) }), [seedKey, enabled]);
  return useSyncExternalStore(enabled ? reader.adapter.subscribe : inactive,
    enabled ? reader.adapter.getSnapshot : empty, empty);
}

/** Shared transport; only the result strip opts into admitting new in-play fixtures. */
export function useTouchlinePublishedLive(
  seed: TouchlinePublicFixture[],
  metadata: TouchlineLiveReadMetadata | null,
  now: number,
  enabled = true,
  admissionScope: TouchlineLiveAdmissionScope | null = null,
  focusedProviderId: string | null = null,
) {
  const seedKey = JSON.stringify([seed, metadata, admissionScope]);
  const adapter = useMemo(() => {
    const [fixtures, initialMetadata, scope] = JSON.parse(seedKey) as [TouchlinePublicFixture[], TouchlineLiveReadMetadata | null, TouchlineLiveAdmissionScope | null];
    return scope
      ? createTouchlinePublishedLiveReader(touchlineLivePresentationStore, fixtures, initialMetadata, scope)
      : createTouchlinePublishedLiveReader(touchlineLivePresentationStore, fixtures, initialMetadata);
  }, [seedKey]);
  const view = useSyncExternalStore(enabled ? adapter.subscribe : inactive,
    enabled ? adapter.getSnapshot : adapter.getServerSnapshot, adapter.getServerSnapshot);
  return useMemo(() => ({
    ...projectTouchlinePublishedLive(view.fixtures, view.metadata, view.read, Math.max(now, view.read?.receivedAt ?? 0), admissionScope, focusedProviderId),
    receivedAt: view.read?.receivedAt ?? null,
  }), [view, now, admissionScope, focusedProviderId]);
}
