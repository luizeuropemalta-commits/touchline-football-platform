import Link from "next/link";
import { ArrowLeft, DatabaseZap } from "lucide-react";
import { PlayerDatabaseSearch } from "@/components/player-database-search";
import { normalizeTouchLineAuthLocale, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";

export default async function FootballSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const locale = normalizeTouchLineAuthLocale(lang);
  const copy = locale === "pt-BR"
    ? { back: "Voltar à TouchLine Arena", title: "Pesquisa de futebol TouchLine" }
    : { back: "Back to TouchLine Arena", title: "TouchLine football search" };

  return (
    <div className="mx-auto max-w-[1760px] animate-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href={touchLineAuthHref("/arena", locale)} className="inline-flex items-center gap-2 text-[8px] font-black text-slate-600 hover:text-cyan-300">
          <ArrowLeft size={12} />
          {copy.back}
        </Link>
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black text-cyan-100">
          <DatabaseZap size={12} />
          {copy.title}
        </div>
      </div>
      <PlayerDatabaseSearch locale={locale} />
    </div>
  );
}
