"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { TouchlinePublicFixture } from "@/lib/football-data/public-fixture";
import { parseTouchlinePublicFixtures } from "@/lib/football-data/public-fixture-client";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { touchlineFixtureState, touchlineFixtureStatusLabel } from "@/lib/touchlineArena/match-centre";

type Props = {
  fixtureId: string | null;
  initialFixture: TouchlinePublicFixture | null;
  locale: TouchLineLocale;
  draftLocalesEnabled?: boolean;
};

function presentation(fixture: TouchlinePublicFixture | null, locale: TouchLineLocale, draftLocalesEnabled = false) {
  if (!fixture) return "VS";
  const hasScore = Number.isFinite(fixture.homeScore) && Number.isFinite(fixture.awayScore);
  const score = hasScore ? `${fixture.homeScore} — ${fixture.awayScore}` : "VS";
  const rawStatus = fixture.status?.trim() ?? "";
  const status = touchlineFixtureState(fixture) === "finished"
    ? touchlineFixtureStatusLabel(rawStatus, locale, draftLocalesEnabled)
    : fixture.liveMinute !== undefined
    ? `${fixture.liveMinute}′${fixture.livePeriod ? ` · ${touchlineFixtureStatusLabel(fixture.livePeriod, locale, draftLocalesEnabled)}` : ""}`
    : touchlineFixtureStatusLabel(rawStatus, locale, draftLocalesEnabled);
  return status && rawStatus.toLowerCase() !== "not started" ? `${score} · ${status}` : score;
}
/** Club Hub consumes the same durable live DTO as Arena and Live. */
export default function ClubHubLiveFixtureScore({ fixtureId, initialFixture, locale, draftLocalesEnabled = false }: Props) {
  const [fixture, setFixture] = useState(initialFixture);
  const router = useRouter();
  const surface = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!fixtureId) return;
    let active = true;
    let visible = false;
    let pending = false;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    if (surface.current) observer.observe(surface.current);
    async function refresh() {
      if (!active || !visible || document.hidden || pending) return;
      pending = true;
      try {
        const response = await fetch("/api/football-data/fantasy/livescores", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { data?: unknown };
        const fixtures = parseTouchlinePublicFixtures(payload.data);
        if (fixtures === null) return;
        const next = fixtures.find((item) => item.providerId === fixtureId);
        if (active && next) setFixture(next);
        // A validated poll (including an empty feed) can also reveal a newly
        // persisted official XI or bench in the server-owned Club Hub tree.
        if (active) router.refresh();
      } catch {
        // The server-rendered last-known-good state remains visible.
      } finally {
        pending = false;
      }
    }
    const timer = window.setInterval(refresh, 45_000);
    return () => {
      active = false;
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [fixtureId, router]);

  return <b ref={surface} aria-live="polite">{presentation(fixture, locale, draftLocalesEnabled)}</b>;
}
