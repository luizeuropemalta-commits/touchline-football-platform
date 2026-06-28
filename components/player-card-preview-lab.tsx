"use client";

import { TouchlinePlayerCard, type TouchlinePlayerCardModel } from "@/components/touchline-card-engine";

export type PlayerCardPreviewItem = {
  id: string;
  name: string;
  club: string;
  position: string;
  nationality: string;
  age: string;
  market: string;
  marketValue: number;
  tier: "bronze" | "silver" | "gold";
  agent: string;
  height: string;
  foot: string;
  shirt: string;
  league: string;
  updated: string;
  source: string;
};

export function PlayerCardPreviewLab({
  initialPlayer,
  initialQuery = "",
  referenceImageSrc,
}: {
  players: PlayerCardPreviewItem[];
  initialPlayer?: TouchlinePlayerCardModel | null;
  initialQuery?: string;
  referenceImageSrc?: string;
}) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_48%_0%,rgba(246,200,76,.14),transparent_28%),radial-gradient(circle_at_80%_28%,rgba(117,232,255,.12),transparent_26%),linear-gradient(145deg,#030506,#07121c_48%,#010203)] px-4 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-white/10 bg-white/[.045] p-5 shadow-[0_28px_70px_rgba(0,0,0,.45)] backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-[.28em] text-[#f6c84c]">Touchline player card system</p>
          <h1 className="mt-3 font-display text-4xl font-black uppercase italic tracking-[-.07em] text-white">
            Player Card V1
            <span className="block text-[#f6c84c]">Preview</span>
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-white/60">
            Digite o nome do atleta, baixe via Sportmonks e veja o card Touchline preencher os dados automaticamente em modo avatar.
          </p>
        </header>

        <section className="relative mt-8 min-w-0 overflow-hidden rounded-[2.5rem] border border-white/10 bg-black/30 p-5 shadow-[0_30px_90px_rgba(0,0,0,.55)] backdrop-blur-xl sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(246,200,76,.14),transparent_34%),linear-gradient(115deg,transparent,rgba(255,255,255,.05),transparent)]" />
          <div className="relative z-10 mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.28em] text-cyan-200">Official Touchline Card Engine</p>
              <h2 className="mt-2 font-display text-3xl font-black uppercase italic tracking-[-.06em] text-white sm:text-5xl">Sportmonks player search</h2>
            </div>
            <div className="rounded-full border border-[#f6c84c]/25 bg-[#f6c84c]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[.18em] text-[#f6c84c]">
              Live avatar card
            </div>
          </div>

          <div className="relative z-10 grid gap-6 2xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
            <div className="rounded-[2rem] border border-cyan-200/15 bg-black/45 p-4 shadow-[0_0_42px_rgba(117,232,255,.08)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.24em] text-cyan-200">Implementação atual</p>
                  <p className="mt-1 text-xs text-white/55">Busca, importação e avatar card</p>
                </div>
                <span className="rounded-full border border-cyan-200/25 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-cyan-200">
                  Preview
                </span>
              </div>
              <form action="/card-preview" className="grid gap-5">
                <label className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-100/70" htmlFor="sportmonks-player-search">
                  Buscar/importar atleta Sportmonks
                </label>
                <div className="flex gap-2">
                  <input
                    id="sportmonks-player-search"
                    name="playerName"
                    defaultValue={initialQuery}
                    className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/65 px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/50"
                    placeholder="Digite o nome do atleta"
                  />
                  <button
                    type="submit"
                    className="h-12 rounded-2xl border border-[#a3ff12]/30 bg-[#a3ff12]/10 px-4 text-[9px] font-black uppercase tracking-[.12em] text-[#d8ff8a]"
                  >
                    Baixar
                  </button>
                </div>
                {initialPlayer ? (
                  <div className="flex min-h-[650px] items-center justify-center overflow-visible rounded-[1.5rem] bg-black/35 p-6">
                    <TouchlinePlayerCard player={initialPlayer} variant="showcase" />
                  </div>
                ) : null}
              </form>
            </div>

            <div className="rounded-[2rem] border border-[#f6c84c]/30 bg-black/45 p-4 shadow-[0_0_42px_rgba(246,200,76,.12)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.24em] text-[#f6c84c]">Referência aprovada</p>
                  <p className="mt-1 text-xs text-white/55">Design oficial bloqueado</p>
                </div>
                <span className="rounded-full border border-[#f6c84c]/30 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-[#f6c84c]">
                  Não publicar
                </span>
              </div>
              {referenceImageSrc ? (
                <img
                  src={referenceImageSrc}
                  alt="Approved Touchline Player Card reference"
                  className="mx-auto max-h-[86vh] w-full object-contain"
                />
              ) : (
                <div className="flex min-h-[520px] items-center justify-center rounded-[1.5rem] border border-white/10 bg-white/[.03] text-white/50">
                  Reference image not configured.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
