"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Link2, Loader2, Play, RefreshCw, Search, ShieldAlert, Users } from "lucide-react";
import { GamePanel, SectionHeader, StatTile } from "@/components/game-ui";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

type Entity = {
  id: string;
  transfermarkt_id: string;
  entity_type: "player" | "agent" | "club";
  name: string;
  profile_url: string;
  canonical_url: string;
  photo_url: string | null;
  status: string;
  confidence: string;
  last_checked_at: string | null;
  next_check_at: string | null;
  source_url: string | null;
  updated_at: string | null;
};

type SyncLog = {
  id: string;
  action: string;
  status: string;
  source_url: string | null;
  message: string | null;
  records_found: number;
  records_saved: number;
  duration_ms: number | null;
  created_at: string;
};

type Relationship = {
  id: string;
  relationship_type: string;
  status: string;
  evidence: string | null;
  source_url: string | null;
  last_seen_at: string | null;
  source?: { name?: string | null; entity_type?: string | null; transfermarkt_id?: string | null } | null;
  target?: { name?: string | null; entity_type?: string | null; transfermarkt_id?: string | null } | null;
};

type Payload = {
  ok?: boolean;
  entities?: Entity[];
  logs?: SyncLog[];
  relationships?: Relationship[];
  counts?: { total: number; players: number; agents: number; clubs: number; needsReview: number };
  error?: string;
};

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function dateLabel(value?: string | null) {
  if (!value) return "Not checked yet";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === "active" || status === "success") return "border-[#a3ff12]/20 bg-[#a3ff12]/10 text-[#caff72]";
  if (status === "needs_review" || status === "partial" || status === "not_configured") return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  if (status === "unavailable" || status === "error" || status === "rejected") return "border-rose-300/25 bg-rose-300/10 text-rose-200";
  return "border-cyan-300/20 bg-cyan-300/[.07] text-cyan-100";
}

export function MarketLinkRegistryAdmin() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [counts, setCounts] = useState({ total: 0, players: 0, agents: 0, clubs: 0, needsReview: 0 });
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const filters = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    return params.toString();
  }, [query, status, type]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/market-links${filters ? `?${filters}` : ""}`);
      const data = await response.json() as Payload;
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not load registry.");
      setEntities(data.entities ?? []);
      setLogs(data.logs ?? []);
      setRelationships(data.relationships ?? []);
      setCounts(data.counts ?? { total: 0, players: 0, agents: 0, clubs: 0, needsReview: 0 });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load registry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 220);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function addLink(discoverRelationships = false) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/market-links/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          name,
          entityType: type || undefined,
          discoverRelationships,
        }),
      });
      const data = await response.json() as { ok?: boolean; relationshipsSaved?: number; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not save link.");
      setUrl("");
      setName("");
      setMessage(discoverRelationships ? `Link saved. Suggested relationships: ${data.relationshipsSaved ?? 0}.` : "Transfermarkt link saved.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save link.");
    } finally {
      setSaving(false);
    }
  }

  async function runSync() {
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/market-links/sync?limit=25", { method: "POST" });
      const data = await response.json() as { ok?: boolean; checked?: number; updated?: number; status?: string; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not run sync.");
      setMessage(data.status === "not_configured"
        ? "Registry is ready, but external sync is not configured yet. Set TRANSFERMARKT_SYNC_ENABLED=true when you want daily checks."
        : `Sync complete. Checked ${data.checked ?? 0}, updated ${data.updated ?? 0}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not run sync.");
    } finally {
      setSyncing(false);
    }
  }

  async function discoverByName() {
    const searchName = name.trim() || query.trim();
    setDiscovering(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/market-links/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchName,
          entityType: type || "player",
          limit: 8,
        }),
      });
      const data = await response.json() as { ok?: boolean; discovered?: number; saved?: number; sourceUrl?: string | null; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not discover links.");
      setMessage(data.saved
        ? `Discovery complete. Saved ${data.saved} candidate link${data.saved === 1 ? "" : "s"} from Transfermarkt search.`
        : "No candidate links found. Try full name, another spelling, or paste the exact URL as fallback.");
      if (searchName) setQuery(searchName);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not discover links.");
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] min-w-0 animate-in space-y-6">
      <GamePanel className="relative overflow-hidden p-5 sm:p-7 xl:p-8">
        <div className="absolute right-[-12%] top-[-60%] size-[520px] rounded-full border border-cyan-300/[.08] bg-cyan-300/[.025]" />
        <div className="relative z-10 grid min-w-0 gap-8 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]">
                <span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" />
                Safe link registry
              </span>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                Links only · no full database copy
              </span>
            </div>
            <p className="af-mode-kicker">Owner Admin / Market Link Registry</p>
            <h1 className="af-mode-title font-display mt-3 text-white">Market Link Registry</h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300/80">
              Stores Transfermarkt profile links for players, agents and clubs. It saves ID, URL, name, public preview image and sync status only.
            </p>
          </div>
          <div className="stadium-scoreboard min-w-0 p-5">
            <p className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-300">Compliance mode</p>
            <h2 className="mt-2 text-2xl font-black uppercase italic text-white">Link registry only</h2>
            <p className="mt-3 text-xs leading-6 text-slate-400">
              No aggressive crawling. External checks are server-side, opt-in and rate limited.
            </p>
            <Link href="/admin" className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black uppercase tracking-wider text-cyan-100">
              Owner Admin
            </Link>
          </div>
        </div>
      </GamePanel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile icon={Link2} label="Total Links" value={String(counts.total)} delta="registry records" accent="cyan" />
        <StatTile icon={Users} label="Players" value={String(counts.players)} delta="saved profiles" accent="lime" />
        <StatTile icon={Users} label="Agents" value={String(counts.agents)} delta="advisor links" accent="gold" />
        <StatTile icon={Users} label="Clubs" value={String(counts.clubs)} delta="club links" accent="rose" />
        <StatTile icon={ShieldAlert} label="Review" value={String(counts.needsReview)} delta="uncertain matches" accent="gold" />
      </div>

      {message && <div className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 py-3 text-sm font-bold text-[#caff72]">{message}</div>}
      {error && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-200">{error}</div>}

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <GamePanel className="p-5 sm:p-6">
          <SectionHeader kicker="Registry controls" title="Add or search Transfermarkt links" />
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_160px_160px]">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search saved link by name or ID..." className="pl-9" />
            </div>
            <select value={type} onChange={(event) => setType(event.target.value)} className="h-12 rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 text-sm font-bold uppercase tracking-wider text-white outline-none transition focus:border-cyan-300/45">
              <option value="">All types</option>
              <option value="player">Player</option>
              <option value="agent">Agent</option>
              <option value="club">Club</option>
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-12 rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 text-sm font-bold uppercase tracking-wider text-white outline-none transition focus:border-cyan-300/45">
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="needs_review">Needs review</option>
              <option value="unavailable">Unavailable</option>
              <option value="duplicate">Duplicate</option>
            </select>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_.8fr_auto]">
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste Transfermarkt player, agent or club URL..." />
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional display name" />
            <Button onClick={() => void addLink(false)} disabled={saving || !url.trim()}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Save
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void discoverByName()} disabled={discovering || !(name.trim() || query.trim())}>
              {discovering ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Discover by name
            </Button>
            <Button variant="secondary" onClick={() => void addLink(true)} disabled={saving || !url.trim()}>
              Discover agent players
            </Button>
            <Button variant="secondary" onClick={() => void runSync()} disabled={syncing}>
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Run sync
            </Button>
            <Button variant="secondary" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="grid min-h-56 place-items-center rounded-3xl border border-white/[.07] bg-white/[.025]">
                <Loader2 className="animate-spin text-cyan-300" />
              </div>
            ) : entities.length ? (
              entities.map((entity) => (
                <article key={entity.id} className="grid gap-4 rounded-3xl border border-white/[.08] bg-white/[.025] p-4 transition hover:border-cyan-300/25 md:grid-cols-[64px_minmax(0,1fr)_auto] md:items-center">
                  <div className="size-16 overflow-hidden rounded-2xl border border-white/[.1] bg-black/30">
                    {entity.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entity.photo_url} alt={entity.name} className="h-full w-full object-cover object-top" />
                    ) : (
                      <div className="grid h-full place-items-center text-[12px] font-black text-cyan-300/50">{initials(entity.name)}</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-black uppercase italic text-white">{entity.name}</h3>
                      <span className={cn("rounded-full border px-2 py-1 text-[8px] font-black uppercase", statusClass(entity.status))}>{entity.status}</span>
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-2 py-1 text-[8px] font-black uppercase text-cyan-100">{entity.entity_type}</span>
                    </div>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                      TM ID {entity.transfermarkt_id} · checked {dateLabel(entity.last_checked_at)}
                    </p>
                    <p className="mt-2 truncate text-[10px] text-slate-500">{entity.canonical_url}</p>
                  </div>
                  <a href={entity.canonical_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 text-[9px] font-black uppercase tracking-wider text-[#caff72]">
                    Open <ExternalLink size={13} />
                  </a>
                </article>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-white/[.08] p-8 text-center">
                <p className="text-xs font-black uppercase text-white">No registry links found</p>
                <p className="mt-2 text-[10px] leading-5 text-slate-500">Paste a Transfermarkt URL above to start the safe registry.</p>
              </div>
            )}
          </div>
        </GamePanel>

        <div className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Sync logs" title="Latest checks" />
            <div className="mt-4 space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-white/[.07] bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[9px] font-black uppercase text-white">{log.action}</p>
                    <span className={cn("rounded-full border px-2 py-1 text-[7px] font-black uppercase", statusClass(log.status))}>{log.status}</span>
                  </div>
                  <p className="mt-2 text-[10px] leading-5 text-slate-500">{log.message || "No message"}</p>
                  <p className="mt-2 text-[8px] font-bold uppercase tracking-wider text-slate-600">
                    found {log.records_found} · saved {log.records_saved}
                  </p>
                </div>
              ))}
              {!logs.length && <p className="rounded-2xl border border-white/[.07] p-4 text-xs text-slate-500">No sync logs yet.</p>}
            </div>
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Relationship suggestions" title="Agent ↔ Player links" />
            <div className="mt-4 space-y-3">
              {relationships.map((relationship) => (
                <div key={relationship.id} className="rounded-2xl border border-white/[.07] bg-black/20 p-3">
                  <p className="text-[9px] font-black uppercase text-cyan-200">{relationship.source?.name || "Source"} → {relationship.target?.name || "Target"}</p>
                  <p className="mt-2 text-[10px] leading-5 text-slate-500">{relationship.evidence || relationship.relationship_type}</p>
                  <span className={cn("mt-3 inline-flex rounded-full border px-2 py-1 text-[7px] font-black uppercase", statusClass(relationship.status))}>{relationship.status}</span>
                </div>
              ))}
              {!relationships.length && <p className="rounded-2xl border border-white/[.07] p-4 text-xs text-slate-500">No suggested relationships yet.</p>}
            </div>
          </GamePanel>
        </div>
      </div>
    </div>
  );
}
