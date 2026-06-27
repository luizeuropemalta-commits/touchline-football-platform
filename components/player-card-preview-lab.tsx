"use client";

import { useMemo, useState } from "react";

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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(value: string) {
  if (!value || value === "Data not available") return "Data not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const tierLabels = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

export function PlayerCardPreviewLab({ players }: { players: PlayerCardPreviewItem[] }) {
  const [selectedId, setSelectedId] = useState(players[0]?.id ?? "");

  const selected = useMemo(
    () => players.find((player) => player.id === selectedId) ?? players[0],
    [players, selectedId],
  );

  if (!selected) {
    return (
      <div className="min-h-screen bg-[#020407] px-6 py-16 text-white">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-white/10 bg-white/[.05] p-8 text-center">
          <p className="text-sm font-black uppercase tracking-[.24em] text-cyan-200">Touchline Card Preview</p>
          <h1 className="mt-4 text-4xl font-black uppercase italic">No players found</h1>
          <p className="mt-4 text-white/60">The preview route is working, but no player records were returned from the database.</p>
        </div>
      </div>
    );
  }

  const tierClass = {
    bronze: "touchline-preview-card--bronze",
    silver: "touchline-preview-card--silver",
    gold: "touchline-preview-card--gold",
  }[selected.tier];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_50%_0%,#173145,#07121b_35%,#020407)] px-4 py-6 text-white sm:px-7">
      <style jsx global>{`
        .touchline-preview-card {
          --edge1: #7f95a7;
          --edge2: #ffffff;
          --edge3: #8ab5ce;
          position: relative;
          overflow: hidden;
          border-radius: 54px;
          background: linear-gradient(145deg, rgba(16, 34, 50, 0.92), rgba(4, 8, 12, 0.98));
          box-shadow: 0 35px 90px rgba(0, 0, 0, 0.65), 0 0 60px rgba(117, 232, 255, 0.08);
        }
        .touchline-preview-card--gold {
          --edge1: #f3ba26;
          --edge2: #fff2a4;
          --edge3: #8f5f00;
        }
        .touchline-preview-card--silver {
          --edge1: #7f95a7;
          --edge2: #ffffff;
          --edge3: #8ab5ce;
        }
        .touchline-preview-card--bronze {
          --edge1: #8a4d25;
          --edge2: #ffbe73;
          --edge3: #5b351f;
        }
        .touchline-preview-card::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 54px;
          padding: 5px;
          background: linear-gradient(135deg, var(--edge1), var(--edge2), var(--edge3), var(--edge1));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        .touchline-preview-card::after {
          content: "";
          position: absolute;
          inset: -40%;
          background: linear-gradient(110deg, transparent 35%, rgba(255, 255, 255, 0.2), transparent 52%);
          animation: touchline-preview-sweep 5s infinite;
          opacity: 0.45;
        }
        @keyframes touchline-preview-sweep {
          0% {
            transform: translateX(-55%) rotate(8deg);
          }
          55%,
          100% {
            transform: translateX(55%) rotate(8deg);
          }
        }
        .touchline-preview-portrait::before {
          content: "";
          position: absolute;
          width: 220px;
          height: 270px;
          border-radius: 42% 42% 26% 26%;
          background: linear-gradient(#d5e1e8, #74889a 45%, #17232e);
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          filter: drop-shadow(0 25px 35px rgba(0, 0, 0, 0.65));
        }
        .touchline-preview-portrait::after {
          content: attr(data-initials);
          position: absolute;
          bottom: 116px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 96px;
          font-weight: 1000;
          color: rgba(5, 12, 18, 0.72);
        }
      `}</style>

      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.35em] text-cyan-200">Touchline Football Platform</p>
            <h1 className="mt-2 text-3xl font-black uppercase italic tracking-tight sm:text-5xl">Player Card V1 Preview</h1>
          </div>
          <p className="max-w-xl text-sm leading-6 text-white/60">
            Escolha um jogador real salvo no Touchline Database. O card usa só os dados disponíveis; onde falta sincronização aparece “Data not available”.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="max-h-[78vh] overflow-auto rounded-[1.75rem] border border-white/10 bg-white/[.055] p-4 backdrop-blur-xl">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[.22em] text-[#b7ff45]">{players.length} real database players</p>
            {players.map((player) => (
              <button
                key={player.id}
                onClick={() => setSelectedId(player.id)}
                className={`mb-2 w-full rounded-2xl border p-4 text-left transition ${
                  player.id === selected.id
                    ? "border-[#a3ff12] bg-[#a3ff12]/10 shadow-[0_0_28px_rgba(163,255,18,.14)]"
                    : "border-white/10 bg-[#03080d]/70 hover:border-cyan-200/40"
                }`}
              >
                <span className="block text-sm font-black uppercase italic">{player.name}</span>
                <span className="mt-1 block text-xs text-white/55">
                  {player.club} · {player.position} · {player.market}
                </span>
              </button>
            ))}
          </aside>

          <section className="grid place-items-center">
            <article className={`touchline-preview-card ${tierClass} w-full max-w-[620px] p-7`}>
              <div className="relative z-10">
                <div className="float-right rounded-2xl border border-white/25 bg-white/[.08] px-4 py-2 text-sm font-black uppercase tracking-[.12em] text-[var(--edge2)]">
                  {tierLabels[selected.tier]}
                </div>
                <div className="font-black uppercase tracking-[.16em] text-[#eaf7ff]">
                  TL TOUCHLINE
                  <span className="mt-1 block text-[10px] tracking-[.42em] text-cyan-200">Football Platform</span>
                </div>

                <div
                  className="touchline-preview-portrait relative my-7 grid h-[420px] place-items-center overflow-hidden rounded-[2.25rem] border border-white/10 bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,.28),rgba(117,232,255,.08)_36%,rgba(0,0,0,.22)_68%),linear-gradient(150deg,rgba(255,255,255,.12),rgba(255,255,255,.02))]"
                  data-initials={initials(selected.name)}
                />

                <h2 className="text-5xl font-black uppercase italic leading-[.92] tracking-[-.04em] sm:text-6xl">{selected.name}</h2>
                <p className="mt-3 text-xs font-black uppercase tracking-[.16em] text-cyan-100/80">
                  {selected.nationality} / {selected.club} / {selected.position}
                </p>

                <div className="my-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Info label="Market value" value={selected.market} />
                  <Info label="Age" value={selected.age} />
                  <Info label="Source" value={selected.source} />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Info label="Current league" value={selected.league} />
                  <Info label="Height / Foot" value={selected.height !== "Data not available" || selected.foot !== "Data not available" ? `${selected.height} / ${selected.foot}` : "Data not available"} />
                  <Info label="Agent" value={selected.agent} />
                  <Info label="Last updated" value={formatDate(selected.updated)} />
                  <Info label="Season stats" value="Awaiting provider sync" />
                  <Info label="Shirt number" value={selected.shirt} />
                </div>

                <p className="mt-5 text-center text-[11px] font-black uppercase tracking-[.18em] text-white/45">
                  Official Touchline Player Card · Preview only
                </p>
              </div>
            </article>
          </section>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-h-20 rounded-2xl border border-white/10 bg-black/35 p-4">
      <span className="block text-[10px] font-black uppercase tracking-[.16em] text-[#91adc1]">{label}</span>
      <strong className="mt-2 block text-xl text-white">{value}</strong>
    </div>
  );
}
