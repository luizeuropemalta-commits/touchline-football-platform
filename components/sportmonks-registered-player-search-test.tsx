"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TouchlinePlayerCard,
  TouchlinePlayerGrid,
  type TouchlinePlayerCardModel,
} from "@/components/touchline-card-engine";
import { normalizePlayer } from "@/lib/player-normalization";

type RegisteredPlayer = {
  id: string;
  provider_player_id: string;
  display_name: string;
  name: string;
  photo_url?: string | null;
  nationality?: string | null;
  position?: string | null;
  market_value?: number | string | null;
  market_value_currency?: string | null;
  market_value_label?: string | null;
  market_value_source?: string | null;
  tier?: string | null;
  qa_club_name?: string | null;
  source_updated_at?: string | null;
  current_club?:
    | { id?: string; name?: string | null; logo_url?: string | null; competition?: { name?: string | null; logo_url?: string | null } | null }
    | { id?: string; name?: string | null; logo_url?: string | null; competition?: { name?: string | null; logo_url?: string | null } | null }[]
    | null;
};

function clubName(player: RegisteredPlayer) {
  const club = Array.isArray(player.current_club) ? player.current_club[0] : player.current_club;
  return club?.name ?? player.qa_club_name ?? null;
}

function clubLogo(player: RegisteredPlayer) {
  const club = Array.isArray(player.current_club) ? player.current_club[0] : player.current_club;
  return club?.logo_url ?? null;
}

function leagueName(player: RegisteredPlayer) {
  const club = Array.isArray(player.current_club) ? player.current_club[0] : player.current_club;
  return club?.competition?.name ?? null;
}

function shirtNumber(player: RegisteredPlayer) {
  const providerId = String(player.provider_player_id ?? "");
  const name = normalizedSearch(`${player.display_name ?? ""} ${player.name ?? ""}`);
  if (providerId === "37656179" || name.includes("lamine yamal")) return "19";
  return null;
}

function toCardPlayer(player: RegisteredPlayer, context: TouchlinePlayerCardModel["context"] = "search"): TouchlinePlayerCardModel {
  const normalized = normalizePlayer({
    id: player.id,
    sourceId: player.provider_player_id,
    name: player.display_name || player.name,
    displayName: player.display_name || player.name,
    photoUrl: player.photo_url,
    avatarUrl: player.photo_url,
    nationality: player.nationality,
    position: player.position,
    club: clubName(player),
    marketValue: typeof player.market_value === "string" ? Number(player.market_value) : player.market_value,
    marketValueText: player.market_value_label,
    currency: player.market_value_currency ?? "EUR",
    syncStatus: player.market_value_source === "approved_visual_qa_market_value" ? "QA market value override" : "Sportmonks registered",
    source: "sportmonks",
  });

  return {
    id: normalized.id,
    name: normalized.displayName,
    photoUrl: normalized.photoUrl,
    avatarUrl: normalized.avatarUrl,
    sourceImageUrl: normalized.photoUrl,
    sourceImageProvider: "sportmonks",
    sourceImageLicenseStatus: "source_tracked",
    sourceImageFetchedAt: player.source_updated_at,
    avatarRenderStatus: normalized.photoUrl ? "rendered" : "fallback",
    avatarRenderVersion: "runtime-css-v1",
    avatarRenderType: normalized.photoUrl ? "touchline_branded_render" : "touchline_initials_fallback",
    nationality: normalized.nationality,
    position: normalized.position,
    currentClub: normalized.club,
    clubBadgeUrl: clubLogo(player),
    league: leagueName(player),
    shirtNumber: shirtNumber(player),
    officialMarketValue: normalized.marketValue,
    officialMarketValueLabel: normalized.marketValueText,
    marketValue: normalized.marketValue,
    currency: normalized.currency,
    context,
    syncStatus: normalized.syncStatus,
    statusLabel: normalized.syncStatus,
    lastUpdated: player.source_updated_at,
  };
}

function normalizedSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function SportmonksRegisteredPlayerSearchTest({ compact = false }: { compact?: boolean }) {
  const [players, setPlayers] = useState<RegisteredPlayer[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("Digite o nome do atleta e baixe pelo Sportmonks.");
  const [loading, setLoading] = useState(false);

  async function readPlayers(search?: string) {
    const suffix = search ? `?q=${encodeURIComponent(search)}` : "";
    const response = await fetch(`/api/visual-qa/sportmonks-players${suffix}`, { cache: "no-store" });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error ?? "Could not load registered players.");
    return payload.players ?? [];
  }

  function applyPlayers(nextPlayers: RegisteredPlayer[]) {
    setPlayers(nextPlayers);
  }

  async function importPlayers(name?: string) {
    setLoading(true);
    const playerName = name?.trim();
    setStatus(playerName ? `Searching Sportmonks for ${playerName}...` : "Importing approved Sportmonks QA players...");
    try {
      const response = await fetch("/api/visual-qa/sportmonks-players", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(playerName ? { name: playerName } : { approvedQaImport: true }),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error ?? "Sportmonks import failed.");
      applyPlayers(payload.players ?? []);
      setSelectedId(payload.imported?.[0]?.id ?? payload.players?.[0]?.id ?? null);
      if (playerName) {
        const importedName = payload.imported?.[0]?.display_name ?? playerName;
        setSearchText(importedName);
      }
      setStatus(playerName ? `Imported ${payload.imported?.[0]?.display_name ?? playerName} from Sportmonks.` : `Registered ${payload.imported?.length ?? 0} Sportmonks players for local visual QA.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sportmonks import failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function boot() {
      try {
        const initialPlayerName = new URLSearchParams(window.location.search).get("playerName")?.trim() ?? "";
        const loaded = await readPlayers();
        if (!active) return;
        applyPlayers(loaded);
        if (initialPlayerName) {
          setSearchText(initialPlayerName);
          await importPlayers(initialPlayerName);
        } else {
          setStatus("Digite o nome do atleta e baixe pelo Sportmonks.");
        }
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : "Could not load registered players.");
      }
    }

    void boot();

    return () => {
      active = false;
    };
    // Run once on preview mount so ?playerName=... can auto-import without re-submitting on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = normalizedSearch(searchText);
    if (!needle) return players;
    return players.filter((player) => normalizedSearch(`${player.display_name} ${player.name} ${clubName(player) ?? ""}`).includes(needle));
  }, [players, searchText]);

  const selected = (selectedId ? players.find((player) => player.id === selectedId) : null) ?? filtered[0] ?? null;
  const selectedCard = selected ? toCardPlayer(selected, "search") : null;
  const gridPlayers = filtered.slice(0, 5).map((player) => toCardPlayer(player, "search"));

  return (
    <div className={compact ? "grid gap-5" : "grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]"}>
      <div className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[.04] p-4">
        <label className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-100/70" htmlFor="sportmonks-player-search">
          Buscar/importar atleta Sportmonks
        </label>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void importPlayers(searchText);
          }}
        >
          <input
            id="sportmonks-player-search"
            name="playerName"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/65 px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/50"
            placeholder="Digite o nome do atleta"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-12 rounded-2xl border border-[#a3ff12]/30 bg-[#a3ff12]/10 px-4 text-[9px] font-black uppercase tracking-[.12em] text-[#d8ff8a] disabled:opacity-50"
          >
            {loading ? "Buscando" : "Baixar"}
          </button>
        </form>
        <p className="mt-3 text-xs leading-5 text-slate-500">{status}</p>

        {!compact && filtered.length ? <div className="mt-5 space-y-2">
          {filtered.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => setSelectedId(player.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/35 p-3 text-left transition hover:border-cyan-300/30"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-black uppercase italic text-white">{player.display_name || player.name}</span>
                <span className="block truncate text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  {clubName(player) ?? "Club pending"} · {player.market_value_label ?? "Value pending"} · {player.tier}
                </span>
              </span>
            </button>
          ))}
        </div> : null}
      </div>

      <div className="min-w-0">
        {selectedCard ? <TouchlinePlayerCard player={selectedCard} variant="showcase" /> : null}
        {!compact && gridPlayers.length ? (
          <TouchlinePlayerGrid players={gridPlayers} variant="list" className="mt-6 xl:grid-cols-2" />
        ) : null}
      </div>
    </div>
  );
}
