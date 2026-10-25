import { Suspense, use, type ComponentType } from "react";
import ClubHubOfficialLineup from "../../components/touchline/ClubHubOfficialLineup";
import ClubHubSectionNavigation from "../../components/touchline/club-hub/ClubHubSectionNavigation";

// Controlled loader boundary only: no RSC/Next router, auth, provider or actual
// fixture selection. The real empty/unconfirmed lineup renders its own anchor.
let release: () => void;
const loaded = new Promise<void>(resolve => { release = resolve; });
export function resolveLineup() { release(); }

function DelayedLineup() {
  use(loaded);
  return <ClubHubOfficialLineup clubName="Isolated ClubHub" locale="pt-BR"
    lineup={{ status: "preview", formation: "4-3-3", players: [] }}
    labels={{ nationality: "País", points: "Pontos", totalPoints: "Total", cardPrice: "Valor" }}
    staticVisualQa liveUpdates={false} liveSeasonRating={false} />;
}

export default function ClubHubDelayedLineupBrowserFixture({ DeferredSection }: {
  DeferredSection: ComponentType<{ label: string; size: "lineup" }>;
}) {
  return <div className="club-hub-shell">
    {/* Height spacer substitutes only unrelated header/hero, not anchor logic. */}
    <div id="club-hub-top" className="club-hub-hero" style={{ height: 900 }}><h1>Native delayed-anchor experiment</h1></div>
    <ClubHubSectionNavigation locale="pt-BR" />
    {/* This explicit gap substitutes unrelated content, not anchor logic.
        Bringing the menu into view must not incidentally reveal the lineup. */}
    <div data-anchor-separation="true" aria-hidden="true" style={{ height: 1200 }} />
    <div className="club-hub-field-table-layout">
      <Suspense fallback={<DeferredSection size="lineup" label="Preparando escalação" />}>
        <DelayedLineup />
      </Suspense>
    </div>
    <div id="club-squad" style={{ height: 1000 }}>End of isolated page</div>
    <a href="/elsewhere">Leave native document</a>
  </div>;
}
