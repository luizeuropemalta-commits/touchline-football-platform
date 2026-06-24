"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, DatabaseZap, ExternalLink, Globe2, Loader2, Search, ShieldCheck, UploadCloud, UserRoundSearch } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { GamePanel, SectionHeader } from "@/components/game-ui";
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

function compactDate(value?: string | null) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(value));
}

function metaLine(player: PlayerDatabaseResult) {
  const age = player.age ?? ageFromDate(player.dateOfBirth);
  return [player.position, player.currentClub, player.nationality, age ? `Age ${age}` : null].filter(Boolean).join(" · ") || "Profile data open";
}

function idLabel(player: PlayerDatabaseResult) {
  return player.sourceProvider === "transfermarkt"
    ? `TM ID ${player.transfermarktPlayerId}`
    : `${player.sourceLabel ?? "Source"} ID ${player.sourceId ?? player.transfermarktPlayerId}`;
}

export function PlayerDatabaseSearch({ mode = "full" }: { mode?: "full" | "compact" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerDatabaseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [importForm, setImportForm] = useState(emptyImport);
  const [importing, setImporting] = useState(false);
  const latestRequest = useRef(0);

  const trimmed = query.trim();
  const showDropdown = mode === "compact" && focused && (trimmed.length >= 2 || results.length > 0);

  function updateQuery(value: string) {
    setQuery(value);
    setError("");
    if (value.trim().length < 2) {
      setResults([]);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (trimmed.length < 2) return;

    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const discover = mode === "full" && trimmed.length >= 3 ? "&discover=1" : "";
        const response = await fetch(`/api/player-database/search?q=${encodeURIComponent(trimmed)}&limit=${mode === "compact" ? 6 : 24}${discover}`);
        const data = (await response.json()) as { players?: PlayerDatabaseResult[]; error?: string; discovered?: boolean };
        if (!response.ok) throw new Error(data.error || "Could not search player database.");
        if (latestRequest.current === requestId) {
          setResults(data.players ?? []);
          if (data.discovered) setMessage("Player link discovered automatically and saved into Touchline.");
        }
      } catch (err) {
        if (latestRequest.current === requestId) setError(err instanceof Error ? err.message : "Search unavailable.");
      } finally {
        if (latestRequest.current === requestId) setLoading(false);
      }
    }, mode === "compact" ? 180 : 260);

    return () => window.clearTimeout(timeout);
  }, [mode, trimmed]);

  const hasResults = results.length > 0;
  const resultSummary = useMemo(() => {
    if (trimmed.length < 2) return "Type at least 2 letters";
      if (loading) return mode === "full" ? "Searching Touchline + automatic Transfermarkt link discovery" : "Searching Touchline database";
    return `${results.length} player${results.length === 1 ? "" : "s"} found`;
  }, [loading, mode, results.length, trimmed.length]);

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
          placeholder="Search players database..."
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
                  <Link
                    key={player.id}
                    href={`/players/database/${player.id}`}
                    className="group flex gap-3 rounded-2xl border border-transparent p-3 transition hover:border-cyan-300/20 hover:bg-cyan-300/[.06]"
                  >
                    <div className="size-14 shrink-0 overflow-hidden rounded-2xl border border-white/[.08] bg-black/30">
                      {player.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={player.photoUrl} alt={player.name} className="h-full w-full object-cover object-top" />
                      ) : (
                        <div className="grid h-full place-items-center text-[11px] font-black text-cyan-300/50">{initials(player.name)}</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-black uppercase italic text-white group-hover:text-cyan-200">{player.name}</p>
                      <p className="mt-1 truncate text-[8px] font-bold uppercase tracking-wider text-slate-500">{metaLine(player)}</p>
                      <p className="mt-2 text-[8px] text-[#a3ff12]">{idLabel(player)}</p>
                    </div>
                    <ArrowRight size={14} className="mt-4 text-slate-600 group-hover:text-cyan-300" />
                  </Link>
                ))
              ) : (
                <div className="p-6 text-center">
                  <UserRoundSearch className="mx-auto text-slate-700" size={22} />
                  <p className="mt-3 text-[10px] font-black uppercase text-slate-400">No player found yet</p>
                  <Link href="/players/database" className="mt-3 inline-flex text-[8px] font-black uppercase tracking-wider text-cyan-300">Open player database</Link>
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
                Automatic player discovery
              </span>
            </div>
            <p className="af-mode-kicker">Touchline / Player Database</p>
            <h1 className="af-mode-title font-display mt-3 text-white">Global Player Search</h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300/80">
              Search players from Touchline&apos;s own database first. If a player is not found, Touchline tries to discover the
              public Transfermarkt profile link, saves it in the registry, and shows it inside the app.
            </p>

            <div className="relative mt-7">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
              <Input
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                placeholder="Type a player name, club, position, nationality or Transfermarkt ID..."
                className="h-14 pl-12 text-base"
              />
            </div>
            <p className="mt-3 text-[9px] font-black uppercase tracking-[.18em] text-slate-600">{resultSummary}</p>
            {error && <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-xs font-bold text-rose-200">{error}</div>}
            {message && <div className="mt-4 rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/10 px-4 py-3 text-xs font-bold text-[#caff72]">{message}</div>}
          </div>

          <div className="rounded-3xl border border-white/[.08] bg-black/20 p-5">
            <SectionHeader kicker="Import system" title="Save Transfermarkt link" action={<UploadCloud size={15} className="text-cyan-300" />} />
            <div className="space-y-3">
              <Input value={importForm.url} onChange={(event) => setImportForm({ ...importForm, url: event.target.value })} placeholder="Transfermarkt profile URL" />
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
                Manual fallback only. Normal search now tries to discover player links automatically before asking you to paste a URL.
              </p>
            </div>
          </div>
        </div>
      </GamePanel>

      <div className={cn("grid gap-5", hasResults && "sm:grid-cols-2 2xl:grid-cols-3")}>
        {loading && !hasResults ? (
          <div className="glass flex min-h-72 items-center justify-center rounded-3xl">
            <Loader2 size={28} className="animate-spin text-cyan-300" />
          </div>
        ) : hasResults ? (
          results.map((player) => (
            <GamePanel key={player.id} className="glass-hover overflow-hidden">
              <div className="relative h-64 bg-cyan-300/[.035]">
                {player.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={player.photoUrl} alt={player.name} className="h-full w-full object-cover object-top" />
                ) : (
                  <div className="grid h-full place-items-center text-5xl font-black text-cyan-300/25">{initials(player.name)}</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-[#07111b]/20 to-transparent" />
                <div className="absolute left-4 top-4 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 py-1 text-[8px] font-black uppercase text-[#caff72]">
                  {idLabel(player)}
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/players/database/${player.id}`} className="text-xl font-black uppercase italic tracking-[-.05em] text-white hover:text-cyan-200">
                      {player.name}
                    </Link>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">{metaLine(player)}</p>
                  </div>
                  <ShieldCheck size={20} className="shrink-0 text-[#a3ff12]" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white/[.045] p-3"><p className="text-[8px] text-slate-500">CLUB</p><p className="mt-1 truncate text-xs font-black text-cyan-300">{player.currentClub ?? "—"}</p></div>
                  <div className="rounded-xl bg-white/[.045] p-3"><p className="text-[8px] text-slate-500">NATION</p><p className="mt-1 truncate text-xs font-black text-white">{player.nationality ?? "—"}</p></div>
                  <div className="rounded-xl bg-white/[.045] p-3"><p className="text-[8px] text-slate-500">UPDATED</p><p className="mt-1 text-[10px] font-black text-amber-300">{compactDate(player.lastUpdatedAt)}</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/players/database/${player.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-cyan-200/18 bg-white/[.055] px-4 text-[9px] font-black uppercase tracking-wider text-slate-100 transition hover:border-cyan-300/35">
                    Open Profile <ArrowRight size={12} />
                  </Link>
                  <a href={player.profileUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 text-[9px] font-black uppercase tracking-wider text-[#caff72]">
                    {player.sourceLinkLabel ?? "Source Link"} <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </GamePanel>
          ))
        ) : (
          <GamePanel className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <Globe2 size={30} className="text-slate-700" />
            <p className="mt-4 text-sm font-black uppercase italic text-white">Start searching the football database</p>
            <p className="mt-2 max-w-lg text-xs leading-6 text-slate-500">
              Type part of a player name. If Touchline has no result, it can discover the public Transfermarkt profile link and save it automatically.
            </p>
          </GamePanel>
        )}
      </div>
    </div>
  );
}
