import "server-only";

import { readClubHubNextFixturePreview } from "@/app/visual-qa/clubhub-next-fixture-post/preview-draft";

/**
 * Non-publishable 041 visual-review fixture.
 *
 * It deliberately reuses the frozen canonical card, table and venue snapshot
 * already used by ClubHub's local preview. The reader is file-backed and
 * fail-closed: it has no credential, network, analytics or write dependency.
 * This never enters the persisted 041 reader or an outbound queue.
 */
export async function readTouchlineMatchPreviewVisualQaPreview() {
  return readClubHubNextFixturePreview();
}
