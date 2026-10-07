"use client";

import { useSyncExternalStore } from "react";
import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlinePublicErrorCopy } from "@/lib/touchlineArena/public-error-i18n";

type TouchlineErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function TouchlineErrorBoundary(props: TouchlineErrorBoundaryProps) {
  return <ErrorBoundaryContent error={props.error} reset={props.reset} />;
}

function ErrorBoundaryContent({ error: _error, reset, draftLocalesEnabled = false }: TouchlineErrorBoundaryProps & { draftLocalesEnabled?: boolean }) {
  const locale = useSyncExternalStore(
    () => () => {},
    () => resolveTouchlineCatalogueLocale(new URLSearchParams(window.location.search).get("lang"), draftLocalesEnabled),
    () => "en-GB" as TouchLineLocale,
  );

  const copy = getTouchlinePublicErrorCopy(locale, draftLocalesEnabled).error;
  const arenaHref = `/clubowner?lang=${locale}`;

  return (
    <main dir="ltr" className="min-h-[100dvh] bg-[#040706] px-5 py-[max(32px,env(safe-area-inset-top))] text-white">
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
