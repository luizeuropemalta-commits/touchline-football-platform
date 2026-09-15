import { notFound } from "next/navigation";

import TouchlineSocialMatchPreviewLiveMotionPreview, {
  type TouchlineMatchPreviewPresentation,
} from "@/components/touchline/social/TouchlineSocialMatchPreviewLiveMotionPreview";

import { readTouchlineMatchPreviewReplayApprovalDraft } from "@/lib/touchlineArena/social-match-preview-live-replay-draft";

export const dynamic = "force-dynamic";

function presentation(value: string | undefined): TouchlineMatchPreviewPresentation {
  return value === "story" ? "story" : "feed";
}

function frame(value: string | undefined) {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Local-only frame source for the Block 1 video recorder. It never queues, stores or publishes media. */
export default async function TouchlineSocialMatchPreviewLivePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ design?: string; source?: string; presentation?: string; frameMs?: string; animate?: string }> }>) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  if (params.design !== "1" || params.source !== "replay") notFound();
  const replay = await readTouchlineMatchPreviewReplayApprovalDraft();
  const selectedPresentation = presentation(params.presentation);
  return (
    <main
      style={{ width: 1080, height: selectedPresentation === "story" ? 1920 : 1350, margin: 0, overflow: "hidden" }}
      data-match-preview-live-video-qa="non-publishable"
      data-outbound="disabled"
      data-dispatch={replay.provenance.dispatch}
      data-fixture-id={replay.provenance.fixtureId}
      data-fixture-updated-at={replay.provenance.fixtureUpdatedAt}
      data-replay-as-of={replay.provenance.replayAsOf}
      data-replay-revision={replay.provenance.replayRevision}
      data-caption={replay.draft.caption}
      data-starts-at={replay.draft.startsAt}
      data-home-team-key={replay.draft.home.teamId}
      data-away-team-key={replay.draft.away.teamId}
    >
      {/* The recorder captures only the artwork. Hide the framework dev badge
          on this local-only route so it cannot be burned into a review clip. */}
      <style>{"nextjs-portal { display: none !important; }"}</style>
      <TouchlineSocialMatchPreviewLiveMotionPreview
        draft={replay.draft}
        presentation={selectedPresentation}
        frameMs={frame(params.frameMs)}
        animate={params.animate === "1"}
      />
      <script id="match-preview-live-provenance" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(replay).replaceAll("<", "\\u003c") }} />
    </main>
  );
}
