"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";

import TouchlineEliteExactCard, { type TouchlineEliteExactPlayer } from "@/components/touchline/cards/TouchlineEliteExactCard";
import { inferArenaRole, makeArenaShortName, type ArenaLineupPlayer } from "@/lib/football-data/arena-lineup";
import {
  TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY,
  TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  type TouchlineCardTierKey,
  touchlineArenaClubTemplateForCard,
  touchlineArenaClubTemplateForTierPreview,
  touchlineArenaCompetitionTierForCard,
  formatTouchlineCardPrice,
  touchlineArenaTierForKey,
} from "@/lib/touchlineArena/card-rules";

type SportMonksCandidate = {
  sportmonksPlayerId: string;
  name: string;
  commonName?: string | null;
  clubName?: string | null;
  leagueName?: string | null;
  nationality?: string | null;
  position?: string | null;
  marketValue?: string | null;
  marketValueEur?: number | null;
  shirtNumber?: string | number | null;
};

type ProcessedAsset = {
  slug: string;
  club: string;
  kind: string;
  transparent: string;
};

const DEFAULT_PORTRAIT = "";
const DEFAULT_CLUB_TEMPLATE_URL = "/touchlineArena/cards/templates/clubs/Manchester%20City/template.png";
const CARD_STUDIO_DRAFT_KEY = `${TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY}:studio-draft`;

const CARD_PREVIEW_VALUES = [
  { label: "Ruby Red", tierKey: "ruby-red", name: "Base Player", number: 18, country: "ENG" },
  { label: "Sapphire Blue", tierKey: "sapphire-blue", name: "Blue Player", number: 22, country: "ENG" },
  { label: "Amethyst Purple", tierKey: "amethyst-purple", name: "Purple Player", number: 10, country: "BRA" },
  { label: "Radiant Gold", tierKey: "radiant-gold", name: "Rodri", number: 16, country: "ESP" },
  { label: "Emerald Green", tierKey: "emerald-green", name: "Elite Mid", number: 8, country: "FRA" },
  { label: "Clear Diamond", tierKey: "clear-diamond", name: "Diamond Pro", number: 7, country: "POR" },
  { label: "Diamond Gold", tierKey: "diamond-gold", name: "Haaland", number: 9, country: "NOR" },
] as const;

const FORMATION_CARD_SLOTS_BY_ROLE: Record<ArenaLineupPlayer["role"], Array<Pick<ArenaLineupPlayer, "x" | "y" | "heightVh">>> = {
  goalkeeper: [
    { x: 50, y: 43, heightVh: 20 },
    { x: 42, y: 45, heightVh: 19 },
    { x: 58, y: 45, heightVh: 19 },
  ],
  defender: [
    { x: 28, y: 55, heightVh: 22 },
    { x: 42, y: 53, heightVh: 22 },
    { x: 58, y: 53, heightVh: 22 },
    { x: 72, y: 55, heightVh: 22 },
    { x: 50, y: 57, heightVh: 22 },
  ],
  midfielder: [
    { x: 38, y: 68, heightVh: 25 },
    { x: 50, y: 66, heightVh: 25 },
    { x: 62, y: 68, heightVh: 25 },
    { x: 44, y: 72, heightVh: 24 },
    { x: 56, y: 72, heightVh: 24 },
  ],
  forward: [
    { x: 36, y: 82, heightVh: 27 },
    { x: 50, y: 84, heightVh: 28 },
    { x: 64, y: 82, heightVh: 27 },
    { x: 43, y: 86, heightVh: 26 },
    { x: 57, y: 86, heightVh: 26 },
  ],
};

const DEFAULT_PLAYER: TouchlineEliteExactPlayer = {
  sportmonksPlayerId: "touchline-card-studio-haaland",
  overall: 9,
  shirtNumber: 9,
  role: "Forward",
  position: "ST",
  flagUrl: "",
  countryCode3: "NOR",
  name: "Haaland",
  clubName: "Manchester City",
  clubLogoUrl: "/touchlineArena/shared/club-logos/2026-27/manchester-city.png",
  leagueName: "Premier League",
  leagueLogoUrl: "",
  marketValue: "Pending",
  marketValueSource: "unavailable",
  cardTier: "diamond-gold",
  cardPriceVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  updatedAt: "Touchline Arena",
  age: "25",
  height: "1.94m",
  foot: "Left",
  contract: "2027",
  nationality: "Norway",
  stadiumName: "Etihad Stadium",
  avatarImageUrl: DEFAULT_PORTRAIT,
  avatarStatus: "static-preview",
  sourcePhotoUrl: "",
  frameUrl: "",
  cardTemplateUrl: touchlineArenaClubTemplateForCard("Manchester City", null, "diamond-gold"),
  avatarImageScale: 1.15,
  avatarObjectPosition: "center top",
  fantasyPoints: "0.0",
};

function slugify(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clubAlias(value?: string | null) {
  const slug = slugify(value);
  if (slug.includes("manchester-city")) return "man-city";
  if (slug.includes("tottenham")) return "tottenham";
  if (slug.includes("liverpool")) return "liverpool";
  if (slug.includes("arsenal")) return "arsenal";
  return slug;
}

function findApprovedPortrait(assets: ProcessedAsset[], playerName?: string | null, clubName?: string | null) {
  const playerSlug = slugify(playerName);
  const teamSlug = clubAlias(clubName);

  return assets.find((asset) => {
    if (asset.kind !== "cards/portrait") return false;
    const samePlayer = asset.slug === playerSlug || playerSlug.includes(asset.slug) || asset.slug.includes(playerSlug);
    const sameClub = !teamSlug || asset.club === teamSlug || teamSlug.includes(asset.club) || asset.club.includes(teamSlug);
    return samePlayer && sameClub;
  });
}

function isMissingMarketValue(value?: string | number | null) {
  const text = String(value || "").trim().toUpperCase();
  return !text || text === "N/A" || text === "0" || text === "€0";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function cardPriceForTier(tierKey: TouchlineCardTierKey) {
  const tier = touchlineArenaTierForKey(tierKey);
  return formatTouchlineCardPrice(tier?.retailPriceTc ?? 0);
}

function slugifyFormationId(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function nextFormationSlot(role: ArenaLineupPlayer["role"], savedPlayers: Partial<ArenaLineupPlayer>[], playerId: string) {
  const existingPlayer = savedPlayers.find((savedPlayer) => savedPlayer.id === playerId);
  const roleCards = savedPlayers.filter((savedPlayer) => savedPlayer.id !== playerId && savedPlayer.card && savedPlayer.role === role).length;
  const slots = FORMATION_CARD_SLOTS_BY_ROLE[role];
  const defaultSlot = slots[roleCards % slots.length];

  if (existingPlayer && typeof existingPlayer.x === "number" && typeof existingPlayer.y === "number" && typeof existingPlayer.heightVh === "number") {
    return {
      x: existingPlayer.x,
      y: existingPlayer.y,
      heightVh: Math.max(existingPlayer.heightVh, defaultSlot.heightVh),
    };
  }

  return defaultSlot;
}

function cleanSportMonksCard(
  playerCard: Partial<TouchlineEliteExactPlayer>,
  current: TouchlineEliteExactPlayer,
  portraitUrl?: string,
  fallbackMarketValue?: string | number | null,
) {
  const fallbackValue = isMissingMarketValue(fallbackMarketValue) ? "N/A" : fallbackMarketValue;
  const marketValue = String(isMissingMarketValue(playerCard.marketValue) ? fallbackValue : playerCard.marketValue || "N/A");
  const cardTier = touchlineArenaCompetitionTierForCard(playerCard.cardTier || current.cardTier).key;
  const next: TouchlineEliteExactPlayer = {
    ...current,
    ...playerCard,
    sportmonksPlayerId: String(playerCard.sportmonksPlayerId || current.sportmonksPlayerId),
    name: playerCard.name || current.name,
    clubName: playerCard.clubName || current.clubName,
    leagueName: playerCard.leagueName || current.leagueName,
    role: playerCard.role || current.role,
    position: playerCard.position || current.position,
    age: playerCard.age || "N/A",
    height: playerCard.height || "N/A",
    foot: playerCard.foot || "N/A",
    contract: playerCard.contract || "N/A",
    countryCode3: playerCard.countryCode3 || current.countryCode3,
    nationality: playerCard.nationality || current.nationality,
    shirtNumber: playerCard.shirtNumber ?? "",
    overall: playerCard.overall || playerCard.shirtNumber || "—",
    marketValue,
    cardTier,
    cardPriceVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    frameUrl: "",
    cardTemplateUrl: touchlineArenaClubTemplateForCard(playerCard.clubName || current.clubName, null, cardTier),
    avatarImageUrl: portraitUrl || current.avatarImageUrl || DEFAULT_PORTRAIT,
    avatarStatus: portraitUrl ? "approved-static-asset" : "no-approved-static-portrait",
    sourcePhotoUrl: "",
    flagUrl: playerCard.flagUrl || current.flagUrl || "",
    clubLogoUrl: playerCard.clubLogoUrl || current.clubLogoUrl || "",
    leagueLogoUrl: "",
  };

  return next;
}

function buildPreviewPlayer(basePlayer: TouchlineEliteExactPlayer, preview: (typeof CARD_PREVIEW_VALUES)[number]): TouchlineEliteExactPlayer {
  return {
    ...basePlayer,
    sportmonksPlayerId: `preview-${preview.label.toLowerCase()}`,
    name: preview.name,
    overall: preview.number,
    shirtNumber: preview.number,
    countryCode3: preview.country,
    nationality: preview.country,
    marketValue: "Pending",
    marketValueSource: "unavailable",
    cardTier: preview.tierKey,
    cardPriceVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    frameUrl: "",
    cardTemplateUrl: touchlineArenaClubTemplateForTierPreview(basePlayer.clubName, preview.tierKey),
    fantasyPoints: "0.0",
  };
}

function arenaLineupCardToStudioPlayer(savedPlayer: Partial<ArenaLineupPlayer>, fallback: TouchlineEliteExactPlayer): TouchlineEliteExactPlayer {
  const card = savedPlayer.card;
  const marketValue = card?.marketValue || fallback.marketValue || "N/A";
  const playerName = card?.playerName || savedPlayer.name || fallback.name;
  const cardTier = touchlineArenaCompetitionTierForCard(card?.cardTier || fallback.cardTier).key;

  return {
    ...fallback,
    formationPlayerId: savedPlayer.id ? String(savedPlayer.id) : fallback.formationPlayerId,
    sportmonksPlayerId: savedPlayer.id ? String(savedPlayer.id) : fallback.sportmonksPlayerId,
    name: playerName,
    overall: card?.shirtNumber || fallback.overall,
    shirtNumber: card?.shirtNumber ?? fallback.shirtNumber,
    role: card?.position || savedPlayer.role || fallback.role,
    position: card?.position || savedPlayer.role || fallback.position,
    flagUrl: card?.flagUrl || fallback.flagUrl || "",
    countryCode3: card?.countryCode3 || fallback.countryCode3,
    nationality: card?.countryCode3 || fallback.nationality,
    clubName: card?.clubName || fallback.clubName,
    clubLogoUrl: card?.clubLogoUrl || fallback.clubLogoUrl || "",
    marketValue,
    cardTier,
    cardPriceVersion: card?.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    cardTemplateUrl:
      touchlineArenaClubTemplateForCard(card?.clubName || fallback.clubName, null, cardTier)
      || fallback.cardTemplateUrl,
    frameUrl: "",
    fantasyPoints: card?.fantasyPoints ?? fallback.fantasyPoints ?? "0.0",
    matchStats: card?.matchStats || fallback.matchStats,
  };
}

function readEditableArenaCard() {
  const params = new URLSearchParams(window.location.search);
  const cardId = params.get("cardId") || params.get("fromArena");

  const draft = window.localStorage.getItem(CARD_STUDIO_DRAFT_KEY);
  if (draft) {
    const parsedDraft = JSON.parse(draft) as Partial<ArenaLineupPlayer>;
    if (!cardId || parsedDraft.id === cardId) return parsedDraft;
  }

  const storedLineup = window.localStorage.getItem(TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY);
  const parsedLineup = storedLineup ? (JSON.parse(storedLineup) as Partial<ArenaLineupPlayer>[]) : [];
  if (!Array.isArray(parsedLineup)) return null;
  return parsedLineup.find((savedPlayer) => savedPlayer.id === cardId) || null;
}

function readFormationCards() {
  const storedLineup = window.localStorage.getItem(TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY);
  const parsedLineup = storedLineup ? (JSON.parse(storedLineup) as Partial<ArenaLineupPlayer>[]) : [];
  if (!Array.isArray(parsedLineup)) return [];
  return parsedLineup.filter((savedPlayer) => savedPlayer.id && savedPlayer.card && !String(savedPlayer.id).startsWith("demo-"));
}

export default function TouchlineCardStudioPage() {
  const [startsInEditMode] = useState(() => (typeof window === "undefined" ? false : new URLSearchParams(window.location.search).get("edit") === "1"));
  const cardEditSectionRef = useRef<HTMLElement | null>(null);
  const [player, setPlayer] = useState<TouchlineEliteExactPlayer>(DEFAULT_PLAYER);
  const [formationCards, setFormationCards] = useState<Partial<ArenaLineupPlayer>[]>([]);
  const [query, setQuery] = useState("Haaland");
  const [clubQuery, setClubQuery] = useState("Manchester City");
  const [candidates, setCandidates] = useState<SportMonksCandidate[]>([]);
  const [status, setStatus] = useState("Ready to search for a player.");
  const [isBusy, setIsBusy] = useState(false);
  const [assets, setAssets] = useState<ProcessedAsset[]>([]);

  const tier = useMemo(() => touchlineArenaCompetitionTierForCard(player.cardTier), [player.cardTier]);

  useEffect(() => {
    if (!startsInEditMode) return;

    try {
      const savedCards = readFormationCards();
      queueMicrotask(() => setFormationCards(savedCards));
      const editableCard = readEditableArenaCard();
      if (editableCard?.card) {
        const card = editableCard.card;
        const cardName = card.playerName || editableCard.name || "player";
        queueMicrotask(() => {
          setPlayer((current) => arenaLineupCardToStudioPlayer(editableCard, current));
          setStatus(`Card loaded for editing: ${cardName}.`);
        });
      } else if (savedCards.length) {
        queueMicrotask(() => setStatus("Edit mode is open. Choose a saved Arena card from the list."));
      }
    } catch {
      queueMicrotask(() => setStatus("Edit mode is open. Could not load the saved Arena card."));
    }

    window.requestAnimationFrame(() => {
      cardEditSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, [startsInEditMode]);

  function loadFormationCardForEditing(savedPlayer: Partial<ArenaLineupPlayer>) {
    if (!savedPlayer.card) return;
    setPlayer((current) => arenaLineupCardToStudioPlayer(savedPlayer, current));
    setStatus(`Card loaded for editing: ${savedPlayer.card.playerName || savedPlayer.name || "player"}.`);
    window.localStorage.setItem(CARD_STUDIO_DRAFT_KEY, JSON.stringify(savedPlayer));
    window.requestAnimationFrame(() => {
      cardEditSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  async function loadAssets() {
    if (assets.length) return assets;

    try {
      const response = await fetch("/touchlineArena/players/latest-processed-assets.json", { cache: "no-store" });
      const data = (await response.json()) as ProcessedAsset[];
      setAssets(data);
      return data;
    } catch {
      return [];
    }
  }

  async function searchSportMonks() {
    setIsBusy(true);
    setStatus("Searching TouchLine England data...");

    try {
      const response = await fetch("/api/players/search-and-build-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, clubQuery, searchOnly: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "TouchLine England search failed.");

      setCandidates(data.candidates || []);
      setStatus(`${data.candidates?.length || 0} players found. Choose one to fill the card.`);
    } catch (error: unknown) {
      setStatus(errorMessage(error, "Search failed."));
    } finally {
      setIsBusy(false);
    }
  }

  async function selectCandidate(candidate: SportMonksCandidate) {
    setIsBusy(true);
    setStatus(`Building ${candidate.name}'s card with TouchLine England data...`);

    try {
      const knownAssets = await loadAssets();
      const approvedPortrait = findApprovedPortrait(knownAssets, candidate.commonName || candidate.name, candidate.clubName);
      const response = await fetch("/api/players/search-and-build-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: candidate.name,
          clubQuery: candidate.clubName || clubQuery,
          sportmonksPlayerId: candidate.sportmonksPlayerId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "TouchLine England card build failed.");

      const portraitUrl = approvedPortrait?.transparent || data.playerCard?.avatarImageUrl || "";
      const sportMonksCard = {
        ...(data.playerCard || {}),
        name: data.playerCard?.name || candidate.name,
        clubName: data.playerCard?.clubName || candidate.clubName || clubQuery,
        leagueName: data.playerCard?.leagueName || candidate.leagueName || "",
        nationality: data.playerCard?.nationality || candidate.nationality || "",
        position: data.playerCard?.position || candidate.position || "Player",
        role: data.playerCard?.role || candidate.position || "Player",
        shirtNumber: data.playerCard?.shirtNumber || candidate.shirtNumber || "",
      };
      setPlayer((current) => cleanSportMonksCard(sportMonksCard, current, portraitUrl, candidate.marketValueEur || candidate.marketValue));
      const marketStatus = isMissingMarketValue(data.playerCard?.marketValue || candidate.marketValue) ? " Market value returned N/A; the card did not inherit the previous player value." : "";
      setStatus(`${portraitUrl ? "Card filled with TouchLine England data and an approved static TouchLine portrait." : "Card filled with TouchLine England data. No approved static TouchLine portrait was found."}${marketStatus}`);
    } catch (error: unknown) {
      setStatus(errorMessage(error, "Card build failed."));
    } finally {
      setIsBusy(false);
    }
  }

  function saveCurrentCardToFormation() {
    try {
      const stored = window.localStorage.getItem(TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY);
      const savedPlayers = stored ? (JSON.parse(stored) as Partial<ArenaLineupPlayer>[]) : [];
      if (stored && stored !== "[]") {
        window.localStorage.setItem(`${TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY}:backup`, stored);
      }
      const usableSavedPlayers = Array.isArray(savedPlayers) ? savedPlayers.filter((savedPlayer) => savedPlayer.id && !String(savedPlayer.id).startsWith("demo-")) : [];
      const role = inferArenaRole(player.position || player.role);
      const playerId = player.formationPlayerId || `touchline-card-${slugifyFormationId(String(player.sportmonksPlayerId || player.name))}`;
      const formationSlot = nextFormationSlot(role, usableSavedPlayers, playerId);
      const formationPlayer: ArenaLineupPlayer = {
        id: playerId,
        name: player.name,
        shortName: makeArenaShortName(player.name),
        role,
        card: {
          templateUrl:
            touchlineArenaClubTemplateForCard(player.clubName, null, player.cardTier)
            || player.cardTemplateUrl
            || DEFAULT_CLUB_TEMPLATE_URL,
          frameUrl: "",
          playerName: player.name,
          shirtNumber: player.shirtNumber || null,
          clubName: player.clubName,
          clubLogoUrl: player.clubLogoUrl || null,
          position: player.position || null,
          countryCode3: player.countryCode3 || null,
          flagUrl: player.flagUrl || null,
          fantasyPoints: player.fantasyPoints ?? "0.0",
          marketValue: player.marketValue || null,
          marketValueSource: player.marketValue ? "provider" : "unavailable",
          cardTier: touchlineArenaCompetitionTierForCard(player.cardTier).key,
          cardPriceVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
          matchStats: player.matchStats,
        },
        x: formationSlot.x,
        y: formationSlot.y,
        heightVh: formationSlot.heightVh,
      };
      const nextPlayers = [...usableSavedPlayers.filter((savedPlayer) => savedPlayer.id !== playerId), formationPlayer].slice(-11);

      window.localStorage.setItem(TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY, JSON.stringify(nextPlayers));
      setStatus(`Card saved to formation: ${player.name}. ${nextPlayers.length}/11 cards. Opening Arena...`);
      window.location.assign("/visual-qa/arena-video-preview");
    } catch (error: unknown) {
      setStatus(errorMessage(error, "Could not save the card to the formation."));
    }
  }

  return (
    <main className="min-h-screen bg-[#05070b] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_45%_0%,rgba(80,245,168,.14),transparent_30%),radial-gradient(circle_at_75%_22%,rgba(191,72,255,.16),transparent_28%),linear-gradient(180deg,#071018,#030408)]" />

      <section className="relative z-10 mx-auto grid max-w-[1480px] gap-5 xl:grid-cols-[390px_minmax(390px,1fr)_420px]">
        <aside className="rounded-lg border border-white/10 bg-black/44 p-4 shadow-[0_24px_70px_rgba(0,0,0,.38)] backdrop-blur">
          <p className="text-[10px] font-black text-cyan-100/60">TouchlineArena</p>
          <h1 className="mt-2 text-2xl font-black  leading-none">Card Studio</h1>

          <div className="mt-5 space-y-3">
            <label className="block text-[10px] font-black text-white/48">Player</label>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-md border border-white/10 bg-white/[.06] px-3 py-2 text-sm font-bold text-white outline-none focus:border-cyan-200/60" />

            <label className="block text-[10px] font-black text-white/48">Optional club</label>
            <input value={clubQuery} onChange={(event) => setClubQuery(event.target.value)} className="w-full rounded-md border border-white/10 bg-white/[.06] px-3 py-2 text-sm font-bold text-white outline-none focus:border-cyan-200/60" />

            <button onClick={searchSportMonks} disabled={isBusy} className="w-full rounded-md bg-cyan-200 px-4 py-3 text-xs font-black text-black disabled:opacity-50">
              Search player
            </button>
          </div>

          <div className="mt-4 rounded-md border border-white/10 bg-white/[.04] p-3 text-xs font-bold leading-5 text-white/72">{status}</div>

          {formationCards.length ? (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-black text-white/48">Saved Arena cards</p>
              <div className="max-h-[210px] space-y-2 overflow-auto pr-1">
                {formationCards.map((savedPlayer) => (
                  <button
                    key={savedPlayer.id}
                    type="button"
                    onClick={() => loadFormationCardForEditing(savedPlayer)}
                    className="w-full rounded-md border border-white/10 bg-white/[.045] p-3 text-left hover:border-lime-200/45 hover:bg-lime-200/10"
                  >
                    <div className="text-sm font-black text-white">{savedPlayer.card?.playerName || savedPlayer.name}</div>
                    <div className="mt-1 text-[10px] font-black text-white/46">
                      {savedPlayer.card?.clubName || "No club"} / {savedPlayer.card?.marketValue || "N/A"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 max-h-[360px] space-y-2 overflow-auto pr-1">
            {candidates.map((candidate) => (
              <button
                key={candidate.sportmonksPlayerId}
                onClick={() => selectCandidate(candidate)}
                className="w-full rounded-md border border-white/10 bg-white/[.045] p-3 text-left hover:border-cyan-200/45 hover:bg-cyan-200/10"
              >
                <div className="text-sm font-black text-white">{candidate.commonName || candidate.name}</div>
                <div className="mt-1 text-[10px] font-black text-white/46">
                  {candidate.clubName || "Sem clube"} / {candidate.position || "POS"} / {candidate.marketValue || "N/A"}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section ref={cardEditSectionRef} className="rounded-lg border border-white/10 bg-black/30 p-4 shadow-[0_30px_90px_rgba(0,0,0,.42)] backdrop-blur">
          <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-black text-white/42">Editable card</p>
              <h2 className="mt-1 text-2xl font-black ">{player.name}</h2>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <div className="rounded-md border border-white/10 bg-white/[.045] px-3 py-2 text-right text-[10px] font-black text-white/60">
                {tier.label}
                <div className="mt-1 text-cyan-100/70">{tier.material}</div>
              </div>
              <button onClick={saveCurrentCardToFormation} className="rounded-md bg-lime-300 px-4 py-2 text-[10px] font-black text-black shadow-[0_0_22px_rgba(190,242,100,.18)]">
                Save to Formation
              </button>
            </div>
          </div>

          <div className="mx-auto max-w-[430px]">
            <TouchlineEliteExactCard player={player} avatarImageFit="cover" isEditable layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY} persistLayoutToMaster startUnlocked={startsInEditMode} rankingMode="preview" />
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-white/10 bg-black/44 p-4 shadow-[0_24px_70px_rgba(0,0,0,.38)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-white/42">Card categories</p>
                <h3 className="mt-1 text-sm font-black">Preview by ranking tier</h3>
              </div>
              <span className="rounded bg-lime-300/12 px-2 py-1 text-[10px] font-black text-lime-100">No arena</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {CARD_PREVIEW_VALUES.map((preview) => {
                const previewPlayer = buildPreviewPlayer(player, preview);
                const previewTier = touchlineArenaTierForKey(preview.tierKey);
                return (
                  <button
                    key={preview.label}
                    type="button"
                    onClick={() => setPlayer(previewPlayer)}
                    className="rounded-md border border-white/10 bg-white/[.035] p-2 text-left transition hover:border-lime-200/50 hover:bg-lime-200/10"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-black text-white/58">
                      <span>{preview.label}</span>
                      <span>{previewTier?.label}</span>
                    </div>
                    <div className="relative mx-auto aspect-[430/691] w-[132px] overflow-hidden rounded-md bg-black/50">
                      <img src={touchlineArenaClubTemplateForTierPreview(player.clubName, preview.tierKey) || DEFAULT_CLUB_TEMPLATE_URL} alt={`${preview.label} club card template`} className="h-full w-full object-fill" draggable={false} />
                      <div className="absolute inset-1 rounded-[18px] shadow-[inset_0_0_0_2px_rgba(255,255,255,.35),inset_0_0_18px_rgba(255,255,255,.2)]" />
                      <div className="absolute inset-x-2 bottom-2 rounded bg-black/70 px-2 py-1 text-center text-[10px] font-black text-white">
                        TC price / {cardPriceForTier(preview.tierKey)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-emerald-200/20 bg-emerald-200/[.06] p-4 text-xs font-bold leading-5 text-emerald-50/76">
            SportMonks entra somente com dados estruturados. A tela usa apenas artes estaticas TouchLine previamente aprovadas; fotos externas e image_path permanecem bloqueados.
          </section>
        </aside>
      </section>
    </main>
  );
}
