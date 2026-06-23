"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Search, Sparkles } from "lucide-react";
import { GamePanel, SectionHeader } from "@/components/game-ui";
import { Input } from "@/components/ui";

type FootballLinkResult = {
  id: string;
  entity_type: string;
  source_provider: string;
  source_id: string | null;
  canonical_url: string;
  source_domain: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  last_seen_at: string | null;
};

function dateLabel(value?: string | null) {
  if (!value) return "Not indexed yet";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(value));
}

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function GlobalFootballLinkSearch({
  type,
  title,
  kicker = "Automatic Link Index",
  description,
  placeholder,
}: {
  type?: "player" | "agent" | "club" | "coach" | "competition" | "other";
  title: string;
  kicker?: string;
  description: string;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [links, setLinks] = useState<FootballLinkResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const latestRequest = useRef(0);
  const trimmed = query.trim();

  function updateQuery(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      latestRequest.current += 1;
      setLinks([]);
      setError("");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (trimmed.length < 2) return;

    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;

    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ q: trimmed, limit: "12" });
        if (type) params.set("type", type);
        const response = await fetch(`/api/football-links/search?${params.toString()}`);
        const data = await response.json() as { links?: FootballLinkResult[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Search unavailable.");
        if (latestRequest.current === requestId) setLinks(data.links ?? []);
      } catch (caught) {
        if (latestRequest.current === requestId) setError(caught instanceof Error ? caught.message : "Search unavailable.");
      } finally {
        if (latestRequest.current === requestId) setLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [trimmed, type]);

  return (
    <GamePanel className="mt-6 overflow-hidden p-5">
      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <div>
          <SectionHeader kicker={kicker} title={title} action={<Sparkles size={15} className="text-[#a3ff12]" />} />
          <p className="mt-3 text-xs leading-6 text-slate-500">{description}</p>
          <div className="relative mt-5">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
            <Input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder={placeholder} className="pl-11" />
          </div>
          <p className="mt-3 text-[9px] font-black uppercase tracking-[.18em] text-slate-600">
            {trimmed.length < 2 ? "Type at least 2 letters" : loading ? "Searching automatic index" : `${links.length} result${links.length === 1 ? "" : "s"}`}
          </p>
          {error && <p className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-3 text-xs font-bold text-rose-200">{error}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {loading && !links.length ? (
            <div className="col-span-full grid min-h-44 place-items-center rounded-3xl border border-white/[.07] bg-white/[.025]">
              <Loader2 size={24} className="animate-spin text-cyan-300" />
            </div>
          ) : links.length ? (
            links.map((link) => (
              <a key={link.id} href={link.canonical_url} target="_blank" rel="noreferrer" className="group flex gap-3 rounded-3xl border border-white/[.07] bg-white/[.025] p-3 transition hover:border-cyan-300/25 hover:bg-cyan-300/[.045]">
                <div className="size-14 shrink-0 overflow-hidden rounded-2xl border border-white/[.08] bg-black/30">
                  {link.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={link.image_url} alt={link.title} className="h-full w-full object-cover object-top" />
                  ) : (
                    <div className="grid h-full place-items-center text-[11px] font-black text-cyan-300/50">{initials(link.title)}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-black uppercase italic text-white group-hover:text-cyan-100">{link.title}</p>
                  <p className="mt-1 truncate text-[8px] font-bold uppercase tracking-wider text-slate-600">
                    {link.entity_type} · {link.source_domain ?? link.source_provider}
                  </p>
                  <p className="mt-2 text-[8px] font-bold uppercase tracking-wider text-[#a3ff12]">Indexed {dateLabel(link.last_seen_at)}</p>
                </div>
                <ExternalLink size={13} className="mt-4 shrink-0 text-slate-600 group-hover:text-cyan-300" />
              </a>
            ))
          ) : (
            <div className="col-span-full rounded-3xl border border-dashed border-white/[.08] p-6 text-center">
              <p className="text-[10px] font-black uppercase text-slate-400">No indexed links shown yet</p>
              <p className="mt-2 text-[10px] leading-5 text-slate-600">The daily indexer fills this from Touchline activity automatically.</p>
            </div>
          )}
        </div>
      </div>
    </GamePanel>
  );
}
