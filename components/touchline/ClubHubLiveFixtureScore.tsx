"use client";

import { useEffect, useState } from "react";

import type { TouchlinePublicFixture } from "@/lib/football-data/public-fixture";
import { parseTouchlinePublicFixtures } from "@/lib/football-data/public-fixture-client";

type Props = {
  fixtureId: string | null;
  initialFixture: TouchlinePublicFixture | null;
};

function presentation(fixture: TouchlinePublicFixture | null) {
  if (!fixture) return "VS";
  const hasScore = Number.isFinite(fixture.homeScore) && Number.isFinite(fixture.awayScore);
  const score = hasScore ? `${fixture.homeScore} — ${fixture.awayScore}` : "VS";
  const status = fixture.liveMinute !== undefined
    ? `${fixture.liveMinute}′${fixture.livePeriod ? ` · ${fixture.livePeriod}` : ""}`
    : fixture.status;
  return status && status.toLowerCase() !== "not started" ? `${score} · ${status}` : score;
}
/** Club Hub consumes the same durable live DTO as Arena and Live. */
export default function ClubHubLiveFixtureScore({ fixtureId, initialFixture }: Props) {
  const [fixture, setFixture] = useState(initialFixture);

  useEffect(() => {
    if (!fixtureId) return;
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/football-data/fantasy/livescores", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { data?: unknown };
        const fixtures = parseTouchlinePublicFixtures(payload.data);
        const next = fixtures?.find((item) => item.providerId === fixtureId);
        if (active && next) setFixture(next);
      } catch {
        // The server-rendered last-known-good state remains visible.
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 45_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [fixtureId]);

  return <b aria-live="polite">{presentation(fixture)}</b>;
}
