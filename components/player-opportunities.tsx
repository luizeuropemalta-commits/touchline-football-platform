"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeEuro,
  Building2,
  CheckCircle2,
  ClipboardList,
  Filter,
  Flame,
  Globe2,
  Loader2,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCheck,
  Users,
  Zap,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { GamePanel, LivePill, Meter, SectionHeader, StatTile } from "@/components/game-ui";
import { cn } from "@/lib/utils";

type Requirements = {
  eu_passport?: boolean;
  notes?: string;
  budget?: number | null;
  nationality?: string | null;
  urgency?: string | null;
  contract_status?: string | null;
};

type Opportunity = {
  id: string;
  title: string;
  positionNeeded?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  requirements?: Requirements | null;
  matchScore?: number | null;
  status: string;
  source?: string | null;
  expiresAt?: string | null;
  createdAt?: string | null;
  clubName?: string | null;
  playerName?: string | null;
  playerId?: string | null;
};

type PlayerOption = {
  id: string;
  name: string;
  position?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  marketValue?: number | null;
  currency?: string | null;
  photoUrl?: string | null;
  contractEndDate?: string | null;
  club?: string | null;
};

type OpportunityApiRow = {
  id: string;
  title: string;
  position_needed?: string | null;
  age_min?: number | null;
  age_max?: number | null;
  requirements?: Requirements | null;
  match_score?: number | null;
  status: string;
  source?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  players?: { id?: string | null; first_name?: string | null; last_name?: string | null } | Array<{ id?: string | null; first_name?: string | null; last_name?: string | null }> | null;
  clubs?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

const euNationalities = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

const statusLabels: Record<string, string> = {
  open: "Open",
  sent_profile: "Profile Sent",
  contact_requested: "Contact Requested",
  negotiation: "Negotiation",
  closed: "Closed",
  dismissed: "Dismissed",
};

function relationName(value: OpportunityApiRow["players"] | OpportunityApiRow["clubs"]) {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item) return "";
  const record = item as { name?: string | null; first_name?: string | null; last_name?: string | null };
  return record.name ?? `${record.first_name ?? ""} ${record.last_name ?? ""}`.trim();
}

function relationPlayerId(value: OpportunityApiRow["players"]) {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.id ?? null;
}

function formatMoney(value?: number | null, currency = "EUR") {
  if (!value) return "Budget open";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function ageFromDate(date?: string | null) {
  if (!date) return null;
  const birth = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function deadlineLabel(value?: string | null) {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(value));
}

function scorePlayer(opportunity: Opportunity, player: PlayerOption) {
  let score = 18;
  const reasons: string[] = [];
  const need = opportunity.positionNeeded?.toLowerCase().trim();
  const playerPosition = player.position?.toLowerCase().trim();
  const age = ageFromDate(player.dateOfBirth);
  const req = opportunity.requirements ?? {};

  if (need && playerPosition) {
    if (playerPosition.includes(need) || need.includes(playerPosition)) {
      score += 36;
      reasons.push("position match");
    } else if (need.split(/[\s/-]+/).some((part) => part.length > 2 && playerPosition.includes(part))) {
      score += 18;
      reasons.push("similar position");
    }
  }

  if (age && opportunity.ageMin && opportunity.ageMax && age >= opportunity.ageMin && age <= opportunity.ageMax) {
    score += 18;
    reasons.push("age range");
  } else if (age && (opportunity.ageMin || opportunity.ageMax)) {
    const minOk = !opportunity.ageMin || age >= opportunity.ageMin - 2;
    const maxOk = !opportunity.ageMax || age <= opportunity.ageMax + 2;
    if (minOk && maxOk) {
      score += 8;
      reasons.push("near age range");
    }
  }

  if (req.nationality && player.nationality?.toLowerCase() === req.nationality.toLowerCase()) {
    score += 10;
    reasons.push("nationality");
  }

  if (req.eu_passport && player.nationality && euNationalities.has(player.nationality.toUpperCase())) {
    score += 10;
    reasons.push("EU passport");
  }

  if (req.budget && player.marketValue && player.marketValue <= Number(req.budget)) {
    score += 12;
    reasons.push("inside budget");
  }

  if (player.contractEndDate) {
    score += 6;
    reasons.push("contract data");
  }

  return { score: Math.min(99, score), reasons };
}

function pitchHref(opportunity: Opportunity, playerId?: string | null) {
  const params = new URLSearchParams();
  if (playerId) params.set("player", playerId);
  if (opportunity.clubName) params.set("club", opportunity.clubName);
  params.set("objective", opportunity.positionNeeded ? `${opportunity.positionNeeded} recruitment pitch` : "Transfer opportunity");
  return `/players/pitch?${params.toString()}`;
}

export function PlayerOpportunities({ initialOpportunities, players }: { initialOpportunities: Opportunity[]; players: PlayerOption[] }) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [clubName, setClubName] = useState("");
  const [positionNeeded, setPositionNeeded] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [nationality, setNationality] = useState("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [euPassport, setEuPassport] = useState(false);
  const [notes, setNotes] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(initialOpportunities[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [now] = useState(() => Date.now());

  const selectedOpportunity = opportunities.find((item) => item.id === selectedOpportunityId) ?? opportunities[0] ?? null;
  const activeOpportunities = opportunities.filter((item) => !["closed", "dismissed"].includes(item.status));
  const urgentOpportunities = opportunities.filter((item) => item.expiresAt && new Date(item.expiresAt).getTime() < now + 1000 * 60 * 60 * 24 * 14);

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((item) => {
      const haystack = `${item.title} ${item.clubName ?? ""} ${item.positionNeeded ?? ""} ${item.playerName ?? ""}`.toLowerCase();
      const matchesQuery = haystack.includes(query.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !["closed", "dismissed"].includes(item.status)) ||
        item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [opportunities, query, statusFilter]);

  const matchedPlayers = useMemo(() => {
    if (!selectedOpportunity) return [];
    return players
      .map((player) => ({ player, ...scorePlayer(selectedOpportunity, player) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [players, selectedOpportunity]);

  async function reload() {
    const response = await fetch("/api/opportunities");
    const data = (await response.json()) as { opportunities?: OpportunityApiRow[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not reload opportunities.");
    setOpportunities(
      (data.opportunities ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        positionNeeded: item.position_needed,
        ageMin: item.age_min,
        ageMax: item.age_max,
        requirements: item.requirements,
        matchScore: item.match_score,
        status: item.status,
        source: item.source,
        expiresAt: item.expires_at,
        createdAt: item.created_at,
        playerName: relationName(item.players),
        playerId: relationPlayerId(item.players),
        clubName: relationName(item.clubs),
      })),
    );
  }

  async function runAction(opportunityId: string, action: string) {
    setSavingId(opportunityId);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, action }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; roomId?: string | null };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not update opportunity.");
      setNotice(action === "open_negotiation" ? "Negotiation room opened. Check Deal Rooms." : "Opportunity action saved.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update opportunity.");
    } finally {
      setSavingId(null);
    }
  }

  async function createOpportunity() {
    setCreating(true);
    setNotice("");
    setError("");
    try {
      if (!title) throw new Error("Write opportunity title.");
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          clubName,
          positionNeeded,
          ageMin,
          ageMax,
          nationality,
          budget,
          deadline,
          euPassport,
          notes,
          playerId: selectedPlayerId,
          source: "club_requirement",
          matchScore: selectedPlayerId ? 78 : 0,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; opportunity?: { id?: string } };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not create opportunity.");
      setTitle("");
      setClubName("");
      setPositionNeeded("");
      setAgeMin("");
      setAgeMax("");
      setNationality("");
      setBudget("");
      setDeadline("");
      setEuPassport(false);
      setNotes("");
      setNotice("Club requirement created. Match players and build a pitch.");
      await reload();
      if (data.opportunity?.id) setSelectedOpportunityId(data.opportunity.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create opportunity.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] min-w-0 animate-in space-y-6">
      <section className="af-mode-screen p-5 sm:p-7 xl:p-9" style={{ "--mode-aura": "rgba(163,255,18,.22)" } as CSSProperties}>
        <div className="relative z-10 grid min-w-0 gap-8 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] 2xl:items-end">
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <LivePill>Opportunity Board live</LivePill>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                Club requests × player matches
              </span>
            </div>
            <p className="af-mode-kicker">Touchline / Opportunity Board</p>
            <h1 className="af-mode-title font-display mt-3 max-w-full text-white">Opportunity Board</h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300/80">
              Convert club needs into player matches, professional pitches and private deal rooms. This is the commercial
              engine between your portfolio and the transfer market.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/players/pitch" className="continue-career-button inline-flex min-h-[52px] items-center gap-3 px-5 text-[9px] font-black uppercase tracking-[.16em] text-[#071007]">
                Create Pitch <Sparkles size={15} />
              </Link>
              <Link href="/deals" className="console-mini-card inline-flex min-h-[52px] items-center gap-3 px-5 text-[9px] font-black uppercase tracking-[.16em] text-cyan-100">
                Deal Rooms <Zap size={15} />
              </Link>
            </div>
          </div>
          <div className="stadium-scoreboard min-w-0 p-5">
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[.22em] text-[#a3ff12]">Active requirements</p>
                <p className="font-display mt-2 text-7xl leading-none text-white">{activeOpportunities.length}</p>
              </div>
              <Target className="text-[#a3ff12]" size={38} />
            </div>
            <div className="relative z-10 mt-5">
              <div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500">
                <span>Pipeline pressure</span>
                <span>{urgentOpportunities.length ? `${urgentOpportunities.length} urgent` : "controlled"}</span>
              </div>
              <Meter value={Math.min(100, activeOpportunities.length * 18 + urgentOpportunities.length * 12)} color={urgentOpportunities.length ? "red" : "lime"} />
            </div>
          </div>
        </div>
      </section>

      {notice && <div className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 py-3 text-sm font-bold text-[#caff72]">{notice}</div>}
      {error && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-200">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Target} label="Open Requirements" value={String(opportunities.filter((item) => item.status === "open").length)} delta="club needs" accent="cyan" />
        <StatTile icon={Send} label="Profiles Sent" value={String(opportunities.filter((item) => item.status === "sent_profile").length)} delta="club follow-up" accent="lime" />
        <StatTile icon={Zap} label="Negotiations" value={String(opportunities.filter((item) => item.status === "negotiation").length)} delta="deal rooms" accent="gold" />
        <StatTile icon={Users} label="Portfolio Pool" value={String(players.length)} delta="matchable players" accent="rose" />
      </div>

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1.3fr)_430px]">
        <div className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Create club requirement" title="New opportunity" />
            <div className="mb-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-4">
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-200">How this board works</p>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                Add what a club is looking for. Touchline compares the requirement with your players, then you can create a pitch or open a private deal room.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: club needs striker 18–25 EU passport *" />
              <Input value={clubName} onChange={(event) => setClubName(event.target.value)} placeholder="Club name" />
              <Input value={positionNeeded} onChange={(event) => setPositionNeeded(event.target.value)} placeholder="Position needed" />
              <div className="grid grid-cols-2 gap-3">
                <Input value={ageMin} onChange={(event) => setAgeMin(event.target.value)} placeholder="Min age" />
                <Input value={ageMax} onChange={(event) => setAgeMax(event.target.value)} placeholder="Max age" />
              </div>
              <Input value={nationality} maxLength={2} onChange={(event) => setNationality(event.target.value.toUpperCase())} placeholder="Nationality, ex: BR" />
              <Input value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Max budget, ex: 2000000" />
              <Input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} placeholder="Deadline" />
              <select value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)} className="h-12 rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 text-sm text-white outline-none focus:border-cyan-300/45">
                <option value="">No player selected yet</option>
                {players.map((player) => <option key={player.id} value={player.id}>{player.name} {player.position ? `· ${player.position}` : ""}</option>)}
              </select>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notes: salary range, passport, league level, urgency, scout comment..."
                className="min-h-24 w-full rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45"
              />
              <div className="flex flex-col gap-3">
                <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.06] px-4 text-[9px] font-black uppercase tracking-[.12em] text-[#caff72]">
                  <input type="checkbox" checked={euPassport} onChange={(event) => setEuPassport(event.target.checked)} className="size-4 accent-[#a3ff12]" />
                  EU passport required
                </label>
                <Button onClick={createOpportunity} disabled={creating}>
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Create Requirement
                </Button>
              </div>
            </div>
          </GamePanel>

          <GamePanel className="status-scan overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-white/[.07] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[.2em] text-cyan-300">Live opportunity board</p>
                <h2 className="mt-1 text-sm font-black uppercase italic">Club needs × player actions</h2>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search board..." className="h-10 w-full rounded-xl border border-white/[.07] bg-black/20 pl-9 pr-3 text-[10px] text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/25 sm:w-56" />
                </div>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-xl border border-white/[.07] bg-[#07111b] px-3 text-[10px] font-bold uppercase tracking-wider text-slate-300 outline-none">
                  <option value="active">Active</option>
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="sent_profile">Profile Sent</option>
                  <option value="contact_requested">Contact Requested</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
            {filteredOpportunities.length ? (
              <div className="divide-y divide-white/[.06]">
                {filteredOpportunities.map((opportunity, index) => {
                  const selected = selectedOpportunity?.id === opportunity.id;
                  return (
                    <div key={opportunity.id} className="live-row grid gap-4 px-5 py-5 xl:grid-cols-[1.15fr_.55fr_.6fr_.85fr] xl:items-center" style={{ "--row-accent": selected ? "#a3ff12" : (opportunity.matchScore ?? 0) > 85 ? "#a3ff12" : "#22d3ee" } as CSSProperties}>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setSelectedOpportunityId(opportunity.id)} className={cn("interactive-icon grid size-10 place-items-center rounded-lg border text-[9px] font-black", selected ? "border-[#a3ff12]/30 bg-[#a3ff12]/10 text-[#caff72]" : "border-white/[.08] bg-white/[.03] text-slate-500")}>
                          {String(index + 1).padStart(2, "0")}
                        </button>
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-black uppercase italic">{opportunity.title}</p>
                          <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{opportunity.clubName || "Club open"} · {opportunity.playerName || "No player selected"}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {opportunity.ageMin || opportunity.ageMax ? <span className="rounded-full border border-white/[.08] bg-white/[.035] px-2 py-1 text-[7px] font-black uppercase text-slate-500">{opportunity.ageMin ?? "?"}–{opportunity.ageMax ?? "?"} yrs</span> : null}
                            {opportunity.requirements?.eu_passport ? <span className="rounded-full border border-[#a3ff12]/20 bg-[#a3ff12]/[.06] px-2 py-1 text-[7px] font-black uppercase text-[#caff72]">EU passport</span> : null}
                            {opportunity.requirements?.budget ? <span className="rounded-full border border-amber-300/20 bg-amber-300/[.06] px-2 py-1 text-[7px] font-black uppercase text-amber-200">{formatMoney(opportunity.requirements.budget)}</span> : null}
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-[8px] text-slate-600">POSITION</p>
                        <p className="mt-1 text-sm font-black">{opportunity.positionNeeded ?? "Open"}</p>
                        <p className="mt-1 text-[8px] text-slate-600">{deadlineLabel(opportunity.expiresAt)}</p>
                      </div>
                      <div>
                        <div className="flex justify-between text-[8px]"><span className="font-black text-slate-500">MATCH</span><span className="font-black text-cyan-300">{opportunity.matchScore ?? 0}%</span></div>
                        <div className="mt-2"><Meter value={opportunity.matchScore ?? 0} color={(opportunity.matchScore ?? 0) > 85 ? "lime" : "cyan"} /></div>
                        <p className="mt-2 text-[8px] font-black uppercase text-amber-300">{statusLabels[opportunity.status] ?? opportunity.status}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button disabled={savingId === opportunity.id} onClick={() => setSelectedOpportunityId(opportunity.id)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.035] px-3 text-[8px] font-black uppercase text-slate-200">
                          <Filter size={12} /> Match
                        </button>
                        <Link href={pitchHref(opportunity, opportunity.playerId)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 text-[8px] font-black uppercase text-[#caff72]">
                          <Sparkles size={12} /> Pitch
                        </Link>
                        <button disabled={savingId === opportunity.id} onClick={() => void runAction(opportunity.id, "send_profile")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] px-3 text-[8px] font-black uppercase text-cyan-100">
                          <Send size={12} /> Sent
                        </button>
                        <button disabled={savingId === opportunity.id} onClick={() => void runAction(opportunity.id, "open_negotiation")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[.08] px-3 text-[8px] font-black uppercase text-amber-100">
                          <ArrowUpRight size={12} /> Deal
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
                <Target size={28} className="text-slate-700" />
                <p className="mt-4 text-xs font-black uppercase text-white">No opportunities found</p>
                <p className="mt-2 max-w-md text-[10px] leading-5 text-slate-500">Create a club requirement above or change your filters.</p>
              </div>
            )}
          </GamePanel>
        </div>

        <aside className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Match players" title={selectedOpportunity?.clubName || "Select opportunity"} />
            {selectedOpportunity ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-4">
                  <p className="text-[10px] font-black uppercase italic text-white">{selectedOpportunity.title}</p>
                  <p className="mt-2 text-[9px] leading-5 text-slate-500">
                    Need: {selectedOpportunity.positionNeeded || "open position"} · Ages {selectedOpportunity.ageMin ?? "?"}–{selectedOpportunity.ageMax ?? "?"}
                  </p>
                </div>

                {matchedPlayers.map(({ player, score, reasons }) => (
                  <div key={player.id} className="rounded-3xl border border-white/[.07] bg-black/20 p-3">
                    <div className="flex gap-3">
                      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-cyan-300/15 bg-cyan-300/[.04]">
                        <span className="font-display text-lg font-black text-cyan-300/50">{initials(player.name)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black uppercase italic text-white">{player.name}</p>
                        <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{player.position ?? "Position open"} · {player.club ?? "Club open"}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="font-display text-2xl text-[#a3ff12]">{score}</span>
                          <div className="flex-1"><Meter value={score} color={score > 80 ? "lime" : "cyan"} /></div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(reasons.length ? reasons : ["portfolio option"]).map((reason) => (
                        <span key={reason} className="rounded-full border border-white/[.08] bg-white/[.035] px-2 py-1 text-[7px] font-black uppercase text-slate-500">{reason}</span>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Link href={pitchHref(selectedOpportunity, player.id)} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 text-[8px] font-black uppercase text-[#caff72]">
                        <Sparkles size={12} /> Create pitch
                      </Link>
                      <Link href={`/players/${player.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] px-3 text-[8px] font-black uppercase text-cyan-100">
                        Profile <ArrowUpRight size={12} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-7 text-slate-500">Create or select an opportunity to see suggested players.</p>
            )}
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Workflow" title="Request → Deal" />
            <div className="space-y-3">
              {[
                ["Club Request", "Create the need with role, age, budget and deadline.", ClipboardList, "cyan"],
                ["Match Players", "Touchline ranks portfolio players against the request.", UserRoundCheck, "lime"],
                ["Pitch Player", "Generate a club-ready proposal for the best fit.", Send, "gold"],
                ["Deal Room", "Move active interest into private negotiation.", ShieldCheck, "rose"],
              ].map(([titleItem, body, Icon, accent]) => {
                const StepIcon = Icon as typeof ClipboardList;
                return (
                  <div key={String(titleItem)} className="flex gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-4">
                    <StepIcon size={16} className={accent === "lime" ? "text-[#a3ff12]" : accent === "gold" ? "text-amber-300" : accent === "rose" ? "text-rose-300" : "text-cyan-300"} />
                    <div>
                      <p className="text-[10px] font-black uppercase text-white">{String(titleItem)}</p>
                      <p className="mt-1 text-[9px] leading-5 text-slate-500">{String(body)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Market signal" title="Commercial focus" />
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-2xl bg-white/[.045] p-3"><BadgeEuro size={15} className="mx-auto text-[#a3ff12]" /><p className="mt-2 text-[8px] text-slate-500">Budgeted</p><p className="text-sm font-black">{opportunities.filter((item) => item.requirements?.budget).length}</p></div>
              <div className="rounded-2xl bg-white/[.045] p-3"><Flame size={15} className="mx-auto text-rose-300" /><p className="mt-2 text-[8px] text-slate-500">Urgent</p><p className="text-sm font-black">{urgentOpportunities.length}</p></div>
              <div className="rounded-2xl bg-white/[.045] p-3"><Building2 size={15} className="mx-auto text-cyan-300" /><p className="mt-2 text-[8px] text-slate-500">Clubs</p><p className="text-sm font-black">{new Set(opportunities.map((item) => item.clubName).filter(Boolean)).size}</p></div>
              <div className="rounded-2xl bg-white/[.045] p-3"><Globe2 size={15} className="mx-auto text-amber-300" /><p className="mt-2 text-[8px] text-slate-500">EU Needs</p><p className="text-sm font-black">{opportunities.filter((item) => item.requirements?.eu_passport).length}</p></div>
            </div>
          </GamePanel>
        </aside>
      </div>
    </div>
  );
}
