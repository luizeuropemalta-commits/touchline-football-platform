"use client";

import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { clubValueSummary, type ClubValueQuote } from "@/lib/touchlineFantasy/club-value-summary";
import { useConfirmedClubCollection } from "./ClubCollectionContext";
import styles from "./ClubOwnerFinance.module.css";

export default function ClubOwnerValueSummary({ catalogue, locale, draftLocalesEnabled = false }: {
  catalogue: readonly ClubValueQuote[]; locale: string; draftLocalesEnabled?: boolean;
}) {
  const { state, verificationStatus } = useConfirmedClubCollection();
  const language = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const labels = {
    "en-GB": ["Players", "Incomplete valuation", "Missing quotes", "Provisional quotes", "Unavailable", "Current published player values; excludes coach and balance."],
    "pt-BR": ["Jogadores", "Avaliação incompleta", "Valores ausentes", "Valores provisórios", "Indisponível", "Valores atuais publicados dos jogadores; exclui treinador e saldo."],
    "es-ES": ["Jugadores", "Valoración incompleta", "Valores ausentes", "Valores provisionales", "No disponible", "Valores actuales publicados de jugadores; excluye entrenador y saldo."],
    "it-IT": ["Giocatori", "Valutazione incompleta", "Valori mancanti", "Valori provvisori", "Non disponibile", "Valori attuali pubblicati dei giocatori; esclusi allenatore e saldo."],
    "fr-FR": ["Joueurs", "Évaluation incomplète", "Valeurs manquantes", "Valeurs provisoires", "Indisponible", "Valeurs actuelles publiées des joueurs ; hors entraîneur et solde."],
    "ar-SA": ["اللاعبون", "تقييم غير مكتمل", "قيم مفقودة", "قيم مؤقتة", "غير متاح", "القيم الحالية المنشورة للاعبين؛ باستثناء المدرب والرصيد."],
    "tr-TR": ["Oyuncular", "Eksik değerleme", "Eksik değerler", "Geçici değerler", "Kullanılamıyor", "Oyuncuların güncel yayımlanmış değerleri; teknik direktör ve bakiye hariç."],
    "de-DE": ["Spieler", "Unvollständige Bewertung", "Fehlende Werte", "Vorläufige Werte", "Nicht verfügbar", "Aktuell veröffentlichte Spielerwerte; ohne Trainer und Guthaben."],
  }[language];
  const summary = verificationStatus === "confirmed" ? clubValueSummary(state, catalogue) : null;
  const number = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);
  return <div className={styles.valuation} data-club-value-summary="true" role="status" aria-live="polite" aria-atomic="true">
    <dl className={styles.metrics}>
      <div><dt>Club Value</dt><dd>{summary?.value != null ? <>{number(summary.value)} <small>TC</small></> : <span className={styles.unavailable}>{labels[4]}</span>}</dd></div>
      <div><dt>{labels[0]}</dt><dd>{summary ? <>{number(summary.count)}<small> / 35</small></> : "—"}</dd></div>
    </dl>
    {summary?.value === null ? <p className={styles.status}>{`${labels[1]} · ${labels[2]}: ${number(summary.missing)} · ${labels[3]}: ${number(summary.provisional)}`}</p> : null}
    <p className={styles.note}>{labels[5]}</p>
  </div>;
}
