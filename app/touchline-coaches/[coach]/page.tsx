/* eslint-disable @next/next/no-img-element */
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import TouchlineCoachPerformance from "@/components/touchline/cards/TouchlineCoachPerformance";
import TouchlineLivePresentationRefresh from "@/components/touchline/TouchlineLivePresentationRefresh";
import TouchlineGlobalNavigation from "@/components/touchline/TouchlineGlobalNavigation";
import TouchlineBrandHeader from "@/components/touchline/TouchlineBrandHeader";
import { loadAccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import navigationStyles from "@/components/touchline/TouchlineGlobalNavigation.module.css";
import { CalendarDays, Flag, Gem, House, PlaneTakeoff, ShieldCheck, Trophy } from "lucide-react";
import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import { createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { loadTouchLineCoachRanking } from "@/lib/touchlineArena/coach-ranking-server";
import { coachCompetitionFromRanking } from "@/lib/touchlineArena/coach-competition-projection";
import { localizedCountryLabel } from "@/lib/touchlineArena/country-labels";
import { touchlineCardTierName } from "@/lib/touchlineArena/card-rules";
import {
  touchlineCoachClassificationForProviderId,
  TOUCHLINE_LIVE_COACHES,
} from "@/lib/touchlineArena/live-coaches";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlineCoachProfileCopy, getTouchlineCoachProfileReason } from "@/lib/touchlineArena/coach-profile-i18n";
import { getTouchlineCoachCardCopy } from "@/lib/touchlineArena/coach-card-i18n";
import { getTouchlineMatchCentreCopy } from "@/lib/touchlineArena/match-centre-i18n";
import { getTouchlineTablesPresentationCopy } from "@/lib/touchlineArena/tables-presentation-i18n";

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

type CoachProfileMetadataProps = {
  params: Promise<{ coach: string }>;
  searchParams?: Promise<{ lang?: string | string[] }>;
};

export async function generateMetadata(props: CoachProfileMetadataProps): Promise<Metadata> {
  return generateCoachProfileMetadata(props, isTouchLineSiteLocalesEnabled("/touchline-coaches/[coach]"));
}

async function generateCoachProfileMetadata({
  params,
  searchParams,
}: CoachProfileMetadataProps, draftLocalesEnabled = false): Promise<Metadata> {
  const [{ coach }, query] = await Promise.all([params, searchParams]);
  const requestedLocale = Array.isArray(query?.lang) ? query.lang[0] : query?.lang;
  const copy = getTouchlineCoachProfileCopy(resolveTouchlineCatalogueLocale(requestedLocale, draftLocalesEnabled), draftLocalesEnabled);
  const found = TOUCHLINE_LIVE_COACHES.find(({ coach: candidate }) => (
    candidate.providerId === coach || coachSlug(candidate.displayName) === coachSlug(coach)
  ));
  return {
    title: found ? `${found.coach.displayName} | TouchLine England` : copy.metadataFallback,
  };
}

type CoachProfilePageProps = {
  params: Promise<{ coach: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
};

export default async function TouchlineCoachProfilePage(props: CoachProfilePageProps) {
  return renderCoachProfilePage(props, isTouchLineSiteLocalesEnabled("/touchline-coaches/[coach]"));
}

async function renderCoachProfilePage({
  params,
  searchParams,
}: CoachProfilePageProps, draftLocalesEnabled = false) {
  const [{ coach: coachParam }, query] = await Promise.all([params, searchParams]);
  const requestedLocale = Array.isArray(query.lang) ? query.lang[0] : query.lang;
  const locale = resolveTouchlineCatalogueLocale(requestedLocale, draftLocalesEnabled);
  const copy = getTouchlineCoachProfileCopy(locale, draftLocalesEnabled);
  const cardCopy = getTouchlineCoachCardCopy(locale, draftLocalesEnabled);
  const matchCopy = getTouchlineMatchCentreCopy(locale, draftLocalesEnabled);
  const recordCopy = getTouchlineTablesPresentationCopy(locale, draftLocalesEnabled);
  const entry = TOUCHLINE_LIVE_COACHES.find(({ coach }) => (
    coach.providerId === coachParam || coachSlug(coach.displayName) === coachSlug(coachParam)
  ));
  if (!entry) notFound();
  const nationalityLabel = localizedCountryLabel(entry.coach.nationality, locale, draftLocalesEnabled) ?? "—";

  const classification = touchlineCoachClassificationForProviderId(entry.coach.providerId);
  if (!classification) notFound();
  const club = TOUCHLINE_ENGLAND_CLUBS.find((candidate) => candidate.teamId === entry.coach.teamId);
  if (!club) notFound();
  const [coachRanking, accountLocaleContext] = await Promise.all([
    loadTouchLineCoachRanking(), loadAccountLocaleContext(),
  ]);
  const competition = coachCompetitionFromRanking(coachRanking, entry.coach.providerId, TOUCHLINE_ENGLAND_SEASON);
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
    { key: "home", icon: House, label: copy.homeCampaign, record: competition.home },
    { key: "away", icon: PlaneTakeoff, label: copy.awayCampaign, record: competition.away },
  ] : [];

  return (
    <main className="coach-profile-page" dir="ltr">
      <TouchlineBrandHeader href={`/touchline-coaches/${encodeURIComponent(entry.coach.providerId)}${profileLocale}`} locale={locale} accountLocaleContext={accountLocaleContext} draftLocalesEnabled={draftLocalesEnabled} />
      <div className="coach-profile-content">
      <TouchlineLivePresentationRefresh
        initialCoachRankingSnapshotId={coachRanking.snapshotId}
      />
      <div className="coach-profile-nav">
        <TouchlineGlobalNavigation locale={locale} draftLocalesEnabled={draftLocalesEnabled} currentRoute="coachProfile" surface="public" showAudioControl={false} />
        <Link className={navigationStyles.link} href={`/touchline-clubs/${club.slug}${profileLocale}`}>← {club.name}</Link>
      </div>
      <div className="coach-profile-composition">
      <section className="coach-profile-hero">
        <div className="coach-profile-copy">
          <span>{copy.heroEyebrow}</span>
          <h1>{entry.coach.displayName}</h1>
          <p>{nationalityLabel} · {club.name}</p>
          <dl className="coach-profile-identity-grid">
            <div><dt>{cardCopy.currentClub}</dt><dd>{club.name}</dd></div>
            <div><dt>{cardCopy.nationality}</dt><dd>{nationalityLabel}</dd></div>
            <div><dt>{copy.verification}</dt><dd>{copy.verifiedBy}</dd></div>
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
          draftLocalesEnabled={draftLocalesEnabled}
          forceNeonActive
          enableInteractiveNeon={false}
          showLeadershipCrown={competition?.rank === 1}
        /></div>
      </section>
      <section className="coach-profile-grid">
        <article className="coach-profile-game-card">
          <span>TOUCHLINE GAME</span>
          <h2>{copy.performance}</h2>
          <div className="coach-profile-offer-grid">
            <div><Gem aria-hidden="true" /><span><small>{copy.tier}</small><strong>{touchlineCardTierName(classification.tierKey, locale, draftLocalesEnabled)}</strong></span></div>
            <div><ShieldCheck aria-hidden="true" /><span><small>{matchCopy.season}</small><strong>{competition?.seasonLabel ?? TOUCHLINE_ENGLAND_SEASON}</strong></span></div>
            <div><Trophy aria-hidden="true" /><span><small>{copy.currentRank}</small><strong>{competition ? `#${competition.rank}` : "—"}</strong></span></div>
            <div><CalendarDays aria-hidden="true" /><span><small>{copy.matches}</small><strong>{matchesPlayed ?? "—"}</strong></span></div>
          </div>
          <TouchlineCoachPerformance contract={null} competition={competition} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
          <p>{copy.competitionExplanation}</p>
          <p>{copy.classificationDescription.replace("{reason}", () => getTouchlineCoachProfileReason(classification.classificationReason, locale, draftLocalesEnabled))}</p>
        </article>
        <article className="coach-profile-facts">
          <span>{copy.officialProfile}</span>
          <h2>{copy.coachContext}</h2>
          <div className="coach-profile-club">
            {club.logoUrl ? <img src={club.logoUrl} alt="" /> : <Flag aria-hidden="true" />}
            <div><small>{copy.currentClubHeading}</small><strong>{club.name}</strong></div>
          </div>
          <dl className="coach-profile-fact-grid">
            <div><dt>{cardCopy.nationality}</dt><dd>{nationalityLabel}</dd></div>
            <div><dt>{matchCopy.season}</dt><dd>{competition?.seasonLabel ?? TOUCHLINE_ENGLAND_SEASON}</dd></div>
            <div><dt>{copy.matches}</dt><dd>{matchesPlayed ?? "—"}</dd></div>
            <div><dt>{copy.tier}</dt><dd>{touchlineCardTierName(classification.tierKey, locale, draftLocalesEnabled)}</dd></div>
          </dl>
          {campaign.length ? <section className="coach-profile-campaign" aria-label={copy.seasonCampaign}>
            <header><span>{copy.seasonForm}</span><strong>{copy.homeAndAway}</strong></header>
            <div>{campaign.map(({ key, icon: Icon, label, record }) => <article key={key}>
              <Icon aria-hidden="true" />
              <span><small>{label}</small><strong>{record.wins}{draftLocalesEnabled ? recordCopy.winsShort : "W"} · {record.draws}{draftLocalesEnabled ? recordCopy.drawsShort : "D"} · {record.losses}{draftLocalesEnabled ? recordCopy.lossesShort : "L"}</strong></span>
            </article>)}</div>
          </section> : null}
          {historyAvailable ? (
            <dl className="coach-profile-history-grid">
              <div><dt>{copy.previousClub}</dt><dd>{classification.sourceClub ?? "—"}</dd></div>
              <div><dt>{copy.previousLeague}</dt><dd>{classification.sourceLeagueName ?? "—"}</dd></div>
              <div><dt>{copy.finalPosition}</dt><dd>{classification.finalPosition === null ? "—" : `#${classification.finalPosition}`}</dd></div>
            </dl>
          ) : <p className="coach-profile-pending">{copy.historyPending}</p>}
        </article>
      </section>
      </div>
      </div>
      <style>{`
        .coach-profile-page { min-height: 100dvh; color:#efffd5; background:radial-gradient(circle at 82% 10%,rgba(181,255,75,.13),transparent 32%),linear-gradient(145deg,#020708,#07140f); }
        .coach-profile-content { padding: clamp(16px,2.5vw,32px); }
        .coach-profile-nav { display:flex; flex-wrap:wrap; align-items:center; gap:10px; max-width:1180px; margin:0 auto 24px; }
        .coach-profile-nav > nav { width:auto; flex:1 1 560px; margin:0; }
        .coach-profile-hero,.coach-profile-grid { max-width:1180px; margin:0 auto; display:grid; gap:clamp(18px,2.5vw,32px); grid-template-columns:minmax(0,1fr) minmax(240px,300px); }
        .coach-profile-hero { align-items:start; }
        .coach-profile-copy { min-width:0; padding-top:16px; }
        .coach-profile-copy > span,.coach-profile-grid > article > span { color:#b5ff4b; font-size:10px; font-weight:950; letter-spacing:.13em; }
        .coach-profile-copy h1 { margin:9px 0 10px; font-size:clamp(34px,4.5vw,62px); line-height:1.05; letter-spacing:-.045em; overflow-wrap:anywhere; }
        .coach-profile-copy p { margin:0; color:rgba(239,255,213,.72); font-size:16px; }
        .coach-profile-copy > dl,.coach-profile-grid > article > dl { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; margin:20px 0 0; }
        .coach-profile-identity-grid > div { border-top:1px solid rgba(181,255,75,.24); padding-top:12px; min-width:0; }
        .coach-profile-identity-grid dd,.coach-profile-facts dd { overflow-wrap:anywhere; }
        .coach-profile-grid { margin-top:24px; grid-template-columns:minmax(0,1.28fr) minmax(280px,.72fr); align-items:start; }
        .coach-profile-grid > article { border:1px solid rgba(181,255,75,.18); border-radius:24px; padding:clamp(20px,3vw,34px); background:rgba(3,15,12,.72); }
        .coach-profile-game-card { display:grid; align-content:start; gap:18px; }
        .coach-profile-grid > article > h2 { margin:8px 0 4px; font-size:clamp(23px,3vw,36px); letter-spacing:-.04em; }
        .coach-profile-grid > article > p { color:rgba(239,255,213,.7); font-size:14px; line-height:1.55; }
        .coach-profile-grid > article > dl { grid-template-columns:repeat(2,minmax(0,1fr)); margin-top:20px; }
        .coach-profile-identity-grid dt,.coach-profile-facts dt { color:rgba(239,255,213,.56); font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
        .coach-profile-identity-grid dd,.coach-profile-facts dd { margin:5px 0 0; font-size:14px; font-weight:800; }
        /* Keep the official leader crown fully inside the profile composition
           while leaving its approved art and frame clearance untouched. */
        .coach-profile-card { width:min(100%,300px); justify-self:center; padding-top:0; box-sizing:border-box; overflow:visible; }
        .coach-profile-card:has(> [data-coach-ranking-leader="true"]) { padding-top:96px; }
        .coach-profile-card > [data-coach-ranking-leader="true"] { margin-top:0 !important; }
        .coach-profile-offer-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
        .coach-profile-offer-grid > div { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:10px; border:1px solid rgba(181,255,75,.13); border-radius:14px; padding:12px; background:rgba(0,0,0,.2); }
        .coach-profile-offer-grid svg { width:21px; height:21px; color:#b5ff4b; }
        .coach-profile-offer-grid span,.coach-profile-offer-grid small,.coach-profile-offer-grid strong { display:block; }
        .coach-profile-offer-grid small { color:rgba(239,255,213,.55); font-size:9px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
        .coach-profile-offer-grid strong { margin-top:3px; color:white; font-size:13px; }
        .coach-profile-facts { display:grid; align-content:start; gap:16px; }
        .coach-profile-club { display:flex; align-items:center; gap:12px; min-width:0; border:1px solid rgba(181,255,75,.17); border-radius:16px; padding:12px; background:linear-gradient(135deg,rgba(181,255,75,.08),rgba(0,0,0,.16)); }
        .coach-profile-club img,.coach-profile-club > svg { width:48px; height:48px; flex:0 0 auto; object-fit:contain; filter:none; }
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
        @media (min-width:761px) {
          .coach-profile-composition { max-width:1180px; margin:0 auto; display:grid; grid-template-columns:minmax(0,1fr) 300px; grid-template-rows:auto auto auto; gap:24px 32px; align-items:start; }
          .coach-profile-hero,.coach-profile-grid { display:contents; }
          .coach-profile-copy { grid-column:1; grid-row:1; }
          .coach-profile-card { grid-column:2; grid-row:1 / 3; }
          .coach-profile-game-card { grid-column:1; grid-row:2; }
          .coach-profile-facts { grid-column:1 / -1; grid-row:3; }
        }
        @media (max-width:760px) { .coach-profile-grid { grid-template-columns:1fr; } .coach-profile-hero { grid-template-columns:minmax(0,1fr) minmax(180px,34%); } .coach-profile-card { width:min(100%,280px); } .coach-profile-card:has(> [data-coach-ranking-leader="true"]) { padding-top:84px; } .coach-profile-copy dl { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @media (max-width:520px) { .coach-profile-hero { grid-template-columns:1fr; } .coach-profile-copy { padding-top:0; } }
      `}</style>
    </main>
  );
}
