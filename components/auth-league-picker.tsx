import Link from "next/link";
import { Globe2 } from "lucide-react";
import { TOUCHLINE_AVAILABLE_LEAGUES, touchlineLeagueEntryHref } from "@/lib/touchlineArena/league-entry";
import navigation from "./touchline/TouchlineGlobalNavigation.module.css";

export function AuthLeaguePicker({ locale }: { locale: string }) {
  const pt = locale === "pt-BR";
  return (
    <details className="my-5 max-w-xl">
      <summary className={navigation.link} style={{ cursor: "pointer", width: "fit-content" }}>
        <Globe2 size={16} aria-hidden="true" />
        {pt ? "Escolher liga" : "Choose league"}
      </summary>
      <div className="mt-3 rounded-2xl border border-white/20 bg-[#030c09] p-4">
        <p className="mb-3 text-sm leading-6 text-slate-200">
          {pt ? "Liga disponível nesta versão. Outras ligas ainda não estão disponíveis." : "League supported in this version. Other leagues are not available yet."}
        </p>
        <nav aria-label={pt ? "Ligas disponíveis" : "Available leagues"} className="flex flex-wrap gap-2">
          {TOUCHLINE_AVAILABLE_LEAGUES.map((league) => {
            const href = touchlineLeagueEntryHref(league.key, locale);
            return href ? <Link key={league.key} href={href} prefetch={false} className={navigation.link}>
              {league.name}
              <span aria-hidden="true">→</span>
            </Link> : null;
          })}
        </nav>
      </div>
    </details>
  );
}
