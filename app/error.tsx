"use client";

import { useSyncExternalStore } from "react";
import { normalizeTouchLineLocale, type TouchLineLocale } from "@/lib/touchlineArena/i18n";

type TouchlineErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const COPY: Partial<Record<TouchLineLocale, { eyebrow: string; title: string; body: string; retry: string; arena: string }>> = {
  "pt-BR": {
    eyebrow: "TouchLine · estado seguro",
    title: "Não foi possível abrir esta área agora.",
    body: "Nenhum dado do seu clube foi alterado. Você pode tentar novamente ou voltar para a Arena.",
    retry: "Tentar novamente",
    arena: "Voltar à Arena",
  },
  "en-GB": {
    eyebrow: "TouchLine · safe state",
    title: "This area could not be opened right now.",
    body: "No club data has been changed. Try again or return to the Arena.",
    retry: "Try again",
    arena: "Return to Arena",
  },
};

export default function TouchlineErrorBoundary({ error: _error, reset }: TouchlineErrorBoundaryProps) {
  const locale = useSyncExternalStore(
    () => () => {},
    () => normalizeTouchLineLocale(new URLSearchParams(window.location.search).get("lang")),
    () => "en-GB" as TouchLineLocale,
  );

  const copy = COPY[locale] ?? COPY["en-GB"]!;
  const arenaHref = `/arena?lang=${locale}`;

  return (
    <main className="min-h-[100dvh] bg-[#040706] px-5 py-[max(32px,env(safe-area-inset-top))] text-white">
      <section className="mx-auto grid min-h-[calc(100dvh-64px)] max-w-xl place-items-center text-center">
        <div className="w-full rounded-[28px] border border-cyan-300/25 bg-[#07110b] p-7 shadow-[0_24px_80px_rgba(0,0,0,.45)] sm:p-10">
          <p className="text-[10px] font-black uppercase tracking-[.24em] text-cyan-200">{copy.eyebrow}</p>
          <h1 className="mt-4 text-3xl font-black tracking-[-.04em] sm:text-4xl">{copy.title}</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-white/70">{copy.body}</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => reset()}
              className="min-h-11 rounded-xl bg-[#a3ff12] px-5 text-sm font-black text-[#07110b] transition hover:brightness-105"
            >
              {copy.retry}
            </button>
            <a
              href={arenaHref}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-5 text-sm font-black text-white transition hover:border-cyan-200/60"
            >
              {copy.arena}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
