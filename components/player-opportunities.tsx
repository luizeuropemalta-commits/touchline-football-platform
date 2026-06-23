"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle2, Loader2, MessageSquare, Radio, Send, Target, Zap } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { GamePanel, LivePill, Meter, SectionHeader, StatTile } from "@/components/game-ui";

type Opportunity = {
  id: string;
  title: string;
  positionNeeded?: string | null;
  matchScore?: number | null;
  status: string;
  clubName?: string | null;
  playerName?: string | null;
};

type PlayerOption = {
  id: string;
  name: string;
  position?: string | null;
};

type OpportunityApiRow = {
  id: string;
  title: string;
  position_needed?: string | null;
  match_score?: number | null;
  status: string;
  players?: { first_name?: string | null; last_name?: string | null } | Array<{ first_name?: string | null; last_name?: string | null }> | null;
  clubs?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function relationName(value: OpportunityApiRow["players"] | OpportunityApiRow["clubs"]) {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item) return "";
  const record = item as { name?: string | null; first_name?: string | null; last_name?: string | null };
  return record.name ?? `${record.first_name ?? ""} ${record.last_name ?? ""}`.trim();
}

export function PlayerOpportunities({ initialOpportunities, players }: { initialOpportunities: Opportunity[]; players: PlayerOption[] }) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [clubName, setClubName] = useState("");
  const [positionNeeded, setPositionNeeded] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.id ?? "");
  const [creating, setCreating] = useState(false);

  async function reload() {
    const response = await fetch("/api/opportunities");
    const data = (await response.json()) as { opportunities?: OpportunityApiRow[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not reload opportunities.");
    setOpportunities(
      (data.opportunities ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        positionNeeded: item.position_needed,
        matchScore: item.match_score,
        status: item.status,
        playerName: relationName(item.players),
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
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not update opportunity.");
      setNotice("Opportunity action saved.");
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
          playerId: selectedPlayerId,
          source: "club_requirement",
          matchScore: 78,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not create opportunity.");
      setTitle("");
      setClubName("");
      setPositionNeeded("");
      setNotice("Opportunity created and ready for action.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create opportunity.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] animate-in space-y-6">
      <section className="af-mode-screen p-5 sm:p-7 xl:p-9" style={{ "--mode-aura": "rgba(163,255,18,.22)" } as React.CSSProperties}>
        <div className="relative z-10 grid gap-8 xl:grid-cols-[1fr_420px] xl:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <LivePill>AI matching workflow</LivePill>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                Real club requirements
              </span>
            </div>
            <p className="af-mode-kicker">Touchline / Player Opportunities</p>
            <h1 className="af-mode-title font-display mt-3 text-white">Player Opportunities</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300/80">
              Match club requirements with your player portfolio and take one-click action: send profile, request contact or open negotiation.
            </p>
          </div>
          <div className="stadium-scoreboard p-5">
            <div className="relative z-10 flex items-center justify-between">
              <div><p className="text-[8px] font-black uppercase tracking-[.22em] text-[#a3ff12]">Open matches</p><p className="font-display mt-2 text-7xl leading-none text-white">{opportunities.length}</p></div>
              <Target className="text-[#a3ff12]" size={38} />
            </div>
            <div className="relative z-10 mt-5"><div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500"><span>Opportunity pipeline</span><span>{opportunities.length ? "active" : "empty"}</span></div><Meter value={Math.min(100, opportunities.length * 18)} color="lime" /></div>
          </div>
        </div>
      </section>

      {notice && <div className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 py-3 text-sm font-bold text-[#caff72]">{notice}</div>}
      {error && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-200">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={Target} label="Open Opportunities" value={String(opportunities.filter((item) => item.status === "open").length)} delta="awaiting action" accent="cyan" />
        <StatTile icon={Send} label="Profiles Sent" value={String(opportunities.filter((item) => item.status === "sent_profile").length)} delta="club follow-up" accent="lime" />
        <StatTile icon={Zap} label="Negotiations" value={String(opportunities.filter((item) => item.status === "negotiation").length)} delta="active rooms" accent="gold" />
      </div>

      <GamePanel className="p-5">
        <SectionHeader kicker="Create club requirement" title="Manual opportunity" />
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_240px_auto]">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: club needs striker 18–25 EU passport" />
          <Input value={clubName} onChange={(event) => setClubName(event.target.value)} placeholder="Club" />
          <Input value={positionNeeded} onChange={(event) => setPositionNeeded(event.target.value)} placeholder="Position" />
          <select value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)} className="h-12 rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 text-sm text-white outline-none focus:border-cyan-300/45">
            <option value="">No player selected</option>
            {players.map((player) => <option key={player.id} value={player.id}>{player.name} {player.position ? `· ${player.position}` : ""}</option>)}
          </select>
          <Button onClick={createOpportunity} disabled={creating}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Create
          </Button>
        </div>
      </GamePanel>

      <GamePanel className="status-scan overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4">
          <div><p className="text-[8px] font-black uppercase tracking-[.2em] text-cyan-300">Live opportunity board</p><h2 className="mt-1 text-sm font-black uppercase italic">Club needs × player matches</h2></div>
          <Radio size={16} className="pulse-live text-rose-400" />
        </div>
        {opportunities.length ? (
          <div className="divide-y divide-white/[.06]">
            {opportunities.map((opportunity, index) => (
              <div key={opportunity.id} className="live-row grid gap-4 px-5 py-5 md:grid-cols-[1.2fr_.7fr_.7fr_.9fr] md:items-center" style={{ "--row-accent": (opportunity.matchScore ?? 0) > 85 ? "#a3ff12" : "#22d3ee" } as React.CSSProperties}>
                <div className="flex items-center gap-3">
                  <span className="interactive-icon grid size-9 place-items-center rounded-lg border border-white/[.08] bg-white/[.03] text-[9px] font-black text-slate-500">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="text-[11px] font-black uppercase italic">{opportunity.title}</p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{opportunity.clubName ?? "Club open"} · {opportunity.playerName ?? "Player open"}</p>
                  </div>
                </div>
                <div><p className="text-[8px] text-slate-600">POSITION</p><p className="mt-1 text-sm font-black">{opportunity.positionNeeded ?? "Open"}</p></div>
                <div><div className="flex justify-between text-[8px]"><span className="font-black text-slate-500">MATCH</span><span className="font-black text-cyan-300">{opportunity.matchScore ?? 0}%</span></div><div className="mt-2"><Meter value={opportunity.matchScore ?? 0} color={(opportunity.matchScore ?? 0) > 85 ? "lime" : "cyan"} /></div><p className="mt-2 text-[8px] font-black text-amber-300">{opportunity.status.replaceAll("_", " ")}</p></div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button disabled={savingId === opportunity.id} onClick={() => void runAction(opportunity.id, "send_profile")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] px-3 text-[8px] font-black uppercase text-cyan-100">
                    <Send size={12} /> Send Profile
                  </button>
                  <button disabled={savingId === opportunity.id} onClick={() => void runAction(opportunity.id, "request_contact")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[.08] px-3 text-[8px] font-black uppercase text-amber-100">
                    <MessageSquare size={12} /> Contact
                  </button>
                  <button disabled={savingId === opportunity.id} onClick={() => void runAction(opportunity.id, "open_negotiation")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 text-[8px] font-black uppercase text-[#caff72]">
                    <ArrowUpRight size={12} /> Negotiate
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center text-center">
            <Target size={28} className="text-slate-700" />
            <p className="mt-4 text-xs font-black uppercase text-white">No opportunities yet</p>
            <p className="mt-2 max-w-md text-[10px] leading-5 text-slate-500">Create a club requirement above or connect future live club search data to trigger automatic matches.</p>
          </div>
        )}
      </GamePanel>
    </div>
  );
}
