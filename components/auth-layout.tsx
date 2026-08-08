import Link from "next/link";
import { Check, Globe2, Radio, Trophy, Users, Zap } from "lucide-react";
import { getTouchLineAuthCopy, normalizeTouchLineAuthLocale, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";
import { Logo } from "./logo";
import { AuthCinematicMedia } from "./auth-cinematic-media";
import { AuthLanguageSwitcher } from "./auth-language-switcher";

export function AuthLayout({
  children,
  cinematic = false,
  locale = "en-GB",
}: {
  children: React.ReactNode;
  cinematic?: boolean;
  locale?: string;
}) {
  const normalizedLocale = normalizeTouchLineAuthLocale(locale);
  const copy = getTouchLineAuthCopy(normalizedLocale).layout;
  const publicArenaHref = touchLineAuthHref("/touchline-clubs", normalizedLocale);

  return (
    <main className={`arena-bg console-shell relative min-h-[100dvh] overflow-x-clip bg-[#02050a]${cinematic ? " auth-cinematic" : ""}`}>
      {cinematic ? <AuthCinematicMedia /> : null}
      <div className="stadium-light stadium-light-left" />
      <div className="stadium-light stadium-light-right" />
      <div className="football-orb" />
      <div className="stadium-skyline" />

      <section className="relative z-10 grid min-h-[100dvh] min-w-0 2xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
        <div className="auth-entry-content flex min-h-[100dvh] min-w-0 flex-col">
          <header className="auth-brand-header flex shrink-0 items-center justify-between">
            <Logo href={publicArenaHref} officialArena />
            <div className="flex items-center gap-2">
              <AuthLanguageSwitcher locale={normalizedLocale} />
              <Link href={publicArenaHref} className="console-mini-card hidden items-center gap-2 px-4 py-3 text-[10px] font-black text-cyan-200 transition hover:-translate-y-1 sm:inline-flex">
                <Globe2 size={14}/> {copy.arenaHome}
              </Link>
            </div>
          </header>

          <div className="grid flex-1 content-center gap-6 py-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,430px)] xl:items-center">
            <div className="order-2 min-w-0 max-w-3xl xl:order-1">
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[10px] font-black text-[#b7ff45]"><span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]"/> {copy.arenaOnline}</span>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[10px] font-black text-cyan-100">{copy.productAreas}</span>
              </div>
              <p className="mb-3 text-[11px] font-black text-cyan-100/75">{cinematic ? copy.journeyEyebrow : copy.accessEyebrow}</p>
              <h1 className="console-title font-display text-[clamp(3.5rem,5.5vw,6.8rem)] italic leading-[.82] text-white">
                {cinematic ? copy.cinematicTitleTop : copy.standardTitleTop}
                <br />
                {cinematic ? copy.cinematicTitleBottom : copy.standardTitleBottom}
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-7 text-slate-300/80">
                {cinematic ? copy.cinematicDescription : copy.standardDescription}
              </p>

              <div className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
                <div className="console-mini-card p-4"><Trophy size={18} className="text-amber-300"/><p className="mt-4 text-[10px] font-black text-slate-400">{copy.cardLabel}</p><p className="mt-1 text-xl font-black">{copy.cardValue}</p></div>
                <div className="console-mini-card p-4"><Users size={18} className="text-cyan-300"/><p className="mt-4 text-[10px] font-black text-slate-400">{copy.squadLabel}</p><p className="mt-1 text-xl font-black">{copy.squadValue}</p></div>
                <div className="console-mini-card p-4"><Zap size={18} className="text-[#a3ff12]"/><p className="mt-4 text-[10px] font-black text-slate-400">{copy.arenaLabel}</p><p className="mt-1 text-xl font-black">{copy.arenaValue}</p></div>
              </div>
            </div>

            <div className="premium-ring stadium-scoreboard order-1 w-full max-w-[430px] justify-self-center p-5 sm:p-6 xl:order-2 xl:justify-self-end">
              <div className="relative z-10">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-cyan-200">{cinematic ? copy.onboardingEyebrow : copy.accessPanelEyebrow}</p>
                    <h2 className="mt-1 text-xl font-black italic text-white">{cinematic ? copy.onboardingTitle : copy.accessPanelTitle}</h2>
                  </div>
                  <span className="grid size-12 place-items-center rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 text-[#a3ff12]"><Globe2 size={22}/></span>
                </div>
                {children}
              </div>
            </div>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3">
            <p className="text-[10px] text-slate-500">{copy.rights}</p>
            <div className="hidden items-center gap-2 text-[10px] font-black text-slate-500 sm:flex"><Radio size={12} className="text-[#a3ff12]"/> {copy.marketOnline}</div>
          </footer>
        </div>

        <aside className="ps-career-home relative hidden min-h-[100dvh] border-l border-cyan-100/10 p-8 2xl:block 2xl:p-10">
          <div className="stadium-stands" />
          <div className="pitch-lines" />
          <div className="manager-silhouette" />
          <div className="relative z-10 mt-auto flex h-full flex-col justify-end">
            <p className="text-[11px] font-black text-cyan-200/80">TouchLine Arena</p>
            <h2 className="font-display mt-5 text-6xl  italic leading-[.86] xl:text-7xl">{copy.asideTitleTop}<br/><span className="text-[#a3ff12]">{copy.asideTitleBottom}</span></h2>
            <div className="mt-9 space-y-4">{copy.features.map(x=><div key={x} className="console-mini-card flex items-center gap-3 p-4 text-[10px] font-bold text-slate-300"><span className="grid size-7 place-items-center rounded-lg border border-[#a3ff12]/25 bg-[#a3ff12]/10 text-[#a3ff12]"><Check size={13} strokeWidth={3}/></span>{x}</div>)}</div>
          </div>
        </aside>
      </section>
    </main>
  );
}
