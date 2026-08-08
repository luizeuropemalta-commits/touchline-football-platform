import Link from "next/link";
import { CalendarClock, CircleAlert, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { notFound } from "next/navigation";

import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import { touchLineAuthEntryHref } from "@/lib/touchlineArena/auth-i18n";
import { touchlineClubOwnerSelfHref } from "@/lib/touchlineArena/club-owner-routes";
import {
  normalizeTouchlineClubOwnerSlug,
  touchlineClubOwnerSlugForUser,
} from "@/lib/touchlineArena/club-owner-page-identity";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";
import { readTouchlineRenewalCenter, type TouchlineRenewalCenterServerItem } from "@/lib/touchlineArena/renewal-center-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import styles from "./ClubOwnerRenewalCenterRenderer.module.css";

type Copy = {
  title: string;
  description: string;
  secure: string;
  state: string;
  signedOutTitle: string;
  signedOutCopy: string;
  signIn: string;
  unavailableTitle: string;
  unavailableCopy: string;
  noQuotesTitle: string;
  noQuotesCopy: string;
  contract: string;
  ready: string;
  pending: string;
  locked: string;
  price: string;
  total: string;
  readyCount: string;
  pendingCount: string;
  lockedCount: string;
  footnote: string;
};

function renewalCopy(locale: string): Copy {
  if (locale === "pt-BR") {
    return {
      title: "Central de Renovações",
      description: "Consulte contratos elegíveis e cotações oficiais da próxima temporada. Nenhuma renovação é criada nesta tela.",
      secure: "Leitura protegida pelo servidor",
      state: "Sem checkout ativo",
      signedOutTitle: "Entre para consultar suas renovações",
      signedOutCopy: "A Central mostra somente os contratos do ClubOwner autenticado. Nenhum dado de outro clube é exposto.",
      signIn: "Entrar na TouchLine",
      unavailableTitle: "Dados de renovação ainda indisponíveis",
      unavailableCopy: "A fonte server-side ainda não confirmou cotações para este ambiente. O sistema não mostra valores estimados nem cria contratos automaticamente.",
      noQuotesTitle: "Nenhuma cotação aberta para este elenco",
      noQuotesCopy: "Quando a janela oficial abrir e os valores forem confirmados pelo servidor, as opções elegíveis aparecerão aqui.",
      contract: "Contrato sazonal",
      ready: "Cotação disponível",
      pending: "Valor em validação",
      locked: "Renovação indisponível",
      price: "Preço da próxima temporada",
      total: "Contratos analisados",
      readyCount: "cotações disponíveis",
      pendingCount: "em validação",
      lockedCount: "não elegíveis / encerradas",
      footnote: "Preços, elegibilidade e estados vêm exclusivamente do servidor. A contratação será liberada somente após a decisão comercial e a transação segura serem aprovadas.",
    };
  }
  return {
    title: "Renewal Centre",
    description: "Review eligible contracts and official next-season quotes. This screen does not create a renewal.",
    secure: "Server-protected read",
    state: "No checkout active",
    signedOutTitle: "Sign in to view your renewals",
    signedOutCopy: "The centre shows only the authenticated ClubOwner's contracts. No other club's data is exposed.",
    signIn: "Sign in to TouchLine",
    unavailableTitle: "Renewal data is not available yet",
    unavailableCopy: "The server-side source has not confirmed quotes for this environment. The system shows no estimates and never creates contracts automatically.",
    noQuotesTitle: "No open quotes for this squad",
    noQuotesCopy: "Eligible options will appear here when the official window opens and values are confirmed by the server.",
    contract: "Season contract",
    ready: "Quote available",
    pending: "Value validating",
    locked: "Renewal unavailable",
    price: "Next-season price",
    total: "Contracts reviewed",
    readyCount: "quotes available",
    pendingCount: "validating",
    lockedCount: "ineligible / closed",
    footnote: "Prices, eligibility and states come exclusively from the server. Contracting will be enabled only after the commercial decision and secure transaction are approved.",
  };
}

function statusFor(item: TouchlineRenewalCenterServerItem, copy: Copy) {
  if (item.quoteStatus === "READY" && item.priceTc !== null) {
    return { label: copy.ready, className: styles.status };
  }
  if (item.quoteStatus === "MARKET_VALUE_PENDING") {
    return { label: copy.pending, className: `${styles.status} ${styles.statusPending}` };
  }
  return { label: copy.locked, className: `${styles.status} ${styles.statusLocked}` };
}

export type ClubOwnerRenewalSearchParams = Promise<{ lang?: string }>;

export default async function ClubOwnerRenewalCenterRenderer({
  ownerSlug,
  searchParams,
}: {
  ownerSlug: string;
  searchParams: ClubOwnerRenewalSearchParams;
}) {
  const params = await searchParams;
  const locale = normalizeTouchLineLocale(params.lang);
  const copy = renewalCopy(locale);
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const requestedSlug = normalizeTouchlineClubOwnerSlug(ownerSlug);
  const userSlug = touchlineClubOwnerSlugForUser(user);
  const isOwner = Boolean(user && requestedSlug && requestedSlug === userSlug);

  if (user && !isOwner) notFound();

  const result = isOwner && user ? await (() => {
    const admin = createAdminClient();
    return admin
      ? readTouchlineRenewalCenter(admin, user.id)
      : Promise.resolve({ ok: false as const, error: "TL_RENEWAL_CENTER_QUOTES_UNAVAILABLE" as const });
  })() : null;
  const items = result?.ok ? result.items : [];
  const ready = items.filter((item) => item.quoteStatus === "READY" && item.priceTc !== null).length;
  const pending = items.filter((item) => item.quoteStatus === "MARKET_VALUE_PENDING").length;
  const locked = Math.max(0, items.length - ready - pending);
  const loginHref = touchLineAuthEntryHref(
    "/login",
    locale,
    touchlineClubOwnerSelfHref(locale, "renewals"),
  );

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <TouchlineGlobalNavigation
          locale={locale}
          currentRoute="clubOwnerRenewals"
          surface={isOwner ? "authenticated" : "public"}
        />
        <section className={styles.hero} aria-labelledby="renewal-centre-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><CalendarClock aria-hidden="true" /> TouchLine ClubOwner</span>
            <h1 id="renewal-centre-title">{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
          <div className={styles.heroState}>
            <span>{copy.secure}</span>
            <strong>{copy.state}</strong>
          </div>
        </section>

        {!user ? (
          <section className={styles.empty}>
            <div>
              <LockKeyhole aria-hidden="true" size={30} />
              <h2>{copy.signedOutTitle}</h2>
              <p>{copy.signedOutCopy}</p>
              <Link href={loginHref}>{copy.signIn}</Link>
            </div>
          </section>
        ) : result && !result.ok ? (
          <section className={styles.notice} aria-live="polite">
            <CircleAlert aria-hidden="true" />
            <div><strong>{copy.unavailableTitle}</strong><span>{copy.unavailableCopy}</span></div>
          </section>
        ) : (
          <>
            <section className={styles.summary} aria-label={copy.title}>
              <article className={styles.metric}><span>{copy.total}</span><strong>{items.length}</strong><small>{copy.contract}</small></article>
              <article className={styles.metric}><span>{copy.ready}</span><strong>{ready}</strong><small>{copy.readyCount}</small></article>
              <article className={styles.metric}><span>{copy.pending}</span><strong>{pending}</strong><small>{copy.pendingCount}</small></article>
              <article className={styles.metric}><span>{copy.locked}</span><strong>{locked}</strong><small>{copy.lockedCount}</small></article>
            </section>
            <section className={styles.panel} aria-labelledby="renewal-contracts-title">
              <header className={styles.panelHead}>
                <div><h2 id="renewal-contracts-title">{copy.total}</h2><p>{copy.description}</p></div>
              </header>
              {items.length === 0 ? (
                <div className={styles.empty}>
                  <div><ShieldCheck aria-hidden="true" size={30} /><h2>{copy.noQuotesTitle}</h2><p>{copy.noQuotesCopy}</p></div>
                </div>
              ) : (
                <div className={styles.list}>
                  {items.map((item) => {
                    const status = statusFor(item, copy);
                    return <article className={styles.item} key={item.quoteId}>
                      <div className={styles.player}><strong>{item.playerName}</strong><span>{item.position ?? copy.contract}</span></div>
                      <div className={styles.price}><span>{copy.price}</span><strong>{item.priceTc === null ? "—" : `${item.priceTc} TC`}</strong></div>
                      <span className={status.className}>{status.label}</span>
                    </article>;
                  })}
                </div>
              )}
            </section>
          </>
        )}
        <p className={styles.footnote}><WalletCards aria-hidden="true" /> {copy.footnote}</p>
      </div>
    </main>
  );
}
