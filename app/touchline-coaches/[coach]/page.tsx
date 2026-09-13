/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import TouchlineCoachPerformance from "@/components/touchline/cards/TouchlineCoachPerformance";
import TouchlineLivePresentationRefresh from "@/components/touchline/TouchlineLivePresentationRefresh";
import { CalendarDays, Flag, Gem, House, PlaneTakeoff, ShieldCheck, Trophy } from "lucide-react";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import { createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
import { touchlineCardTierName } from "@/lib/touchlineArena/card-rules";
import {
  touchlineCoachClassificationForProviderId,
  TOUCHLINE_LIVE_COACHES,
} from "@/lib/touchlineArena/live-coaches";
import { normalizeTouchLineLocale } from "@/lib/touchlineArena/i18n";

const TOUCHLINE_ENGLAND_SEASON = "2026-27";

function coachSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function coachReason(reason: string, pt: boolean) {
  const labels: Record<string, string> = pt ? {
    "elite-final-position": "Posição final em liga de elite",
    "elite-relegation-free": "Posição final em liga de elite",
    promoted: "Clube promovido",
    newcomer: "Sem temporada sénior completa confirmada",
    "non-elite-fallback": "Histórico fora das ligas de elite iniciais",
    "classification-pending": "Histórico em validação",
  } : {
    "elite-final-position": "Elite-league final position",
    "elite-relegation-free": "Elite-league final position",
    promoted: "Promoted club",
    newcomer: "No confirmed complete senior season",
    "non-elite-fallback": "History outside the initial elite leagues",
    "classification-pending": "History under verification",
  };
  return labels[reason] ?? (pt ? "Classificação em validação" : "Classification under verification");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ coach: string }>;
}): Promise<Metadata> {
  const { coach } = await params;
  const found = TOUCHLINE_LIVE_COACHES.find(({ coach: candidate }) => (
    candidate.providerId === coach || coachSlug(candidate.displayName) === coachSlug(coach)
  ));
  return {
    title: found ? `${found.coach.displayName} | TouchLine England` : "Coach profile | TouchLine England",
  };
}

export default async function TouchlineCoachProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ coach: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const [{ coach: coachParam }, query] = await Promise.all([params, searchParams]);
  const requestedLocale = Array.isArray(query.lang) ? query.lang[0] : query.lang;
  const locale = normalizeTouchLineLocale(requestedLocale);
  const pt = locale === "pt-BR";
  const entry = TOUCHLINE_LIVE_COACHES.find(({ coach }) => (
    coach.providerId === coachParam || coachSlug(coach.displayName) === coachSlug(coachParam)
  ));
  if (!entry) notFound();

  const classification = touchlineCoachClassificationForProviderId(entry.coach.providerId);
  if (!classification) notFound();
  const club = TOUCHLINE_ENGLAND_CLUBS.find((candidate) => candidate.teamId === entry.coach.teamId);
  if (!club) notFound();
  const coachRanking = await loadTouchLineCoachRanking();
  const coachRankingRow = coachRanking.phase === "ranked"
    ? coachRanking.rows.find((candidate) => candidate.coachProviderId === entry.coach.providerId) ?? null
    : null;
  const competition = coachRankingRow && coachRanking.snapshotId && coachRanking.seasonId && coachRanking.scoringVersion
    ? {
      snapshotId: coachRanking.snapshotId,
      seasonId: coachRanking.seasonId,
      seasonLabel: TOUCHLINE_ENGLAND_SEASON,
      rank: coachRankingRow.rank,
      scoringVersion: coachRanking.scoringVersion,
      home: coachRankingRow.home,
      away: coachRankingRow.away,
      totalTouchlinePoints: coachRankingRow.touchlinePoints,
    }
    : null;
  const slot = createTouchlineArenaCoachSlot(entry.coach, null, classification.tierKey);
  const scoredSlot = competition ? {
    ...slot,
    touchlinePoints: competition.totalTouchlinePoints,
    status: "audited" as const,
    scoreEvidence: {
      provider: "sportmonks" as const,
      providerEventIds: [...coachRanking.fixtureIds],
      scoringVersion: competition.scoringVersion,
    },
  } : slot;
  const matchesPlayed = competition
    ? competition.home.wins + competition.home.draws + competition.home.losses
      + competition.away.wins + competition.away.draws + competition.away.losses
    : null;
  const profileLocale = `?lang=${encodeURIComponent(locale)}`;
  const historyAvailable = Boolean(
    classification.sourceClub
    || classification.sourceLeagueName
    || classification.sourceSeasonId
    || classification.finalPosition !== null,
  );
  const campaign = competition ? [
    { key: "home", icon: House, label: pt ? "Campanha em casa" : "Home campaign", record: competition.home },
    { key: "away", icon: PlaneTakeoff, label: pt ? "Campanha fora" : "Away campaign", record: competition.away },
  ] : [];

  return (
    <main className="coach-profile-page">
      <TouchlineLivePresentationRefresh
        initialCoachRankingSnapshotId={coachRanking.snapshotId}
      />
      <nav className="coach-profile-nav" aria-label={pt ? "Navegação do perfil" : "Profile navigation"}>
        <Link href={`/touchline-clubs/${club.slug}${profileLocale}`}>← {pt ? "Clube" : "Club"}</Link>
        <Link href={`/live${profileLocale}`}>{pt ? "Match Centre" : "Match Centre"}</Link>
        <Link href={`/market-transfer${profileLocale}`}>{pt ? "Mercado" : "Market"}</Link>
      </nav>
      <section className="coach-profile-hero">
        <div className="coach-profile-copy">
          <span>{pt ? "FUTEBOL REAL · TREINADOR" : "REAL FOOTBALL · COACH"}</span>
          <h1>{entry.coach.displayName}</h1>
          <p>{entry.coach.nationality} · {club.name}</p>
          <dl className="coach-profile-identity-grid">
            <div><dt>{pt ? "Clube atual" : "Current club"}</dt><dd>{club.name}</dd></div>
            <div><dt>{pt ? "Nacionalidade" : "Nationality"}</dt><dd>{entry.coach.nationality ?? "—"}</dd></div>
            <div><dt>{pt ? "Verificação" : "Verification"}</dt><dd>{pt ? "TouchLine Verified" : "Verified by TouchLine"}</dd></div>
          </dl>
        </div>
        <div className="coach-profile-card"><TouchlineCoachCard
          coach={entry.coach}
          slot={scoredSlot}
          clubName={club.name}
          clubLogoUrl={club.logoUrl}
          clubAccent={club.accent}
          countryCode3={entry.countryCode3}
          locale={locale}
          forceNeonActive
          enableInteractiveNeon={false}
          showLeadershipCrown={coachRankingRow?.rank === 1}
        /></div>
      </section>
      <section className="coach-profile-grid">
        <article className="coach-profile-game-card">
          <span>{pt ? "TOUCHLINE GAME" : "TOUCHLINE GAME"}</span>
          <h2>{pt ? "Desempenho da temporada" : "Season performance"}</h2>
          <div className="coach-profile-offer-grid">
            <div><Gem aria-hidden="true" /><span><small>Tier</small><strong>{touchlineCardTierName(classification.tierKey, locale)}</strong></span></div>
            <div><ShieldCheck aria-hidden="true" /><span><small>{pt ? "Temporada" : "Season"}</small><strong>{competition?.seasonLabel ?? TOUCHLINE_ENGLAND_SEASON}</strong></span></div>
            <div><Trophy aria-hidden="true" /><span><small>{pt ? "Ranking atual" : "Current rank"}</small><strong>{competition ? `#${competition.rank}` : "—"}</strong></span></div>
            <div><CalendarDays aria-hidden="true" /><span><small>{pt ? "Partidas" : "Matches"}</small><strong>{matchesPlayed ?? "—"}</strong></span></div>
          </div>
          <TouchlineCoachPerformance contract={null} competition={competition} locale={locale} />
          <p>{pt ? "Vitórias, empates, derrotas e pontos vêm da classificação canônica da competição e são os mesmos para todos os cards deste treinador." : "Wins, draws, losses and points come from the canonical competition standings and remain identical on every card for this coach."}</p>
          <p>{pt ? `Classificação: ${coachReason(classification.classificationReason, pt)}. O tier fica fixo durante a temporada.` : `Classification: ${coachReason(classification.classificationReason, pt)}. The tier stays fixed through the season.`}</p>
        </article>
        <article className="coach-profile-facts">
          <span>{pt ? "PERFIL OFICIAL" : "OFFICIAL PROFILE"}</span>
          <h2>{pt ? "Contexto do treinador" : "Coach context"}</h2>
          <div className="coach-profile-club">
            {club.logoUrl ? <img src={club.logoUrl} alt="" /> : <Flag aria-hidden="true" />}
            <div><small>{pt ? "CLUBE ATUAL" : "CURRENT CLUB"}</small><strong>{club.name}</strong></div>
          </div>
          <dl className="coach-profile-fact-grid">
            <div><dt>{pt ? "Nacionalidade" : "Nationality"}</dt><dd>{entry.coach.nationality ?? "—"}</dd></div>
            <div><dt>{pt ? "Temporada" : "Season"}</dt><dd>{competition?.seasonLabel ?? TOUCHLINE_ENGLAND_SEASON}</dd></div>
            <div><dt>{pt ? "Partidas" : "Matches"}</dt><dd>{matchesPlayed ?? "—"}</dd></div>
            <div><dt>{pt ? "Tier" : "Tier"}</dt><dd>{touchlineCardTierName(classification.tierKey, locale)}</dd></div>
          </dl>
          {campaign.length ? <section className="coach-profile-campaign" aria-label={pt ? "Campanha da temporada" : "Season campaign"}>
            <header><span>{pt ? "FORMA DA TEMPORADA" : "SEASON FORM"}</span><strong>{pt ? "Casa e fora" : "Home and away"}</strong></header>
            <div>{campaign.map(({ key, icon: Icon, label, record }) => <article key={key}>
              <Icon aria-hidden="true" />
              <span><small>{label}</small><strong>{record.wins}W · {record.draws}D · {record.losses}L</strong></span>
            </article>)}</div>
          </section> : null}
          {historyAvailable ? (
            <dl className="coach-profile-history-grid">
              <div><dt>{pt ? "Clube anterior" : "Previous club"}</dt><dd>{classification.sourceClub ?? "—"}</dd></div>
              <div><dt>{pt ? "Liga anterior" : "Previous league"}</dt><dd>{classification.sourceLeagueName ?? "—"}</dd></div>
              <div><dt>{pt ? "Posição final" : "Final position"}</dt><dd>{classification.finalPosition === null ? "—" : `#${classification.finalPosition}`}</dd></div>
            </dl>
          ) : <p className="coach-profile-pending">{pt ? "O histórico de clubes e ligas ainda não foi confirmado pela fonte oficial. A TouchLine mantém a classificação pendente em vez de inventar dados." : "Club and league history has not yet been confirmed by the official source. TouchLine keeps the classification pending instead of inventing data."}</p>}
        </article>
      </section>
      <style>{`
        .coach-profile-page { min-height: 100dvh; padding: clamp(18px,4vw,64px); color:#efffd5; background:radial-gradient(circle at 82% 10%,rgba(181,255,75,.13),transparent 32%),linear-gradient(145deg,#020708,#07140f); }
        .coach-profile-nav { display:flex; flex-wrap:wrap; gap:10px; max-width:1180px; margin:0 auto 24px; }
        .coach-profile-nav a { display:inline-flex; min-height:44px; align-items:center; border:1px solid rgba(181,255,75,.28); border-radius:999px; padding:0 13px; color:#efffd5; font-size:12px; font-weight:800; text-decoration:none; }
        .coach-profile-hero,.coach-profile-grid { max-width:1180px; margin:0 auto; display:grid; gap:clamp(22px,4vw,56px); grid-template-columns:minmax(0,1.15fr) minmax(260px,.85fr); align-items:center; }
        .coach-profile-copy > span,.coach-profile-grid article > span { color:#b5ff4b; font-size:10px; font-weight:950; letter-spacing:.13em; }
        .coach-profile-copy h1 { margin:9px 0 5px; font-size:clamp(38px,7vw,82px); line-height:.93; letter-spacing:-.065em; }
        .coach-profile-copy p { margin:0; color:rgba(239,255,213,.72); font-size:16px; }
        .coach-profile-copy dl,.coach-profile-grid dl { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin:30px 0 0; }
        .coach-profile-grid { margin-top:clamp(30px,6vw,72px); grid-template-columns:minmax(0,1.28fr) minmax(300px,.72fr); align-items:stretch; }
        .coach-profile-grid article { border:1px solid rgba(181,255,75,.18); border-radius:24px; padding:clamp(20px,3vw,34px); background:rgba(3,15,12,.72); }
        .coach-profile-game-card { display:grid; align-content:start; gap:18px; }
        .coach-profile-grid h2 { margin:8px 0 4px; font-size:clamp(23px,3vw,36px); letter-spacing:-.04em; }
        .coach-profile-grid p { color:rgba(239,255,213,.7); font-size:14px; line-height:1.55; }
        .coach-profile-grid dl { grid-template-columns:repeat(2,minmax(0,1fr)); margin-top:20px; }
        .coach-profile-page dt { color:rgba(239,255,213,.56); font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
        .coach-profile-page dd { margin:5px 0 0; font-size:14px; font-weight:800; }
        /* Keep the official leader crown fully inside the profile composition
           while leaving its approved art and frame clearance untouched. */
        .coach-profile-card { width:min(100%,410px); justify-self:center; padding-top:128px; box-sizing:border-box; overflow:visible; }
        .coach-profile-offer-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
        .coach-profile-offer-grid > div { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:10px; border:1px solid rgba(181,255,75,.13); border-radius:14px; padding:12px; background:rgba(0,0,0,.2); }
        .coach-profile-offer-grid svg { width:21px; height:21px; color:#b5ff4b; }
        .coach-profile-offer-grid span,.coach-profile-offer-grid small,.coach-profile-offer-grid strong { display:block; }
        .coach-profile-offer-grid small { color:rgba(239,255,213,.55); font-size:9px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
        .coach-profile-offer-grid strong { margin-top:3px; color:white; font-size:13px; }
        .coach-profile-facts { display:grid; align-content:start; gap:16px; }
        .coach-profile-club { display:flex; align-items:center; gap:12px; min-width:0; border:1px solid rgba(181,255,75,.17); border-radius:16px; padding:12px; background:linear-gradient(135deg,rgba(181,255,75,.08),rgba(0,0,0,.16)); }
        .coach-profile-club img,.coach-profile-club > svg { width:48px; height:48px; flex:0 0 auto; object-fit:contain; filter:drop-shadow(0 0 12px color-mix(in srgb,${club.accent} 55%,transparent)); }
        .coach-profile-club small,.coach-profile-club strong { display:block; }
        .coach-profile-club small,.coach-profile-campaign header span { color:rgba(229,255,203,.56); font-size:9px; font-weight:900; letter-spacing:.11em; }
        .coach-profile-club strong { margin-top:3px; color:#fff; font-size:16px; }
        .coach-profile-fact-grid { margin:0 !important; }
        .coach-profile-fact-grid > div,.coach-profile-history-grid > div { border-top:1px solid rgba(255,255,255,.08); padding-top:9px; }
        .coach-profile-campaign { display:grid; gap:9px; border-top:1px solid rgba(181,255,75,.16); padding-top:15px; }
        .coach-profile-campaign header span,.coach-profile-campaign header strong { display:block; }
        .coach-profile-campaign header strong { margin-top:3px; color:#fff; font-size:14px; }
        .coach-profile-campaign > div { display:grid; gap:8px; }
        .coach-profile-campaign article { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:9px; border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:10px; background:rgba(0,0,0,.16); }
        .coach-profile-campaign article svg { color:#b5ff4b; width:18px; height:18px; }
        .coach-profile-campaign small,.coach-profile-campaign strong { display:block; }
        .coach-profile-campaign small { color:rgba(239,255,213,.56); font-size:9px; font-weight:800; }
        .coach-profile-campaign strong { margin-top:2px; color:#fff; font-size:12px; }
        .coach-profile-history-grid { margin-top:0 !important; }
        .coach-profile-pending { margin:0; border:1px dashed rgba(255,255,255,.15); border-radius:12px; padding:11px; font-size:12px !important; }
        @media (max-width:760px) { .coach-profile-hero,.coach-profile-grid { grid-template-columns:1fr; } .coach-profile-card { order:-1; width:min(100%,330px); padding-top:98px; } .coach-profile-copy dl { grid-template-columns:1fr; } }
      `}</style>
    </main>
  );
}
