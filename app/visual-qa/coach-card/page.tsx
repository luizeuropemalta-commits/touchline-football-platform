"use client";

import { useEffect, useMemo, useState } from "react";

import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import { TOUCHLINE_DEMO_COACH, createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import {
  TOUCHLINE_CARD_TIER_KEYS,
  touchlineCardTierName,
  touchlineArenaTierForKey,
  type TouchlineCardTierKey,
} from "@/lib/touchlineArena/card-rules";
import {
  TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT,
  TOUCHLINE_COACH_CARD_LAYOUT_EVENT,
  TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY,
  normalizeTouchlineCoachCardLayout,
  type TouchlineCoachCardLayout,
} from "@/lib/touchlineArena/coach-card-layout";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";

export default function CoachCardVisualQA() {
  const club = findTouchLineClub("manchester-city")!;
  const [previewTier, setPreviewTier] = useState<TouchlineCardTierKey>("ruby-red");
  const slot = useMemo(() => {
    const base = createTouchlineArenaCoachSlot(TOUCHLINE_DEMO_COACH);
    return {
      ...base,
      cardTier: previewTier,
      cardPriceTc: touchlineArenaTierForKey(previewTier)?.retailPriceTc ?? 1,
    };
  }, [previewTier]);
  const [layout, setLayout] = useState<TouchlineCoachCardLayout>(TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT);
  const coachName = TOUCHLINE_DEMO_COACH.displayName;
  const clubName = club.name;
  const countryCode = "ITA";
  const shirtColor = club.accent;
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  /* eslint-disable react-hooks/set-state-in-effect -- local visual editor hydrates its saved draft after mount. */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY);
      if (saved) {
        setLayout(normalizeTouchlineCoachCardLayout(JSON.parse(saved)));
        return;
      }
      fetch("/touchlineArena/card-layouts/coach-card-layout.json", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          if (payload) setLayout(normalizeTouchlineCoachCardLayout(payload));
        })
        .catch(() => undefined);
    } catch {
      setLayout(TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const previewCoach = useMemo(() => ({
    ...TOUCHLINE_DEMO_COACH,
    name: coachName.trim() || TOUCHLINE_DEMO_COACH.name,
    displayName: coachName.trim() || TOUCHLINE_DEMO_COACH.displayName,
    photoUrl: undefined,
  }), [coachName]);

  async function saveAsMaster() {
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/touchline-arena/coach-card-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
      });
      if (!response.ok) throw new Error("save failed");
      window.localStorage.setItem(TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
      window.dispatchEvent(new CustomEvent(TOUCHLINE_COACH_CARD_LAYOUT_EVENT, { detail: { layout } }));
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 2600);
    } catch {
      setSaveStatus("error");
    }
  }

  function restoreSavedStandard() {
    try {
      const saved = window.localStorage.getItem(TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY);
      setLayout(saved ? normalizeTouchlineCoachCardLayout(JSON.parse(saved)) : TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT);
    } catch {
      setLayout(TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_50%_12%,rgba(255,210,84,.14),transparent_27%),linear-gradient(145deg,#060604,#010202_55%,#0b0903)] px-4 py-8 text-white sm:px-6">
      <header className="mx-auto max-w-7xl border-b border-amber-200/15 pb-6">
        <p className="text-[10px] font-black uppercase tracking-[.22em] text-amber-200">TouchLine · Card Mestre do treinador</p>
        <h1 className="mt-2 text-4xl font-black tracking-[-.045em] sm:text-5xl">Editor visual</h1>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/55">
          Arraste os blocos diretamente no card. O treinador usa as mesmas sete categorias dos jogadores, começa em Rubi Vermelho (Ruby Red) e veste a camisa do clube. As letras de destaque permanecem no verde TouchLine em todas as cores.
        </p>
      </header>

      <div className="mx-auto mt-7 grid max-w-7xl gap-7 xl:grid-cols-[minmax(330px,460px)_1fr] xl:items-start">
        <section className="xl:sticky xl:top-6">
          <div className="mb-3 rounded-xl border border-amber-200/25 bg-amber-300/8 px-4 py-3 text-center text-[10px] font-black uppercase tracking-[.12em] text-amber-100">
            Editor simples · arraste os dois blocos dentro do card
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Categorias oficiais do card de treinador">
            {TOUCHLINE_CARD_TIER_KEYS.map((tierKey) => (
              <button
                key={tierKey}
                type="button"
                data-coach-tier-preview={tierKey}
                aria-pressed={previewTier === tierKey}
                className={`rounded-lg border px-2 py-2 text-[9px] font-black uppercase tracking-[.08em] transition ${
                  previewTier === tierKey
                    ? "border-lime-300/75 bg-lime-300/14 text-lime-100 shadow-[0_0_20px_rgba(168,255,56,.16)]"
                    : "border-white/10 bg-white/[.035] text-white/55 hover:border-white/24 hover:text-white/80"
                }`}
                onClick={() => setPreviewTier(tierKey)}
              >
                {touchlineCardTierName(tierKey, "pt-BR")}
              </button>
            ))}
          </div>
          <div className="mx-auto w-full max-w-[460px] rounded-[34px] border border-amber-200/15 bg-black/45 p-7 shadow-[0_0_80px_rgba(255,202,64,.13)] backdrop-blur-xl">
            <TouchlineCoachCard
              coach={previewCoach}
              slot={slot}
              clubName={clubName || club.name}
              clubLogoUrl={club.logoUrl}
              clubAccent={shirtColor}
              countryCode3={countryCode || "ITA"}
              locale="pt-BR"
              editable
              editableLayers={["nameplate", "stats"]}
              layoutOverride={layout}
              onLayoutChange={setLayout}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" className="rounded-xl border border-white/12 bg-white/6 px-4 py-3 text-xs font-black text-white/72 hover:bg-white/10" onClick={restoreSavedStandard}>
              Desfazer alterações
            </button>
            <button type="button" className="rounded-xl border border-amber-200/45 bg-amber-300/16 px-4 py-3 text-xs font-black text-amber-100 shadow-[0_0_24px_rgba(255,202,64,.12)] hover:bg-amber-300/24" onClick={saveAsMaster} disabled={saveStatus === "saving"}>
              {saveStatus === "saving" ? "Salvando..." : saveStatus === "saved" ? "Padrão salvo" : saveStatus === "error" ? "Erro ao salvar" : "Salvar como padrão"}
            </button>
          </div>
        </section>

        <section className="grid gap-5">
          <div className="rounded-[26px] border border-white/10 bg-white/[.045] p-5 backdrop-blur-xl">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-amber-200">Blocos editáveis</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/58">
              Clique, segure e arraste cada grupo. O movimento fica limitado à área segura acima da pedra inferior.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/8 bg-black/20 p-4">
                <strong className="text-xs font-black text-white">1. Nome + clube</strong>
                <p className="mt-1 text-xs font-semibold leading-5 text-white/45">Os dois textos se movem juntos.</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 p-4">
                <strong className="text-xs font-black text-white">2. Dados técnicos</strong>
                <p className="mt-1 text-xs font-semibold leading-5 text-white/45">Resultado, cartões e TL Points se movem juntos.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
