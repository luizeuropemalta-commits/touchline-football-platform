"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import TouchlineEliteExactCard, { type TouchlineEliteExactPlayer } from "@/components/touchline/cards/TouchlineEliteExactCard";
import { parseTouchlineActiveRankingState, type TouchlineActiveRankingState } from "@/lib/touchlineArena/card-ranking-live";

const STATIC_SCALE = 0.78;

/** Read-only fixture: never fabricates a publication or enables inherited QA authority. */
export default function PlayerLeaderCrownFixture({ player, locale }: { player: TouchlineEliteExactPlayer; locale: string }) {
  const [revision, setRevision] = useState(0);
  const [read, setRead] = useState<{ revision: number; state: TouchlineActiveRankingState | null; status: "ready" | "invalid" | "error" } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    // React's development effect replay cleans up before this microtask starts.
    // Do not launch a duplicate GET for an already-disposed mount.
    void Promise.resolve().then(async () => {
        if (controller.signal.aborted) return;
        const response = await fetch("/api/touchline-arena/card-ranking/active", { method: "GET", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Ranking read unavailable");
        const state = parseTouchlineActiveRankingState(await response.json());
        if (!controller.signal.aborted) setRead({ revision, state, status: state ? "ready" : "invalid" });
      })
      .catch(() => { if (!controller.signal.aborted) setRead({ revision, state: null, status: "error" }); });
    return () => controller.abort();
  }, [revision]);
  const current = read?.revision === revision ? read : null;
  return <div data-crown-fixture-status={current?.status ?? "loading"}
    data-crown-fixture-snapshot={current?.state?.snapshotId ?? ""}
    data-crown-fixture-decision={current?.state?.leadershipDecision?.status ?? "none"}
    style={{ width: 430 * STATIC_SCALE, maxWidth: "100%", display: "grid", justifyItems: "center" }}>
    <Button type="button" variant="secondary" onClick={() => setRevision(value => value + 1)}>Refresh published ranking</Button>
    <TouchlineEliteExactCard player={player} isEditable={false} persistLayoutToMaster={false}
      ignoreStoredLayout={true} startUnlocked={false} isRemovalMarkerEnabled={false}
      staticRenderScale={STATIC_SCALE} runtimeLocaleOverride={locale} subscribeToRanking={false}
      explicitQaPlayerRanking={current?.state} enableInteractiveNeon={false} showCardActions={false}
      showProfileAction={false} showMatchPoints={false} rankingMode="preview" showSocialMetrics={false} />
  </div>;
}
