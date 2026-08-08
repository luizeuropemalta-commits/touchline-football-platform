import Link from "next/link";
import { Archive, CircleAlert, LockKeyhole, ShieldCheck, Trophy } from "lucide-react";
import { notFound } from "next/navigation";

import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import { touchLineAuthEntryHref } from "@/lib/touchlineArena/auth-i18n";
import { touchlineClubOwnerSelfHref } from "@/lib/touchlineArena/club-owner-routes";
import { normalizeTouchlineClubOwnerSlug, touchlineClubOwnerSlugForUser } from "@/lib/touchlineArena/club-owner-page-identity";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import { readTouchlinePostSeasonHistory } from "@/lib/touchlineArena/post-season-history-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import styles from "./ClubOwnerRenewalCenterRenderer.module.css";

export type ClubOwnerSeasonHistorySearchParams = Promise<{ lang?: string }>;

export default async function ClubOwnerSeasonHistoryRenderer({
  ownerSlug,
  searchParams,
}: {
  ownerSlug: string;
  searchParams: ClubOwnerSeasonHistorySearchParams;
}) {
  const params = await searchParams;
  const locale = normalizeTouchLineLocale(params.lang);
  const pt = locale === "pt-BR";
  const copy = pt ? {
    title: "Histórico de Temporadas", description: "Resultados oficiais validados e preservados após o encerramento da temporada.",
    signedOut: "Entre para consultar seu histórico", signedOutCopy: "Esta área mostra somente o histórico do ClubOwner autenticado.",
    unavailable: "Histórico indisponível neste ambiente", unavailableCopy: "A fonte server-side ainda não confirmou o esquema de histórico. Nenhum resultado é estimado.",
    empty: "Nenhuma temporada finalizada", emptyCopy: "O histórico aparecerá depois da validação oficial pós-temporada.",
    finalRank: "Posição final", points: "Pontos TouchLine", best: "Melhor posição semanal", updated: "Atualizado", secure: "Leitura protegida pelo servidor", readOnly: "Somente leitura",
  } : {
    title: "Season History", description: "Official validated results retained after the season closes.",
    signedOut: "Sign in to view your history", signedOutCopy: "This area shows only the authenticated ClubOwner's history.",
    unavailable: "History is unavailable in this environment", unavailableCopy: "The server-side source has not confirmed the history schema. No result is estimated.",
    empty: "No completed seasons", emptyCopy: "History will appear after official post-season validation.",
    finalRank: "Final rank", points: "TouchLine Points", best: "Best weekly rank", updated: "Updated", secure: "Server-protected read", readOnly: "Read-only",
  };
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const requestedSlug = normalizeTouchlineClubOwnerSlug(ownerSlug);
  const userSlug = touchlineClubOwnerSlugForUser(user);
  const isOwner = Boolean(user && requestedSlug && requestedSlug === userSlug);
  if (user && !isOwner) notFound();
  const history = isOwner && user ? await (() => {
    const admin = createAdminClient();
    return admin ? readTouchlinePostSeasonHistory(admin, user.id, new Date().toISOString()) : Promise.resolve({ ok: false as const, error: "TL_POSTSEASON_HISTORY_SUMMARIES_UNAVAILABLE" as const });
  })() : null;
  const items = history?.ok ? history.items : [];
  const loginHref = touchLineAuthEntryHref(
    "/login",
    locale,
    touchlineClubOwnerSelfHref(locale, "history"),
  );

  return <main className={styles.page}><div className={styles.shell}>
    <TouchlineGlobalNavigation
      locale={locale}
      currentRoute="clubOwnerHistory"
      surface={isOwner ? "authenticated" : "public"}
    />
    <section className={styles.hero}><div className={styles.heroCopy}><span className={styles.eyebrow}><Archive aria-hidden="true" /> TouchLine ClubOwner</span><h1>{copy.title}</h1><p>{copy.description}</p></div><div className={styles.heroState}><span>{copy.secure}</span><strong>{copy.readOnly}</strong></div></section>
    {!user ? <section className={styles.empty}><div><LockKeyhole aria-hidden="true" size={30} /><h2>{copy.signedOut}</h2><p>{copy.signedOutCopy}</p><Link href={loginHref}>{pt ? "Entrar na TouchLine" : "Sign in to TouchLine"}</Link></div></section> : history && !history.ok ? <section className={styles.notice}><CircleAlert aria-hidden="true" /><div><strong>{copy.unavailable}</strong><span>{copy.unavailableCopy}</span></div></section> : items.length === 0 ? <section className={styles.empty}><div><ShieldCheck aria-hidden="true" size={30} /><h2>{copy.empty}</h2><p>{copy.emptyCopy}</p></div></section> : <section className={styles.panel}><header className={styles.panelHead}><div><h2>{copy.title}</h2><p>{copy.description}</p></div></header><div className={styles.list}>{items.map((item) => <article className={styles.item} key={item.summaryId}><div className={styles.player}><strong>{item.seasonName}</strong><span>{item.summaryState === "FROZEN" ? (pt ? "Histórico congelado" : "Frozen history") : (pt ? "Resultado validado" : "Validated result")}</span></div><div className={styles.price}><span>{copy.finalRank}</span><strong>{item.finalRank === null ? "—" : `#${item.finalRank}`}</strong></div><span className={styles.status}>{item.totalTouchlinePoints === null ? "—" : `${item.totalTouchlinePoints} TL`}</span></article>)}</div></section>}
    <p className={styles.footnote}><Trophy aria-hidden="true" /> {pt ? "Dados oficiais, somente leitura e preservados por temporada." : "Official, read-only and season-preserved data."}</p>
  </div></main>;
}
