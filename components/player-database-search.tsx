"use client";

import Link from "next/link";
import { Search, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";

type SportmonksCandidate = {
  sportmonksPlayerId: string;
  name: string;
  commonName?: string | null;
  clubName?: string | null;
  clubLogoUrl?: string | null;
  leagueName?: string | null;
  nationality?: string | null;
  position?: string | null;
  shirtNumber?: string | number | null;
  marketValue?: string | null;
  marketValueEur?: number | null;
  imagePath?: string | null;
};

function initials(value?: string | null) {
  const parts = String(value || "TL").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "TL";
}

export function PlayerDatabaseSearch({ mode = "full", locale = "en-GB" }: { mode?: "full" | "compact"; locale?: "en-GB" | "pt-BR" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SportmonksCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const compact = mode === "compact";
  const pt = locale === "pt-BR";
  const copy = pt ? {
    compactPlaceholder: "Pesquisar na TouchLine England...", placeholder: "Pesquisar jogadores nos dados da TouchLine England...",
    failed: "A pesquisa da TouchLine England falhou.", searching: "Pesquisando na TouchLine England...", empty: "Nenhum jogador da TouchLine England foi encontrado.",
    verified: "Dados verificados pela TouchLine England", publicLabel: "Exibidos publicamente como TouchLine England", pending: "PENDENTE",
  } : {
    compactPlaceholder: "Search TouchLine England...", placeholder: "Search players through TouchLine England data...",
    failed: "TouchLine England search failed.", searching: "Searching TouchLine England...", empty: "No TouchLine England player found.",
    verified: "TouchLine England verified data", publicLabel: "Shown publicly as TouchLine England", pending: "PENDING",
  };

  useEffect(() => {
    if (trimmed.length < 2) {
      queueMicrotask(() => {
        setResults([]);
        setError(null);
        setLoading(false);
      });
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/players/search-and-build-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, searchOnly: true }),
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) throw new Error(copy.failed);
        setResults(Array.isArray(payload?.candidates) ? payload.candidates : []);
      } catch (_err) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(copy.failed);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [copy.failed, trimmed]);

  const visibleResults = useMemo(() => results.slice(0, compact ? 4 : 10), [compact, results]);

  return (
    <div className={compact ? "relative" : "rounded-3xl border border-cyan-300/15 bg-black/25 p-4 shadow-[0_24px_80px_rgba(0,0,0,.25)]"}>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-200/60" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={compact ? copy.compactPlaceholder : copy.placeholder}
          aria-label={compact ? copy.compactPlaceholder : copy.placeholder}
          className="h-11 w-full rounded-2xl border border-cyan-300/15 bg-white/[.045] pl-10 pr-3 text-xs font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-[#a3ff12]/40 focus:bg-white/[.07]"
        />
      </div>

      {!compact && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[8px] font-black text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#a3ff12]/20 bg-[#a3ff12]/10 px-2.5 py-1 text-[#caff72]">
            <ShieldCheck size={11} /> {copy.verified}
          </span>
          <span>{copy.publicLabel}</span>
        </div>
      )}

      {(loading || error || visibleResults.length > 0 || trimmed.length >= 2) && (
        <div className={compact ? "absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#06111d]/95 shadow-2xl backdrop-blur-xl" : "mt-4 overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.025]"}>
          {loading && <div className="p-4 text-[10px] font-black text-cyan-100" role="status">{copy.searching}</div>}
          {error && <div className="p-4 text-[10px] font-bold text-rose-200">{error}</div>}
          {!loading && !error && trimmed.length >= 2 && visibleResults.length === 0 && (
            <div className="p-4 text-[10px] font-bold text-slate-500" role="status">{copy.empty}</div>
          )}
          {!loading && !error && visibleResults.map((player) => (
            <Link
              key={player.sportmonksPlayerId}
              href={touchlinePlayerProfileHref({
                sportmonksPlayerId: player.sportmonksPlayerId,
                name: player.name,
                clubName: player.clubName ?? undefined,
                position: player.position ?? undefined,
                shirtNumber: player.shirtNumber ?? undefined,
              }, locale)}
              className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-t border-white/[.06] p-3 first:border-t-0 transition hover:bg-cyan-300/[.055]"
            >
              <div className="grid size-11 place-items-center overflow-hidden rounded-xl border border-white/[.08] bg-black/30 text-[11px] font-black text-cyan-100">
                {player.imagePath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={player.imagePath} alt={player.name} className="h-full w-full object-cover object-top" />
                ) : (
                  initials(player.name)
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-black  italic text-white">{player.name}</p>
                <p className="mt-1 truncate text-[9px] font-bold text-slate-500">
                  {[player.clubName, player.position, player.nationality].filter(Boolean).join(" · ") || "TouchLine England"}
                </p>
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-[10px] font-black text-[#caff72]">{player.marketValue || copy.pending}</p>
                <UserRound size={13} className="ml-auto mt-1 text-cyan-300/60" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
