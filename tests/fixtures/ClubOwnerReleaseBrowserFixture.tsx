import { useEffect, useRef, useState } from "react";
import { ClubOwnerReleaseDialog } from "../../components/touchline/fantasy/ClubOwnerReleaseDialog";
import TouchlineGameweekCard from "../../components/touchline/fantasy/TouchlineGameweekCard";
import type { ClubAcquisitionState } from "../../lib/touchlineFantasy/club-acquisition";
import type { ClubOwnerSquadCard } from "../../lib/touchlineArena/demo-data";

// Explicitly synthetic fixture state. No customer, session or backend is present.
const playerId = "70000000-0000-4000-8000-000000000003";
const state: ClubAcquisitionState = {
  revision: 1, seasonId: "70000000-0000-4000-8000-000000000002", plan: "vip", balanceEur: 1_145_000_000,
  coach: { id: "synthetic-coach", tier: "sapphire-blue", valueEur: 10_000_000 },
  players: [{ playerId, clubId: "synthetic-club", position: "RB", area: "outside", slot: 0, valueEur: 45_000_000 }],
  receipts: [{ key: "synthetic_purchase", playerId, area: "outside", slot: 0, valueEur: 45_000_000, revision: 1 }],
};
const card: ClubOwnerSquadCard = {
  id: playerId, canonicalPlayerId: playerId, name: "Atleta Sintético de Validação", shortName: "Synthetic", role: "defender", position: "Right Back",
  clubName: "Arsenal", shirtNumber: 27, countryCode3: "ENG", marketValue: "€95M", marketValueState: "verified", touchlinePoints: 0,
  editorialCard: { tierKey: "radiant-gold", marketValueEur: 95_000_000, marketValueState: "verified",
    cardPrice: { amountMinor: 0, currency: "GBP" }, lastReviewedAt: "2026-10-18T00:00:00Z" },
};
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
deepFreeze(state);
deepFreeze(card);
declare global {
  interface Window {
    releaseFixtureEvidence: { confirms: number; closes: number; before: string; current: () => string };
  }
}

export default function ClubOwnerReleaseBrowserFixture({ locale, available = true }: { locale: string; available?: boolean }) {
  const [open, setOpen] = useState(false);
  const evidence = useRef({ confirms: 0, closes: 0, before: JSON.stringify(state), current: () => JSON.stringify(state) });
  useEffect(() => { window.releaseFixtureEvidence = evidence.current; }, []);
  const label = locale.startsWith("pt") ? "Liberar jogador" : "Release player";
  return <main style={{ padding: 24 }}>
    <p>FIXTURE ISOLADA · dados sintéticos · sem conta ou operação financeira</p>
    <div style={{ width: 140 }}>
      <TouchlineGameweekCard card={card} locale={locale} draftLocalesEnabled displayWidth={140}
        releaseAction={{ label, onSelect: () => setOpen(true) }} />
    </div>
    {open ? <ClubOwnerReleaseDialog state={state} playerId={playerId} playerName={card.name} card={card}
      ownerName="ClubOwnerSintéticoComNomeLongoParaVerificarQuebraDeLinha" locale={locale}
      enabled available={available} busy={false} pending={false} error={null}
      onClose={() => { evidence.current.closes++; setOpen(false); }}
      onConfirm={async () => { evidence.current.confirms++; throw new Error("Financial confirmation is forbidden in the no-write fixture"); }} /> : null}
  </main>;
}
