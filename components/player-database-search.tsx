"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown, DatabaseZap, Loader2, Search, UploadCloud, UserRoundSearch } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { GamePanel, SectionHeader } from "@/components/game-ui";
import { TouchlineAgentIdentityCard, TouchlineClubIdentityCard, TouchlineCoachIdentityCard, TouchlinePlayerCard } from "@/components/touchline-card-engine";
import { buildTdiePlayerIdentity } from "@/lib/tdie/player-identity";
import { cn } from "@/lib/utils";

type PlayerDatabaseResult = {
  id: string;
  transfermarktPlayerId: string;
  sourceProvider?: string | null;
  sourceId?: string | null;
  sourceLabel?: string | null;
  sourceLinkLabel?: string | null;
  name: string;
  profileUrl: string;
  photoUrl?: string | null;
  currentClub?: string | null;
  position?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  age?: number | null;
  agentName?: string | null;
  agencyName?: string | null;
  marketValue?: number | null;
  marketValueText?: string | null;
  currency?: string | null;
  lastUpdatedAt?: string | null;
};

type NetworkSearchResult = {
  id: string;
  transfermarktId: string;
  type: "agent" | "club";
  name: string;
  profileUrl: string;
  photoUrl?: string | null;
  status: string;
  players: Array<{
    id: string;
    transfermarktId?: string | null;
    name?: string | null;
    profileUrl?: string | null;
    internalProfileUrl?: string | null;
    photoUrl?: string | null;
    status?: string | null;
    relationshipType?: string | null;
  }>;
};

type SearchTab = "all" | "players" | "clubs" | "agents" | "coaches";

const emptyImport = {
  url: "",
  playerName: "",
  currentClub: "",
  position: "",
  nationality: "",
  photoUrl: "",
};

function ageFromDate(date?: string | null) {
  if (!date) return null;
  const birth = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const month = now.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function marketValue(player: PlayerDatabaseResult) {
  if (player.marketValueText) return player.marketValueText;
  if (typeof player.marketValue === "number" && Number.isFinite(player.marketValue)) {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: player.currency ?? "EUR",
      maximumFractionDigits: 0,
    }).format(player.marketValue);
  }
  return "Data not available";
}

function playerCardModel(player: PlayerDatabaseResult) {
  const age = player.age ?? ageFromDate(player.dateOfBirth);

  return {
    id: player.id,
    name: player.name,
    initials: initials(player.name),
    tdieIdentity: buildTdiePlayerIdentity({
      playerSource: "football-search",
      playerSourceId: player.id,
      provider: player.sourceProvider ?? "touchline",
      providerPlayerId: player.sourceId ?? player.transfermarktPlayerId,
      name: player.name,
      clubName: player.currentClub,
      position: player.position,
      nationality: player.nationality,
      marketValue: player.marketValue,
      currency: player.currency ?? "EUR",
      sourceReferenceUrl: player.profileUrl,
      sourcePhotoUrl: player.photoUrl,
      sourceUpdatedAt: player.lastUpdatedAt,
    }),
    nationality: player.nationality,
    position: player.position,
    age,
    currentClub: player.currentClub,
    currentAgent: player.agentName ?? player.agencyName,
    officialMarketValue: player.marketValue,
    officialMarketValueLabel: marketValue(player),
    currency: player.currency ?? "EUR",
    availability: missingSearchData(player) ? "Pending Official Data Sync" : "Ready",
    href: `/players/database/${player.id}`,
    externalHref: player.profileUrl,
    context: "search" as const,
  };
}

function missingSearchData(player: PlayerDatabaseResult) {
  return !player.currentClub || !player.position || !player.nationality || !(player.age ?? ageFromDate(player.dateOfBirth));
}

function isGenericExternalImage(value?: string | null) {
  if (!value) return true;
  const lower = value.toLowerCase();
  return (
    lower.includes("transfermarkt-logo") ||
    lower.includes("transfermarkt.svg") ||
    lower.includes("transfermarkt.png") ||
    (lower.includes("transfermarkt") && lower.includes("logo")) ||
    lower.includes("tm-logo") ||
    lower.includes("default") ||
    lower.includes("socialmedia") ||
    lower.includes("/icons/") ||
    lower.includes("/icon/")
  );
}

function PlayerSearchRow({ player }: { player: PlayerDatabaseResult }) {
  return (
    <TouchlinePlayerCard player={playerCardModel(player)} variant="list" />
  );
}

function NetworkSearchCard({ entity }: { entity: NetworkSearchResult }) {
  const internalHref = entity.type === "club" ? `/clubs/database/${entity.id}` : `/agents/database/${entity.id}`;
  const linkedPlayers = entity.players.map((player) => ({
    id: player.id,
    name: player.name,
    initials: initials(player.name ?? "Player"),
    href: player.internalProfileUrl ?? (player.name ? `/football-search?q=${encodeURIComponent(player.name)}` : null),
    photoUrl: player.photoUrl,
    status: player.status,
    transfermarktId: player.transfermarktId,
  }));

  const cardProps = {
    entity: {
      id: entity.id,
      name: entity.name,
      initials: initials(entity.name),
      imageUrl: entity.photoUrl && !isGenericExternalImage(entity.photoUrl) ? entity.photoUrl : null,
      transfermarktId: entity.transfermarktId,
      href: internalHref,
      externalHref: entity.profileUrl,
      status: entity.status === "active" ? "Active" : "Pending Official Data Sync",
      subtitle:
        entity.type === "club"
          ? "Open internal club profile · market, squad and share tools"
          : entity.players.length
            ? `${entity.players.length} public linked players · representation pending`
            : "Premium agent identity · linked players pending",
      metricLabel: entity.type === "club" ? "Public squad" : "Public players",
      metricValue: entity.players.length,
      secondaryMetricLabel: "Verified",
      secondaryMetricValue: entity.players.filter((player) => player.status === "approved").length,
      linkedPlayers,
    },
  };

  return entity.type === "club" ? <TouchlineClubIdentityCard {...cardProps} /> : <TouchlineAgentIdentityCard {...cardProps} />;
}

const searchTabs: Array<{ key: SearchTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "players", label: "Player" },
  { key: "agents", label: "Agent / Agency" },
  { key: "clubs", label: "Club" },
  { key: "coaches", label: "Coach" },
];

export function PlayerDatabaseSearch({ mode = "full" }: { mode?: "full" | "compact" }) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SearchTab>("all");
  const [results, setResults] = useState<PlayerDatabaseResult[]>([]);
  const [networkResults, setNetworkResults] = useState<NetworkSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [importForm, setImportForm] = useState(emptyImport);
  const [importing, setImporting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const latestRequest = useRef(0);
  const latestNetworkRequest = useRef(0);

  const trimmed = query.trim();
  const showDropdown = mode === "compact" && focused && (trimmed.length >= 2 || results.length > 0);
  const showFullResults = mode === "full" && trimmed.length >= 2;

  function updateQuery(value: string) {
    setQuery(value);
    setError("");
    if (value.trim().length < 2) {
      setResults([]);
      setNetworkResults([]);
      setLoading(false);
      setEnriching(false);
      setNetworkLoading(false);
      latestNetworkRequest.current += 1;
    }
  }

  function updateTab(tab: SearchTab) {
    setActiveTab(tab);
    setError("");
    setMessage("");
    latestRequest.current += 1;
    latestNetworkRequest.current += 1;
    setResults([]);
    setNetworkResults([]);
    setLoading(false);
    setEnriching(false);
    setNetworkLoading(false);
  }

  useEffect(() => {
    if (mode === "full" && activeTab !== "all" && activeTab !== "players") {
      return;
    }
    if (trimmed.length < 2) return;

    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setEnriching(false);
      try {
        const limit = mode === "compact" ? 6 : 24;
        const response = await fetch(`/api/player-database/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`);
        const data = (await response.json()) as { players?: PlayerDatabaseResult[]; error?: string; discovered?: boolean; enriched?: boolean };
        if (!response.ok) throw new Error(data.error || "Could not search football database.");
        if (latestRequest.current === requestId) {
          const quickPlayers = data.players ?? [];
          setResults(quickPlayers);
          setLoading(false);
          if (data.discovered) setMessage("Player link discovered automatically and saved into Touchline.");
        }

        const quickPlayers = data.players ?? [];
        const needsDiscovery = mode === "full" && trimmed.length >= 3 && quickPlayers.length === 0;
        const needsEnrichment = mode === "full" && trimmed.length >= 3 && quickPlayers.some(missingSearchData);
        if (!needsDiscovery && !needsEnrichment) return;

        if (latestRequest.current === requestId) {
          setLoading(false);
          setEnriching(true);
        }
        const enrichResponse = await fetch(
          `/api/player-database/search?q=${encodeURIComponent(trimmed)}&limit=${limit}${needsDiscovery ? "&discover=1" : ""}&enrich=1`,
        );
        const enrichData = (await enrichResponse.json()) as { players?: PlayerDatabaseResult[]; error?: string; discovered?: boolean; enriched?: boolean };
        if (!enrichResponse.ok) throw new Error(enrichData.error || "Could not enrich player results.");
        if (latestRequest.current === requestId) {
          setResults(enrichData.players ?? quickPlayers);
          if (enrichData.discovered) setMessage("Player link discovered automatically and saved into Touchline.");
        }
      } catch (err) {
        if (latestRequest.current === requestId) setError(err instanceof Error ? err.message : "Search unavailable.");
      } finally {
        if (latestRequest.current === requestId) setLoading(false);
        if (latestRequest.current === requestId) setEnriching(false);
      }
    }, mode === "compact" ? 180 : 260);

    return () => window.clearTimeout(timeout);
  }, [activeTab, mode, trimmed]);

  useEffect(() => {
    if (mode !== "full" || trimmed.length < 2 || activeTab === "players" || activeTab === "coaches") {
      return;
    }

    const requestId = latestNetworkRequest.current + 1;
    latestNetworkRequest.current = requestId;
    const timeout = window.setTimeout(async () => {
      setNetworkLoading(true);
      try {
        const networkType = activeTab === "agents" ? "agent" : activeTab === "clubs" ? "club" : "all";
        const response = await fetch(`/api/player-database/network-search?q=${encodeURIComponent(trimmed)}&limit=8&type=${networkType}`);
        const data = await response.json() as { ok?: boolean; entities?: NetworkSearchResult[]; error?: string };
        if (!response.ok || !data.ok) throw new Error(data.error || "Could not search agents, agencies or clubs.");
        if (latestNetworkRequest.current === requestId) setNetworkResults(data.entities ?? []);

        const needsDiscovery = !(data.entities ?? []).length || (data.entities ?? []).some((entity) => entity.players.length === 0);
        if (!needsDiscovery || trimmed.length < 3) return;
        const discoverResponse = await fetch(`/api/player-database/network-search?q=${encodeURIComponent(trimmed)}&limit=8&type=${networkType}&discover=1`);
        const discoverData = await discoverResponse.json() as { ok?: boolean; entities?: NetworkSearchResult[]; error?: string };
        if (!discoverResponse.ok || !discoverData.ok) throw new Error(discoverData.error || "Could not discover network players.");
        if (latestNetworkRequest.current === requestId) setNetworkResults(discoverData.entities ?? data.entities ?? []);
      } catch {
        if (latestNetworkRequest.current === requestId) setNetworkResults([]);
      } finally {
        if (latestNetworkRequest.current === requestId) setNetworkLoading(false);
      }
    }, 340);

    return () => window.clearTimeout(timeout);
  }, [activeTab, mode, trimmed]);

  const hasResults = results.length > 0;
  const clubResults = useMemo(() => networkResults.filter((entity) => entity.type === "club"), [networkResults]);
  const agentResults = useMemo(() => networkResults.filter((entity) => entity.type === "agent"), [networkResults]);
  const visibleNetworkResults = useMemo(() => {
    if (activeTab === "clubs") return clubResults;
    if (activeTab === "agents") return agentResults;
    if (activeTab === "coaches") return [];
    return networkResults;
  }, [activeTab, agentResults, clubResults, networkResults]);
  const shouldShowPlayers = activeTab === "all" || activeTab === "players";
  const shouldShowNetwork = activeTab === "all" || activeTab === "clubs" || activeTab === "agents";
  const noResultsInActiveTab =
    showFullResults &&
    !loading &&
    !enriching &&
    ((activeTab === "players" && !hasResults) ||
      (activeTab === "clubs" && !clubResults.length) ||
      (activeTab === "agents" && !agentResults.length) ||
      activeTab === "coaches" ||
      (activeTab === "all" && !hasResults && !networkResults.length));
  const resultSummary = useMemo(() => {
    if (trimmed.length < 2) return "Type at least 2 letters";
    if (loading) return mode === "full" ? "Searching Touchline football data layer" : "Searching Touchline database";
    if (enriching) return "Updating cached profile data";
    if (mode === "full") {
      if (activeTab === "players") return `${results.length} player${results.length === 1 ? "" : "s"} found`;
      if (activeTab === "clubs") return `${clubResults.length} club${clubResults.length === 1 ? "" : "s"} found`;
      if (activeTab === "agents") return `${agentResults.length} agent/agency result${agentResults.length === 1 ? "" : "s"} found`;
      if (activeTab === "coaches") return "Coach search coming soon";
      if (!results.length && networkResults.length) return `${networkResults.length} football network result${networkResults.length === 1 ? "" : "s"} found`;
    }
    return `${results.length} player${results.length === 1 ? "" : "s"} found`;
  }, [activeTab, agentResults.length, clubResults.length, enriching, loading, mode, networkResults.length, results.length, trimmed.length]);

  async function importLink() {
    setImporting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/player-database/import-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importForm),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        profile?: { transfermarkt_player_id?: string | null; player_name?: string | null };
      };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not import this Transfermarkt profile.");
      setMessage("Player link imported into the Touchline searchable database.");
      updateQuery(data.profile?.player_name || data.profile?.transfermarkt_player_id || importForm.playerName || "");
      setImportForm(emptyImport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import player.");
    } finally {
      setImporting(false);
    }
  }

  if (mode === "compact") {
    return (
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
        <input
          value={query}
          onBlur={() => window.setTimeout(() => setFocused(false), 180)}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search football network..."
          className="console-chip h-10 w-full rounded-xl border border-white/[.08] bg-white/[.035] pl-9 pr-3 text-[10px] text-slate-200 outline-none transition placeholder:text-slate-700 focus:border-cyan-300/30"
        />
        {showDropdown && (
          <div className="absolute right-0 top-12 z-50 w-[420px] overflow-hidden rounded-3xl border border-cyan-300/15 bg-[#06101a]/95 shadow-[0_24px_90px_rgba(0,0,0,.55)] backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
              <span className="text-[8px] font-black uppercase tracking-[.18em] text-cyan-300">{resultSummary}</span>
              {loading && <Loader2 size={13} className="animate-spin text-cyan-300" />}
            </div>
            <div className="max-h-[430px] overflow-y-auto p-2">
              {hasResults ? (
                results.map((player) => (
                  <TouchlinePlayerCard key={player.id} player={playerCardModel(player)} variant="list" className="mb-2" />
                ))
              ) : (
                <div className="p-6 text-center">
                  <UserRoundSearch className="mx-auto text-slate-700" size={22} />
                  <p className="mt-3 text-[10px] font-black uppercase text-slate-400">No player found yet</p>
                  <Link href="/football-search" className="mt-3 inline-flex text-[8px] font-black uppercase tracking-wider text-cyan-300">Open football search</Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] min-w-0 space-y-6">
      <GamePanel className="relative overflow-hidden p-5 sm:p-7 xl:p-8">
        <div className="absolute right-[-10%] top-[-65%] size-[520px] rounded-full border border-cyan-300/[.08]" />
        <div className="relative z-10 grid min-w-0 gap-7 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]">
                <span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" />
                Database-first search
              </span>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                Players · agents · agencies · clubs
              </span>
            </div>
            <p className="af-mode-kicker">Touchline / Football Database</p>
            <h1 className="af-mode-title font-display mt-3 text-white">Global Football Search</h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300/80">
              Search players, agents, agencies and clubs from Touchline&apos;s own database first. New football data providers enrich
              profiles through the internal Football Data layer, so users stay inside Touchline instead of manually copying links.
            </p>

            <div className="mt-7">
              <p className="mb-2 text-[8px] font-black uppercase tracking-[.18em] text-slate-600">Choose search type</p>
              <div className="flex gap-2 overflow-x-auto scrollbar-none">
                {searchTabs.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => updateTab(tab.key)}
                      className={cn(
                        "shrink-0 rounded-2xl border px-4 py-2.5 text-[9px] font-black uppercase tracking-[.14em] transition",
                        active
                          ? "border-[#a3ff12]/40 bg-[#a3ff12]/15 text-[#caff72] shadow-[0_0_22px_rgba(163,255,18,.08)]"
                          : "border-white/[.08] bg-white/[.035] text-slate-500 hover:border-cyan-300/25 hover:text-cyan-200",
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative mt-4">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
              <Input
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                onFocus={() => setFocused(true)}
                placeholder={
                  activeTab === "players"
                    ? "Type player name, nationality or provider ID..."
                    : activeTab === "agents"
                      ? "Type agent or agency name, example: Jorge Mendes..."
                      : activeTab === "clubs"
                        ? "Type club name, example: Corinthians, Sporting CP..."
                        : activeTab === "coaches"
                          ? "Coach search is coming soon..."
                          : "Type player, agent, agency, club, nationality or provider ID..."
                }
                disabled={activeTab === "coaches"}
                className="h-14 pl-12 text-base"
              />
              {showFullResults && (
                <div className="mt-3 overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-[#06101a]/80 shadow-[0_18px_70px_rgba(0,0,0,.35)] backdrop-blur-2xl">
                  <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
                    <span className="text-[9px] font-black uppercase tracking-[.18em] text-cyan-200">{resultSummary}</span>
                    {(loading || enriching) && <Loader2 size={14} className="animate-spin text-cyan-300" />}
                  </div>
                  <div className="border-b border-white/[.06] px-3 py-3">
                    <div className="flex gap-2 overflow-x-auto scrollbar-none">
                      {searchTabs.map((tab) => {
                        const count = tab.key === "players" ? results.length : tab.key === "clubs" ? clubResults.length : tab.key === "agents" ? agentResults.length : tab.key === "coaches" ? 0 : results.length + networkResults.length;
                        const active = activeTab === tab.key;
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => updateTab(tab.key)}
                            className={cn(
                              "shrink-0 rounded-2xl border px-4 py-2 text-[8px] font-black uppercase tracking-[.16em] transition",
                              active
                                ? "border-[#a3ff12]/35 bg-[#a3ff12]/15 text-[#caff72] shadow-[0_0_20px_rgba(163,255,18,.08)]"
                                : "border-white/[.07] bg-white/[.03] text-slate-500 hover:border-cyan-300/20 hover:text-cyan-200",
                            )}
                          >
                            {tab.label} <span className="ml-1 text-white/45">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="max-h-[62vh] space-y-2 overflow-y-auto overscroll-contain p-3 pr-4">
                    {shouldShowPlayers && hasResults ? (
                      results.map((player) => <PlayerSearchRow key={player.id} player={player} />)
                    ) : loading ? (
                      <div className="grid min-h-40 place-items-center rounded-3xl border border-white/[.06] bg-white/[.025]">
                        <div className="text-center">
                          <Loader2 size={24} className="mx-auto animate-spin text-cyan-300" />
                          <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Searching and saving possible links...</p>
                        </div>
                      </div>
                    ) : activeTab === "all" && networkResults.length ? (
                      <div className="rounded-3xl border border-[#a3ff12]/15 bg-[#a3ff12]/[.045] p-5">
                        <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#caff72]">Football network match found</p>
                        <p className="mt-2 text-[10px] leading-5 text-slate-500">
                          No player profile matched directly, but Touchline found club, agent or agency results below.
                        </p>
                      </div>
                    ) : !shouldShowPlayers && visibleNetworkResults.length ? (
                      <div className="rounded-3xl border border-[#a3ff12]/15 bg-[#a3ff12]/[.045] p-5">
                        <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#caff72]">
                          {activeTab === "agents" ? "Agent / agency result found" : activeTab === "clubs" ? "Club result found" : "Football network result found"}
                        </p>
                        <p className="mt-2 text-[10px] leading-5 text-slate-500">
                          Touchline found the network profile below. Open it inside the app to see linked players and internal profiles.
                        </p>
                      </div>
                    ) : noResultsInActiveTab ? (
                      activeTab === "coaches" ? (
                        <TouchlineCoachIdentityCard
                          entity={{
                            name: "Coach Identity Search",
                            initials: "CI",
                            status: "Under Development",
                            subtitle: "Premium coach profiles will use the same TDIE visual identity system as players, clubs and agents.",
                            metricLabel: "Module",
                            metricValue: "V1 Optional",
                            secondaryMetricLabel: "Identity",
                            secondaryMetricValue: "TDIE Ready",
                          }}
                        />
                      ) : (
                        <div className="grid min-h-40 place-items-center rounded-3xl border border-white/[.06] bg-white/[.025] p-6 text-center">
                          <div>
                            <UserRoundSearch className="mx-auto text-slate-700" size={24} />
                            <p className="mt-3 text-[11px] font-black uppercase text-white">
                              No {activeTab === "all" ? "football" : activeTab} result found yet
                            </p>
                            <p className="mt-2 text-[10px] leading-5 text-slate-500">Try the official football name or switch tabs.</p>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="grid min-h-40 place-items-center rounded-3xl border border-white/[.06] bg-white/[.025] p-6 text-center">
                        <div>
                          <UserRoundSearch className="mx-auto text-slate-700" size={24} />
                          <p className="mt-3 text-[11px] font-black uppercase text-white">
                            {activeTab === "agents"
                              ? "Searching agent and agency identities"
                              : activeTab === "clubs"
                                ? "Searching club identities"
                                : "No player found directly"}
                          </p>
                          <p className="mt-2 text-[10px] leading-5 text-slate-500">
                            {activeTab === "agents"
                              ? "Touchline is checking saved agency profiles and linked players below."
                              : activeTab === "clubs"
                                ? "Touchline is checking saved club profiles and public squad references below."
                                : "Checking agents, agencies and clubs below. Try official name if needed."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {shouldShowNetwork && (visibleNetworkResults.length > 0 || networkLoading || (!hasResults && trimmed.length >= 3)) && (
                    <div className="border-t border-white/[.06] p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-[.18em] text-[#caff72]">Football network results</span>
                        {networkLoading && <Loader2 size={14} className="animate-spin text-[#a3ff12]" />}
                      </div>
                      <div className="space-y-2">
                        {visibleNetworkResults.length ? visibleNetworkResults.map((entity) => <NetworkSearchCard key={entity.id} entity={entity} />) : (
                          <div className="rounded-3xl border border-white/[.06] bg-white/[.025] p-5 text-center">
                            <Building2 className="mx-auto text-slate-700" size={22} />
                            <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-white">
                              {networkLoading ? "Searching network..." : "No agent, agency or club found yet"}
                            </p>
                            <p className="mt-2 text-[10px] leading-5 text-slate-500">
                              Try the official football name, for example Sporting CP, Sporting Lisbon, agent name or agency name.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="mt-3 text-[9px] font-black uppercase tracking-[.18em] text-slate-600">{resultSummary}</p>
            {error && <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-xs font-bold text-rose-200">{error}</div>}
            {message && <div className="mt-4 rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/10 px-4 py-3 text-xs font-bold text-[#caff72]">{message}</div>}
          </div>

          <div className="rounded-3xl border border-white/[.08] bg-black/20 p-5">
            <button
              type="button"
              onClick={() => setManualOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <SectionHeader kicker="Legacy fallback" title="Manual profile link" action={<UploadCloud size={15} className="text-cyan-300" />} />
              <ChevronDown size={18} className={cn("shrink-0 text-slate-500 transition", manualOpen && "rotate-180 text-cyan-300")} />
            </button>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">
              Hidden fallback for old records only. Normal users should use Football Search and the Football Data layer.
            </p>
            {manualOpen && <div className="mt-4 space-y-3">
              <Input value={importForm.url} onChange={(event) => setImportForm({ ...importForm, url: event.target.value })} placeholder="Provider profile URL" />
              <Input value={importForm.playerName} onChange={(event) => setImportForm({ ...importForm, playerName: event.target.value })} placeholder="Player name optional" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={importForm.currentClub} onChange={(event) => setImportForm({ ...importForm, currentClub: event.target.value })} placeholder="Current club optional" />
                <Input value={importForm.position} onChange={(event) => setImportForm({ ...importForm, position: event.target.value })} placeholder="Position optional" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={importForm.nationality} onChange={(event) => setImportForm({ ...importForm, nationality: event.target.value })} placeholder="Nationality optional" />
                <Input value={importForm.photoUrl} onChange={(event) => setImportForm({ ...importForm, photoUrl: event.target.value })} placeholder="Photo URL optional" />
              </div>
              <Button onClick={() => void importLink()} disabled={importing || !importForm.url.trim()} className="w-full">
                {importing ? <Loader2 size={14} className="animate-spin" /> : <DatabaseZap size={14} />}
                Import to database
              </Button>
              <p className="text-[10px] leading-5 text-slate-500">
                Legacy fallback only. The product direction is API-first: Football Search → Football Data Provider → Touchline Database → internal profile.
              </p>
            </div>}
          </div>
        </div>
      </GamePanel>

      <GamePanel className="p-5">
        <p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">Fast workflow</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Search results now appear directly below the field. Clicking a result opens the internal profile and keeps users inside Touchline.
        </p>
      </GamePanel>
    </div>
  );
}
