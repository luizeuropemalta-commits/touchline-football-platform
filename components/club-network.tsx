"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Eye,
  ImageIcon,
  Loader2,
  MessageSquare,
  Search,
  ShieldCheck,
  Star,
  Zap,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { GamePanel, LivePill, SectionHeader, StatTile } from "@/components/game-ui";

export type ClubNetworkClub = {
  id: string;
  name: string;
  countryCode?: string | null;
  league?: string | null;
  crestUrl?: string | null;
};

export type ClubNetworkPlayer = {
  id: string;
  name: string;
  club?: string | null;
  position?: string | null;
  nationality?: string | null;
  photoUrl?: string | null;
  marketValue?: number | null;
  currency?: string | null;
  externalUrl?: string | null;
  representationStatus?: string | null;
};

function formatMoney(value?: number | null, currency = "EUR") {
  if (!value) return "Value open";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function representationLabel(status?: string | null) {
  if (status === "verified_representation") return "Verified representation document uploaded.";
  if (status === "active_representation") return "Currently represented by this agent.";
  return "Representation status available inside Touchline.";
}

export function ClubNetwork({ clubs, players }: { clubs: ClubNetworkClub[]; players: ClubNetworkPlayer[] }) {
  const [query, setQuery] = useState("");
  const [clubQuery, setClubQuery] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.id ?? "");
  const [clubName, setClubName] = useState("");
  const [sportingDirector, setSportingDirector] = useState("");
  const [positionNeeded, setPositionNeeded] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const filteredPlayers = useMemo(() => {
    const search = query.toLowerCase();
    return players.filter((player) => `${player.name} ${player.club ?? ""} ${player.position ?? ""} ${player.nationality ?? ""}`.toLowerCase().includes(search));
  }, [players, query]);
  const filteredClubs = useMemo(() => {
    const search = clubQuery.toLowerCase();
    return clubs.filter((club) => `${club.name} ${club.league ?? ""} ${club.countryCode ?? ""}`.toLowerCase().includes(search));
  }, [clubs, clubQuery]);

  async function createInterest(playerId: string) {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      if (!clubName) throw new Error("Write the club name before sending interest.");
      const response = await fetch("/api/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          clubName,
          sportingDirector,
          positionNeeded,
          message,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not create interest.");
      setNotice("Club interest created and negotiation room opened.");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create interest.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <LivePill>{clubs.length} real clubs</LivePill>
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">{players.length} active/verified player records</span>
          </div>
          <h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Club Network</h1>
          <p className="mt-1.5 text-xs text-slate-500">Recruitment teams see only players with Active or Verified Representation. Suggested, former, expired or disputed claims stay private.</p>
        </div>
        <Button onClick={() => selectedPlayerId && void createInterest(selectedPlayerId)} disabled={saving || !selectedPlayerId}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
          Create Interest
        </Button>
      </div>

      {notice && <div className="mt-4 rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 py-3 text-sm font-bold text-[#caff72]">{notice}</div>}
      {error && <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-200">{error}</div>}

      <div className="stagger mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Building2} label="Real Clubs" value={String(clubs.length)} delta="from your workspace" accent="cyan" />
        <StatTile icon={Eye} label="Visible Players" value={String(players.length)} delta="active / verified only" accent="lime" />
        <StatTile icon={MessageSquare} label="Interest System" value="LIVE" delta="creates rooms" accent="gold" />
        <StatTile icon={Zap} label="Recruitment" value="READY" delta="filter/search workflow" accent="rose" />
      </div>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1fr_420px]">
        <GamePanel className="p-5">
          <SectionHeader kicker="Recruitment center" title="Search real player portfolio" />
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by position, player, club or nationality..." className="h-11 w-full rounded-2xl border border-white/[.07] bg-black/20 pl-9 pr-4 text-xs text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/25" />
          </div>
          {filteredPlayers.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredPlayers.map((player) => (
                <div key={player.id} className="overflow-hidden rounded-3xl border border-white/[.08] bg-white/[.025] transition hover:border-cyan-300/20">
                  <div className="grid grid-cols-[108px_1fr]">
                    <div className="relative min-h-36 bg-cyan-300/[.04]">
                      {player.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={player.photoUrl} alt={player.name} className="h-full w-full object-cover object-top" />
                      ) : (
                        <div className="grid h-full place-items-center text-cyan-300/40">
                          <ImageIcon size={24} />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-black uppercase italic text-white">{player.name}</h3>
                          <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-500">
                            {player.position ?? "Position open"} {player.club ? `· ${player.club}` : ""} {player.nationality ? `· ${player.nationality}` : ""}
                          </p>
                        </div>
                        <input type="radio" name="interest-player" checked={selectedPlayerId === player.id} onChange={() => setSelectedPlayerId(player.id)} className="mt-1 accent-[#a3ff12]" />
                      </div>
                      <p className="mt-3 text-sm font-black text-[#a3ff12]">{formatMoney(player.marketValue, player.currency ?? "EUR")}</p>
                      <p className="mt-2 rounded-xl border border-[#a3ff12]/15 bg-[#a3ff12]/[.055] px-3 py-2 text-[8px] font-black uppercase leading-4 tracking-wider text-[#caff72]">
                        {representationLabel(player.representationStatus)}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={() => void createInterest(player.id)} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] px-3 text-[8px] font-black uppercase tracking-wider text-cyan-100">
                          I&apos;m interested
                        </button>
                        {player.externalUrl && (
                          <a href={player.externalUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 text-[8px] font-black uppercase tracking-wider text-[#caff72]">
                            Transfermarkt <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-white/[.07] bg-black/20 text-center">
              <Star size={28} className="text-slate-700" />
              <p className="mt-4 text-xs font-black uppercase text-white">No real players visible yet</p>
              <p className="mt-1 text-[10px] text-slate-600">Add players in Player Management to activate club discovery.</p>
            </div>
          )}
          </GamePanel>

        <aside className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Club search" title="Club directory" action={<Building2 size={15} className="text-cyan-300" />} />
            <div className="relative mb-4">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                value={clubQuery}
                onChange={(event) => setClubQuery(event.target.value)}
                placeholder="Search clubs, league or country..."
                className="h-10 w-full rounded-xl border border-white/[.07] bg-black/20 pl-9 pr-4 text-[10px] text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/25"
              />
            </div>
            <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1 scrollbar-none">
              {filteredClubs.map((club) => (
                <div key={club.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-3">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center overflow-hidden rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] text-[10px] font-black text-cyan-100">
                      {club.crestUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={club.crestUrl} alt={club.name} className="h-full w-full object-cover" />
                      ) : (
                        club.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-black uppercase text-white">{club.name}</p>
                      <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{club.league ?? "League open"} · {club.countryCode ?? "Global"}</p>
                    </div>
                  </div>
                </div>
              ))}
              {!filteredClubs.length && (
                <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-xs leading-6 text-slate-500">
                  No clubs found. Add a club through player creation or interest workflows, then it will appear here.
                </div>
              )}
            </div>
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Interest system" title="Club request form" action={<ShieldCheck size={15} className="text-[#a3ff12]" />} />
            <div className="space-y-3">
              <Input value={clubName} onChange={(event) => setClubName(event.target.value)} placeholder="Club name *" />
              <Input value={sportingDirector} onChange={(event) => setSportingDirector(event.target.value)} placeholder="Sporting director / contact" />
              <Input value={positionNeeded} onChange={(event) => setPositionNeeded(event.target.value)} placeholder="Position needed" />
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message to agent..." className="min-h-28 w-full rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/45" />
              <Button onClick={() => selectedPlayerId && void createInterest(selectedPlayerId)} disabled={saving || !selectedPlayerId} className="w-full">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Send interest
              </Button>
            </div>
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Agent search" title="Follow agents" />
            <p className="text-sm leading-6 text-slate-400">
              The database now supports club-agent follows. When a club follows an agent, future player additions can trigger notifications and market alerts.
            </p>
            <Link href="/agencies" className="mt-4 inline-flex h-10 items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black uppercase tracking-wider text-cyan-100">
              Search agents/agencies
            </Link>
          </GamePanel>
        </aside>
      </section>
    </div>
  );
}
