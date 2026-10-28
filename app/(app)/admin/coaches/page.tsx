import Link from "next/link";
import { notFound } from "next/navigation";
import { GamePanel } from "@/components/arena-admin-ui";
import { CoachCatalogueEditor } from "@/components/touchline/admin/CoachCatalogueEditor";
import { coachEditorialDependencies } from "@/lib/touchlineArena/coach-editorial-server";
import { parseCoachEditorial } from "@/lib/touchlineArena/coach-catalogue-contract";
import { normalizeTouchLineAuthLocale, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";

export const dynamic = "force-dynamic";
export default async function CoachesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams ?? {}, locale = normalizeTouchLineAuthLocale(typeof params.lang === "string" ? params.lang : null);
  const portuguese = locale === "pt-BR", t = (pt: string, en: string) => portuguese ? pt : en;
  const dependencies = coachEditorialDependencies();
  let actor; try { actor = await dependencies.actor(); } catch { actor = null; }
  if (!actor?.owner || !actor.allowed) notFound();
  let state = null;
  if (dependencies.enabled) try { state = parseCoachEditorial(await dependencies.rpc("touchline_read_coach_editorial")); } catch { /* Fail closed; empty data is not success. */ }
  return <GamePanel className="grid min-w-0 gap-6 p-5 md:p-8">
    <Link href={touchLineAuthHref("/admin", locale)} className="w-fit py-2 text-sm text-slate-300">← {t("Administração", "Administration")}</Link>
    <div><h1 className="break-words text-3xl font-black text-white">{t("Catálogo de técnicos", "Coach catalogue")}</h1><p className="mt-3 text-sm text-slate-300">{t("Identidades oficiais, revisão proprietária e publicação da associação atual.", "Official identities, owner review and publication of current appointments.")}</p></div>
    {!dependencies.enabled ? <p role="status">{t("Catálogo dinâmico desligado. Nenhuma observação ou publicação é executada por esta página.", "Dynamic catalogue disabled. This page does not observe or publish changes.")}</p> : state ? <CoachCatalogueEditor initial={state} portuguese={portuguese} /> : <p role="alert">{t("Catálogo indisponível. Nenhuma alteração foi feita; confira a configuração e tente atualizar.", "Catalogue unavailable. No changes were made; check configuration and refresh.")}</p>}
  </GamePanel>;
}
