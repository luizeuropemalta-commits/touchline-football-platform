"use client";

import { SearchX, Shield } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import TouchlineGlobalNavigation from "./TouchlineGlobalNavigation";

export default function TouchlineNotFound() {
  const searchParams = useSearchParams();
  const locale = normalizeTouchLineLocale(searchParams.get("lang"));
  const pt = locale === "pt-BR";
  const copy = pt ? {
    eyebrow: "Navegação segura",
    title: "Esta área não está disponível",
    description: "O endereço pode ter mudado ou não existir. Nenhum dado do seu clube foi alterado.",
    code: "Erro 404",
  } : {
    eyebrow: "Safe navigation",
    title: "This area is not available",
    description: "The address may have changed or may not exist. No club data was changed.",
    code: "Error 404",
  };

  return (
    <main className="min-h-dvh px-5 py-[max(2rem,env(safe-area-inset-top))] text-[#edf8ff]">
      <section className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-3xl place-items-center">
        <div className="w-full overflow-visible rounded-[2rem] border border-cyan-200/20 bg-[#07131a]/90 p-7 shadow-[0_24px_80px_rgba(0,0,0,.45)] backdrop-blur-xl sm:p-11">
          <div className="mb-7 flex size-14 items-center justify-center rounded-2xl border border-[#a3ff12]/35 bg-[#a3ff12]/10 text-[#b9ff55] shadow-[0_0_32px_rgba(163,255,18,.16)]">
            <SearchX aria-hidden="true" size={28} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-cyan-200"><Shield aria-hidden="true" size={15} /> {copy.eyebrow}</p>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[.13em] text-white/60">{copy.code}</span>
          </div>
          <h1 className="mt-5 max-w-xl text-3xl font-black tracking-[-.04em] sm:text-5xl">{copy.title}</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[#a9bdc9]">{copy.description}</p>
          <TouchlineGlobalNavigation locale={locale} currentRoute="notFound" surface="public" className="mt-8" />
        </div>
      </section>
    </main>
  );
}
