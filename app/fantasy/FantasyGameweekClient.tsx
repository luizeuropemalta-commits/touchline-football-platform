"use client";
import { initialCollectionCoachClub, collectionStructureShown } from "@/lib/touchlineFantasy/collection-empty-state";
import { collectionAreaLabel } from "@/lib/touchlineFantasy/collection-area-label";
import { getAllocationDialogCopy } from "@/lib/touchlineFantasy/allocation-dialog-i18n";

import { formatTouchlineFantasyStandaloneAlert, getTouchlineFantasyStandaloneBuilderCopy } from "@/lib/touchlineFantasy/standalone-builder-i18n";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, CalendarClock, Check, ChevronRight, CircleAlert, Crown, House, LockKeyhole, PlaneTakeoff, Save, Search, Send, ShieldCheck, TimerReset, Trophy, Users, WalletCards } from "lucide-react";

import TouchlineCoachCardZoom from "@/components/touchline/cards/TouchlineCoachCardZoom";
import TouchlineGameweekCard from "@/components/touchline/fantasy/TouchlineGameweekCard";
import TouchlineBetaEnrollment from "@/components/touchline/fantasy/TouchlineBetaEnrollment";
import TouchlineFantasyRoundContinuity from "@/components/touchline/fantasy/TouchlineFantasyRoundContinuity";
import { ClubOwnerCollectionSlots, ClubOwnerPlayerPlacementDialog, ClubOwnerSquadSwapDialog, type CollectionDestination } from "@/components/touchline/fantasy/ClubOwnerCollectionSlots";
import { createCollectionMarketIntent, collectionMarketIntentCurrent, collectionMarketPlayerFits, collectionMarketPurchaseConfirmed, type CollectionMarketIntent } from "@/lib/touchlineFantasy/collection-market-intent";
import { CLUB_RESERVE_POSITIONS, collectionSlotPlan, previewPlannedClubAllocation } from "@/lib/touchlineFantasy/collection-slot-plan";
import { clubPrimaryPositionIndex } from "@/lib/touchlineFantasy/club-primary-position-index";
import { primaryPositionFitsTacticalSlot } from "@/lib/touchlineFantasy/club-primary-position-policy";
import { useClubCollection } from "@/components/touchline/fantasy/useClubCollection";
import ClubOwnerBudgetCalculator from "@/components/touchline/fantasy/ClubOwnerBudgetCalculator";
import ClubOwnerTechnicalRail from "@/components/touchline/fantasy/ClubOwnerTechnicalRail";
import ClubOwnerValueSummary from "@/components/touchline/fantasy/ClubOwnerValueSummary";
import financeStyles from "@/components/touchline/fantasy/ClubOwnerFinance.module.css";
import type { ClubCollectionReadResult } from "@/lib/touchlineFantasy/club-collection-read-server";
import { confirmedCollectionBootstrap } from "@/lib/touchlineFantasy/club-collection-bootstrap";
import { parseClubCommandAuthority } from "@/lib/touchlineFantasy/club-command-authority";
import { ClubOwnerReleaseDialog } from "@/components/touchline/fantasy/ClubOwnerReleaseDialog";
import { ClubOwnerCoachReleaseDialog } from "@/components/touchline/fantasy/ClubOwnerCoachReleaseDialog";
import { getCoachReleaseReviewCopy } from "@/lib/touchlineFantasy/coach-release-review-i18n";
import { clubStarterSelections, type ClubAllocationCommand } from "@/lib/touchlineFantasy/club-allocation";
import { canChooseGuidedSlot, nextGuidedChoice } from "@/lib/touchlineFantasy/next-guided-choice";
import { resolveCoachSigningPricePresentation } from "@/lib/touchlineArena/coach-signing-price-i18n";
import { CLUB_COACH_VALUES, type ClubAcquisitionState } from "@/lib/touchlineFantasy/club-acquisition";
import { CLUB_ROSTER_CAPACITY } from "@/lib/touchlineFantasy/club-roster";
import collectionLayout from "@/components/touchline/fantasy/ClubOwnerCollectionSlots.module.css";
import ClubOwnerNegotiationRoom from "@/components/touchline/market/ClubOwnerNegotiationRoom";
import ClubOwnerExchangeHub from "@/components/touchline/market/ClubOwnerExchangeHub";
import ClubOwnerOffice from "@/components/touchline/office/ClubOwnerOffice";
import { officeCopy } from "@/components/touchline/office/club-office-model";
import TouchlineEliteExactCard from "@/components/touchline/cards/TouchlineEliteExactCard";
import { squadCardToExactPlayer } from "@/lib/touchlineArena/demo-data";
import { getTouchlineBetaEnrollmentCopy } from "@/lib/touchlineFantasy/beta-enrollment-i18n";
import ClubOwnerPlanShowcase from "@/components/touchline/ClubOwnerPlanShowcase";
import ClubHubFixtureStrip from "@/components/touchline/ClubHubFixtureStrip";
import type { TouchlinePublicFixture } from "@/lib/football-data/public-fixture";
import type { TouchlineLiveReadMetadata } from "@/lib/touchlineArena/match-centre";
import type { TouchlineLiveAdmissionScope } from "@/lib/touchlineArena/sports-publication-live-view";
import TouchlineMatchCardBadge from "@/components/touchline/cards/TouchlineMatchCardBadge";
import TouchlinePlayerAvailabilityBadge from "@/components/touchline/cards/TouchlinePlayerAvailabilityBadge";
import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import { touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import TouchlinePitchSurface, { TOUCHLINE_MARKET_HOUSE_CAMPAIGN } from "@/components/touchline/pitch/TouchlinePitchSurface";
import { touchlineLiveOptimizedClubLogoUrl } from "@/lib/touchlineArena/club-crests";
import { findTouchLineClub, TOUCHLINE_ENGLAND_CLUBS_BY_RANK, type ClubOwnerSquadCard, type TouchLineClubVisual } from "@/lib/touchlineArena/demo-data";
import type { TouchlineFormationGeometrySlot } from "@/lib/touchlineArena/formation-geometry";
import { touchlineMarketPositionBucket, touchlineMarketPositionBucketLabel, type TouchlineMarketPositionBucket, type TouchlineRosterRole } from "@/lib/touchlineArena/position-eligibility";
import { localizedPositionLabel } from "@/lib/touchlineArena/position-labels";
import { assignTouchlineFantasyPlayerToFirstSlot, formatTouchlineFantasyDeadline, formatTouchlineFantasyMarketValue, removeTouchlineFantasyPlayerFromSlot, replaceTouchlineFantasyPlayerAtSlot, resolveTouchlineFantasyBuilderStep, resolveTouchlineFantasyMarketClock, touchlineFantasySlotAcceptsPlayer, validateTouchlineFantasyLineup, type TouchlineFantasyBuilderStep, type TouchlineFantasyEligiblePlayer, type TouchlineFantasySelection } from "@/lib/touchlineFantasy/domain";
import type { TouchlineFantasyCoachView, TouchlineFantasySnapshot } from "@/lib/touchlineFantasy/server";
import { TOUCHLINE_FANTASY_BROWSE_POSITIONS, resolveTouchlineFantasyBrowseSlot, touchlineFantasyPitchCardWidth, touchlineFantasyTechnicalCardWidth } from "@/lib/touchlineFantasy/market-browser";
import { getTouchlineFantasyMarketStateCopy, touchlineFantasyLineupErrorCopy, touchlineFantasyStatusCopy, touchlineFantasyStepLabel } from "@/lib/touchlineFantasy/market-state-i18n";
import { formatTouchlineFantasyClockUnit, getTouchlineFantasyMarketClockCopy } from "@/lib/touchlineFantasy/market-clock-i18n";
import { getTouchlineFantasyMarketAccessCopy, getTouchlineFantasyMarketPlanLockCopy } from "@/lib/touchlineFantasy/market-access-i18n";
import { isTouchlineFantasyMarketAccess, isTouchlineFantasyMarketClubAllowed as canBrowseMarketClub, type TouchlineFantasyMarketAccess } from "@/lib/touchlineFantasy/market-plan-policy";
import { getTouchlineFantasyMarketMetricsCopy } from "@/lib/touchlineFantasy/market-metrics-i18n";
import { getTouchlineFantasyMarketWorkflowCopy } from "@/lib/touchlineFantasy/market-workflow-i18n";
import { formatTouchlineFantasyBudgetAmount, getClubCollectionBudgetCopy, getTouchlineFantasyMarketBudgetCopy } from "@/lib/touchlineFantasy/market-budget-i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import controls from "@/components/touchline/TouchlineGlobalNavigation.module.css";
import styles from "./fantasy.module.css";

import { clubRelatedConfirmed, clubRelatedFingerprint } from "@/lib/touchlineFantasy/club-round-confirmation";
type LiveState = Pick<NonNullable<TouchlineFantasySnapshot>, "gameweeks" | "qaClubMarketOpen" | "activeGameweek" | "userGameweek" | "selections" | "gameweekScore" | "seasonScore" | "matchHistory" | "gameweekRanking" | "seasonRanking" | "lineupAlerts" | "matchCardIndicators" | "playerAvailabilityIndicators">;
const STEPS: readonly TouchlineFantasyBuilderStep[] = ["coach", "formation", "players", "review", "locked"];

function FantasyBudgetNotice({ editable, remainingBudget, selectedCount, attemptedOverBudget, locale, draftLocalesEnabled = false, collectionEnabled = false, collectionState = null, collectionReady = false, onReviewXI, onExplorePlans }: {
  editable: boolean; remainingBudget: number | null; selectedCount: number; attemptedOverBudget: boolean; locale: string; draftLocalesEnabled?: boolean;
  collectionEnabled?: boolean; collectionState?: ClubAcquisitionState | null; collectionReady?: boolean;
  /** These only move within the current ClubOwner page; neither changes entitlement nor starts billing. */
  onReviewXI?: () => void;
  onExplorePlans?: () => void;
}) {
  // Contract values are not cash. The collection notice uses only the confirmed
  // wallet, including all 35 owned players rather than the eleven on the pitch.
  if (collectionEnabled && (!collectionReady || !collectionState)) return null;
  const availableBudget = collectionEnabled ? collectionState!.balanceEur : remainingBudget;
  const rosterCount = collectionEnabled ? collectionState!.players.length : selectedCount;
  const capacity = collectionEnabled ? CLUB_ROSTER_CAPACITY.total : 11;
  const exhausted = availableBudget !== null && Number.isFinite(availableBudget) && availableBudget <= 0 && rosterCount < capacity;
  if (!editable || (!exhausted && !attemptedOverBudget)) return null;
  const copy = getTouchlineFantasyMarketBudgetCopy(locale, draftLocalesEnabled, collectionEnabled);
  return <section className={styles.budgetNotice} data-market-budget-notice={exhausted ? "exhausted" : "exceeded"}>
    <div role="status"><strong>{exhausted ? copy.exhausted : copy.exceeded}</strong><p>{copy.advice}</p></div>
    <div className={styles.budgetRecoveryActions}>
      <button type="button" onClick={onReviewXI}>{copy.reviewXI}</button>
      <button type="button" onClick={onExplorePlans}>{copy.upgrade}</button>
    </div>
    <details className={styles.budgetComparison}>
      <summary className={controls.link}>{copy.compare}</summary>
      <p>{copy.previewOnly}</p>
      <ClubOwnerPlanShowcase initialPlan="beta" name="" locale={locale} draftLocalesEnabled={draftLocalesEnabled} collectionEnabled={collectionEnabled}
        remainingMarketPower={availableBudget === null ? null : formatTouchlineFantasyBudgetAmount(Math.max(0, availableBudget), locale, draftLocalesEnabled)} />
    </details>
  </section>;
}

function ArenaView({ expanded, label, onClose, children }: { expanded: boolean; label: string; onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.querySelector<HTMLButtonElement>('[data-arena-close="true"]')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-arena-open="true"]')?.focus({ preventScroll: true }));
    };
  }, [expanded]);
  if (!expanded) return children;
  return createPortal(<div ref={root} className={`${styles.myClubCommand} ${styles.arenaOverlay}`} data-fantasy-context="market" role="dialog" aria-modal="true" aria-label={label} onKeyDown={(event) => {
    // Card zoom owns its own portal and Escape handling above the Arena.
    if (!root.current?.contains(event.target as Node)) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key !== "Tab") return;
    const controls = Array.from(root.current.querySelectorAll<HTMLElement>('button:not(:disabled), summary, select:not(:disabled), a[href], [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
    const first = controls[0]; const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>{children}</div>, document.body);
}

function newIdempotencyKey(action: "draft" | "confirm") { return `fantasy:${action}:${crypto.randomUUID()}`; }
function lineupFingerprint(input: Readonly<{ selectedCoachId: string | null; formationCode: string | null; selections: readonly TouchlineFantasySelection[] }>) {
  return JSON.stringify({
    selectedCoachId: input.selectedCoachId ?? "",
    formationCode: input.formationCode ?? "",
    selections: [...input.selections].sort((first, second) => first.slotId.localeCompare(second.slotId) || first.playerId.localeCompare(second.playerId)),
  });
}
function lineupErrorCopy(code: string, locale: string, draftLocalesEnabled = false) {
  return touchlineFantasyLineupErrorCopy(code, locale, draftLocalesEnabled);
}
function wait(milliseconds: number) { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)); }
function scrollToLineupSection(id: string) {
  window.requestAnimationFrame(() => {
    const section = document.getElementById(id);
    if (!section) return;
    section.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  });
}
function statusCopy(state: string | undefined, locale: string, draftLocalesEnabled = false) {
  return touchlineFantasyStatusCopy(state, locale, draftLocalesEnabled);
}
function stepLabel(step: TouchlineFantasyBuilderStep, locale: string, draftLocalesEnabled = false) {
  return touchlineFantasyStepLabel(step, locale, draftLocalesEnabled);
}
function RankingTable({ title, entries, empty }: { title: string; entries: TouchlineFantasySnapshot["gameweekRanking"]; empty: string }) {
  return <section className={styles.rankingPanel}><h3><Trophy aria-hidden="true" />{title}</h3>{entries.length ? <ol>{entries.slice(0, 20).map((entry) => <li key={entry.rank} data-current-manager={entry.isCurrentManager ? "true" : undefined}><span>#{entry.rank}</span><b>{entry.name}</b><strong>{entry.score.toFixed(2)}</strong></li>)}</ol> : <p>{empty}</p>}</section>;
}
function MarketWindowClock({ gameweeks, locale, marketStatus, draftLocalesEnabled = false, hideAwaitingFinalHeading = false }: { gameweeks: TouchlineFantasySnapshot["gameweeks"]; locale: string; marketStatus?: string; draftLocalesEnabled?: boolean; hideAwaitingFinalHeading?: boolean }) {
  const countdownWindowMs = 24 * 60 * 60 * 1_000;
  const copy = getTouchlineFantasyMarketClockCopy(locale, draftLocalesEnabled);
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const clock = useMemo(() => nowMs === null ? null : resolveTouchlineFantasyMarketClock(gameweeks, nowMs), [gameweeks, nowMs]);
  const phase = clock?.phase ?? "loading";
  const targetMs = clock?.targetAt ? Date.parse(clock.targetAt) : Number.NaN;
  const remainingMs = nowMs !== null && Number.isFinite(targetMs) ? Math.max(0, targetMs - nowMs) : 0;
  const totalSeconds = Math.floor(remainingMs / 1_000);
  const timed = (clock?.phase === "closing" || clock?.phase === "opening")
    && Number.isFinite(targetMs)
    && remainingMs <= countdownWindowMs;
  const parts = [
    { value: Math.floor(totalSeconds / 3_600), unit: copy.hourShort },
    { value: Math.floor((totalSeconds % 3_600) / 60), unit: copy.minuteShort },
    { value: totalSeconds % 60, unit: copy.secondShort },
  ];
  const heading = phase === "closing"
    ? (timed ? copy.closesIn : copy.open)
    : phase === "opening"
      ? (timed ? copy.reopensIn : copy.closed)
      : phase === "awaiting-final"
        ? copy.lastWhistle
        : phase === "syncing"
          ? copy.updating
          : copy.nextWindow;
  const awaitingFinalWithoutHeading = hideAwaitingFinalHeading && phase === "awaiting-final";
  const detail = phase === "awaiting-final"
    ? copy.awaitingFinal
    : phase === "syncing"
      ? copy.syncingWindow
      : clock?.targetAt
        ? timed
          ? `${formatTouchlineFantasyDeadline(clock.targetAt, locale, draftLocalesEnabled)} · ${copy.london}`
          : phase === "closing"
            ? copy.closesAt.replace("{deadline}", formatTouchlineFantasyDeadline(clock.targetAt, locale, draftLocalesEnabled))
            : copy.reopensAt.replace("{deadline}", formatTouchlineFantasyDeadline(clock.targetAt, locale, draftLocalesEnabled))
        : copy.unconfirmedTime;
  const accessibleCountdown = [
    formatTouchlineFantasyClockUnit(parts[0].value, "hour", locale, draftLocalesEnabled),
    formatTouchlineFantasyClockUnit(parts[1].value, "minute", locale, draftLocalesEnabled),
    formatTouchlineFantasyClockUnit(parts[2].value, "second", locale, draftLocalesEnabled),
  ].join(", ");
  return <aside className={styles.marketClock} data-market-clock-phase={phase} aria-label={`${awaitingFinalWithoutHeading ? (marketStatus ?? copy.closedStatus) : heading}. ${timed ? accessibleCountdown : detail}`}>
    {marketStatus ? <strong className={styles.clockRule}>{marketStatus}</strong> : null}
    {awaitingFinalWithoutHeading ? null : <div className={styles.clockHeading}><i aria-hidden="true"><TimerReset /></i><span><small>TOUCHLINE · MARKET</small><b>{heading}</b></span>{clock?.gameweekNumber ? <em>GW {clock.gameweekNumber}</em> : null}</div>}
    {timed ? <><div className={styles.clockDigits} aria-hidden="true">{parts.map((part) => <span key={part.unit}><b>{String(part.value).padStart(2, "0")}</b><small>{part.unit}</small></span>)}</div><time className={styles.srOnly} dateTime={clock?.targetAt ?? undefined}>{accessibleCountdown}</time></> : !marketStatus ? <strong className={styles.clockRule}>{phase === "awaiting-final" || phase === "opening" ? copy.closedStatus : phase === "closing" ? copy.openStatus : phase === "syncing" ? copy.syncingStatus : copy.unconfirmedStatus}</strong> : null}
    <p><span aria-hidden="true" />{detail}</p>
  </aside>;
}
function CompactClubIdentity({ clubName, clubLogoUrl, detail }: { clubName: string; clubLogoUrl?: string | null; detail?: string }) {
  const compactLogoUrl = touchlineLiveOptimizedClubLogoUrl(clubLogoUrl);
  return <span className={styles.clubIdentity} data-club-identity="compact">
    {compactLogoUrl ? <Image src={compactLogoUrl} alt="" width={22} height={22} unoptimized loading="eager" aria-hidden="true" /> : <i aria-hidden="true" />}
    <small>{clubName}{detail ? ` · ${detail}` : ""}</small>
  </span>;
}
function initialMarketClub(teamId: string | null | undefined, access: TouchlineFantasyMarketAccess | null | undefined) {
  // Keep a real deep-linked club visible even when restricted; its result area
  // explains the lock instead of silently switching to a different club.
  return TOUCHLINE_ENGLAND_CLUBS_BY_RANK.find((club) => club.teamId === teamId)?.teamId
    ?? TOUCHLINE_ENGLAND_CLUBS_BY_RANK.find((club) => canBrowseMarketClub(access, club.teamId))?.teamId ?? "";
}
function CompactClubSelector({ selectedTeamId, onSelect, locale, draftLocalesEnabled = false, mode = "player", marketAccess, lockedLabel, onLockedSelect }: {
  selectedTeamId: string; onSelect: (club: TouchLineClubVisual) => void; locale: string; draftLocalesEnabled?: boolean;
  /** Coaches are free across all clubs; only player selection is plan gated. */
  mode?: "coach" | "player";
  marketAccess?: TouchlineFantasyMarketAccess | null;
  lockedLabel?: string;
  onLockedSelect?: () => void;
}) {
  const workflowCopy = getTouchlineFantasyMarketWorkflowCopy(locale, draftLocalesEnabled);
  return <div className={styles.clubSelector} role="group" aria-label={workflowCopy.chooseClub}>
    {TOUCHLINE_ENGLAND_CLUBS_BY_RANK.map((club) => {
      const locked = mode !== "coach" && !canBrowseMarketClub(marketAccess, club.teamId);
      return <button
      type="button"
      key={club.teamId}
      aria-label={locked ? `${club.name} · ${lockedLabel}` : club.name}
      aria-pressed={club.teamId === selectedTeamId}
      aria-disabled={locked || undefined}
      data-market-club-locked={locked || undefined}
      title={locked ? lockedLabel : club.name}
      onClick={() => { if (locked) onLockedSelect?.(); else onSelect(club); }}
    >
      {club.logoUrl ? <Image alt="" aria-hidden="true" draggable={false} height={56} loading="eager" src={club.logoUrl} unoptimized width={56} /> : <span aria-hidden="true">{club.shortCode}</span>}
      {locked ? <LockKeyhole className={styles.clubPlanLock} size={16} aria-hidden="true" /> : null}
    </button>;
    })}
  </div>;
}
function FantasyCoachZoom({ entry, locale, eager = false, draftLocalesEnabled = false, releaseAction, frameDisplayWidth }: { entry: TouchlineFantasyCoachView; frameDisplayWidth?: number; locale: string; eager?: boolean; draftLocalesEnabled?: boolean; releaseAction?: ComponentProps<typeof TouchlineCoachCardZoom>["releaseAction"] }) {
  return <TouchlineCoachCardZoom
    frameDisplayWidth={frameDisplayWidth}
    coach={entry.coach}
    slot={entry.slot}
    clubName={entry.clubName}
    clubLogoUrl={entry.clubLogoUrl}
    countryCode3={entry.countryCode3}
    locale={locale}
    draftLocalesEnabled={draftLocalesEnabled}
    contract={null}
    releaseAction={releaseAction}
    competition={entry.competition}
    liveCompetitionUpdates
    acquisitionPrice={{
      label: resolveCoachSigningPricePresentation(locale, draftLocalesEnabled).label,
      valueTc: CLUB_COACH_VALUES[entry.slot.cardTier],
    }}
    profileHref={`/touchline-coaches/${encodeURIComponent(entry.coach.providerId)}?lang=${encodeURIComponent(locale)}`}
    assetLoading={eager ? "eager" : "lazy"}
  />;
}
function canonicalRosterRole(role: string | null | undefined): TouchlineRosterRole | null {
  return role === "goalkeeper" || role === "defender" || role === "midfielder" || role === "forward" ? role : null;
}
function slotAccepts(slot: TouchlineFormationGeometrySlot | null, card: ClubOwnerSquadCard) {
  if (!slot) return true;
  const bucket = touchlineMarketPositionBucket(card.position, canonicalRosterRole(card.role));
  return bucket !== "outfield" && touchlineFantasySlotAcceptsPlayer(slot, {
    playerId: card.canonicalPlayerId ?? card.id,
    clubId: card.clubName,
    marketValueEur: card.editorialCard?.marketValueEur ?? 0,
    positionBucket: bucket,
  });
}

function verticalPitchPosition(slot: TouchlineFormationGeometrySlot) {
  // Registry y grows from the team's right to left. With the goalkeeper
  // below and attack upwards, its right is also the screen's right.
  const left = Math.min(88, Math.max(12, 100 - slot.y));
  const canonicalTop = Math.min(88, Math.max(12, 100 - slot.x));
  const top = 19 + ((canonicalTop - 12) * 69) / 76;
  return { left: `${left}%`, top: `${top}%` };
}

/** The My Club selector uses the canonical formation geometry on a wide,
 * television-style field: goalkeepers left, forwards right. The team's
 * right flank is therefore below the centre line, not above it. */
function horizontalMyClubPitchPosition(slot: TouchlineFormationGeometrySlot) {
  return {
    left: `${Math.min(89, Math.max(11, slot.x))}%`,
    top: `${Math.min(86, Math.max(14, 100 - slot.y))}%`,
  };
}

function initialClubOwnerLineup(snapshot: TouchlineFantasySnapshot | null, initialRead: ClubCollectionReadResult | null | undefined,
  enabled: boolean) {
  const round = {
    selectedCoachId: snapshot?.userGameweek?.selectedCoachId ?? null,
    formationCode: snapshot?.userGameweek?.formationCode ?? null,
    selections: [...(snapshot?.selections ?? [])],
  };
  // Use the same confirmed account/season and placement rules as the collection
  // hook. A closed or unconfirmed market keeps the round's locked XI intact.
  if (!enabled || !snapshot?.entitlementActive
    || !(snapshot.qaClubMarketOpen === true || snapshot.activeGameweek?.state === "MARKET_OPEN")) return round;
  const authority = parseClubCommandAuthority({ expectedAccountId: snapshot.userId, expectedSeasonId: snapshot.config.seasonId });
  const owned = confirmedCollectionBootstrap(initialRead, authority?.authority ?? null)?.state;
  if (!owned) return round;
  const geometry = owned.formationCode ? snapshot.formationRegistry[owned.formationCode] : null;
  if (owned.formationCode && !geometry) return round;
  try {
    return {
      selectedCoachId: owned.coach?.id ?? null,
      formationCode: owned.formationCode ?? null,
      selections: geometry ? clubStarterSelections(owned, geometry,
        clubPrimaryPositionIndex(snapshot.catalogue, { allowLegacyDisplay: true })) : [],
    };
  } catch {
    return round;
  }
}

export default function FantasyGameweekClient({
  initialSnapshot,
  locale,
  embedded = false,
  marketPage = false,
  collectionEnabled = false,
  collectionStructureVisible = false,
  draftLocalesEnabled = false,
  initialPlayerClubTeamId,
  liveTimeZone = "UTC",
  initialLiveFixtures,
  initialLiveAdmissionScope = null,
  initialLiveMetadata = { state: "partial-persisted-schedule", degraded: true },
  initialLiveNow = 0,
  clubOwner,
  initialCollectionRead,
}: {
  initialSnapshot: TouchlineFantasySnapshot | null;
  initialCollectionRead?: ClubCollectionReadResult | null;
  locale: string;
  liveTimeZone?: string;
  /** Canonical schedule; null/undefined means unavailable, [] means an empty read. */
  initialLiveFixtures?: TouchlinePublicFixture[] | null;
  initialLiveAdmissionScope?: TouchlineLiveAdmissionScope | null;
  initialLiveMetadata?: TouchlineLiveReadMetadata | null;
  initialLiveNow?: number;
  /** The ClubOwner page owns the outer identity/navigation shell. */
  embedded?: boolean;
  /** Standalone game presentation; shares the same rules, state and save API. */
  marketPage?: boolean;
  /** Server gate; remains off until collection + round projection acceptance. */
  collectionEnabled?: boolean;
  /** Local, read-only layout review. Does not activate purchases, wallet or listings. */
  collectionStructureVisible?: boolean;
  draftLocalesEnabled?: boolean;
  /** A validated ClubHub/Ranking hand-off opens that club in the XI selector. */
  initialPlayerClubTeamId?: string | null;
  clubOwner?: Readonly<{ name: string; avatarUrl: string }>;
}) {

  const builderCopy = getTouchlineFantasyStandaloneBuilderCopy(locale, draftLocalesEnabled);
  const collection = useClubCollection(collectionEnabled && marketPage, locale,
    initialSnapshot?.config.seasonId ? {expectedAccountId:initialSnapshot.userId,expectedSeasonId:initialSnapshot.config.seasonId} : null,
    applyCollectionSnapshot, initialCollectionRead);
  const showCollectionStructure = collectionStructureShown(marketPage, collectionStructureVisible, collectionEnabled);
  const collectionSlotsEditable = collectionEnabled && collection.ready && Boolean(collection.state) && !collection.busy && !collection.hasPending;
  const [collectionDestination, setCollectionDestination] = useState<CollectionMarketIntent | null>(null);
  const collectionMarketIntentRef = useRef<CollectionMarketIntent | null>(null);
  const collectionMarketSending = useRef(false);
  const [collectionMarketPlayer, setCollectionMarketPlayer] = useState<string | null>(null);
  const [placementPlayerId, setPlacementPlayerId] = useState<string | null>(null);
  const [squadSwap, setSquadSwap] = useState<{ playerId: string; outsideOnly: boolean } | null>(null);
  const [releasePlayerId, setReleasePlayerId] = useState<string | null>(null);
  const [coachReleaseReview, setCoachReleaseReview] = useState<{ id: string; accountId: string; seasonId: string } | null>(null);
  const initialLineup = useMemo(() => initialClubOwnerLineup(initialSnapshot, initialCollectionRead, collectionEnabled && marketPage),
    [initialSnapshot, initialCollectionRead, collectionEnabled, marketPage]);
  const [live, setLive] = useState<LiveState | null>(initialSnapshot);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(initialLineup.selectedCoachId);
  const [formationCode, setFormationCode] = useState<string | null>(initialLineup.formationCode);
  const [selections, setSelections] = useState<TouchlineFantasySelection[]>(initialLineup.selections);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [browsePosition, setBrowsePosition] = useState<Exclude<TouchlineMarketPositionBucket, "outfield"> | null>(null);
  const [pitchCardWidth, setPitchCardWidth] = useState(48);
  const pitchViewportRef = useRef<HTMLDivElement>(null);
  // My Club opens as a collection-first squad workspace. The tactical pitch
  // remains available for deliberate formation work instead of dominating the
  // entire market experience.
  // My Club is pitch-first. The legacy standalone Gameweek builder keeps its
  // own default, but the owner command centre should always make the XI clear.
  const [squadView, setSquadView] = useState<"squad" | "tactical">("tactical");
  const [arenaOpen, setArenaOpen] = useState(false);
  const [visibleStep, setVisibleStep] = useState<TouchlineFantasyBuilderStep>(selectedCoachId ? (formationCode ? "players" : "formation") : "coach");
  const [query, setQuery] = useState("");
  const [playerClubTeamId, applyPlayerClubTeamId] = useState(() => initialMarketClub(initialPlayerClubTeamId, initialSnapshot?.marketAccess));
  const appliedClubRoute = useRef(initialPlayerClubTeamId);
  const clubSelectionVersion = useRef(0);
  // Club, position and search are one visual intent; keep the existing ref so
  // a hot update does not remount an unsaved squad by changing hook order.
  const visualIntentEpoch = clubSelectionVersion as { current: number; appliedCollection?: ClubAcquisitionState };
  function changeMarketQuery(value: string) { visualIntentEpoch.current++; setCollectionMarketPlayer(null); setQuery(value); }
  function setPlayerClubTeamId(teamId: string) {
    if (!canBrowseMarketClub(initialSnapshot?.marketAccess, teamId)) {
      setFeedback(getTouchlineFantasyMarketPlanLockCopy(locale, draftLocalesEnabled));
      return;
    }
    clubSelectionVersion.current++;
    setCollectionMarketPlayer(null);
    applyPlayerClubTeamId(teamId);
  }
  // A new ClubHub link changes the browse filter, not the unsaved XI.
  // Keep this work after mount: updating state during render can race a
  // streaming hand-off and makes React warn before the client is mounted.
  useEffect(() => {
    if (appliedClubRoute.current === initialPlayerClubTeamId) return;
    const selectionVersion = clubSelectionVersion.current;
    const nextClubTeamId = initialMarketClub(initialPlayerClubTeamId, initialSnapshot?.marketAccess);
    // Apply the route hand-off after the committed frame, without remounting
    // the builder. Cancel superseded/unmounted work so it cannot reset a newer
    // filter or touch the user's draft during a streaming transition.
    const frame = window.requestAnimationFrame(() => {
      appliedClubRoute.current = initialPlayerClubTeamId;
      if (clubSelectionVersion.current !== selectionVersion) return;
      applyPlayerClubTeamId((current) => current === nextClubTeamId ? current : nextClubTeamId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialPlayerClubTeamId, initialSnapshot?.marketAccess]);
  const [coachClubTeamId, setCoachClubTeamId] = useState(() => {
    const clubName = initialCollectionCoachClub(initialSnapshot?.coaches ?? []);
    return (clubName ? findTouchLineClub(clubName)?.teamId : null) ?? TOUCHLINE_ENGLAND_CLUBS_BY_RANK[0]?.teamId ?? "";
  });
  const [feedback, setFeedback] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const [deadlineReachedFor, setDeadlineReachedFor] = useState<string | null>(null);
  const builderRef = useRef<HTMLElement>(null);
  const guidePanelRef = useRef<HTMLElement>(null);
  const snapshot = initialSnapshot; const activeGameweek = live?.activeGameweek ?? snapshot?.activeGameweek ?? null;
  const marketPolicy = snapshot?.marketAccess;
  const marketBudgetEur = collectionEnabled && collection.state
    ? collection.state.balanceEur + collection.state.players.reduce((total,p)=>total+p.valueEur,0)
    : isTouchlineFantasyMarketAccess(marketPolicy) ? marketPolicy.budgetEur : 0;
  // A null row in a newer live round must not fall back to the previous round.
  const persistedUserGameweek = live ? live.userGameweek : snapshot?.userGameweek ?? null;
  const persistedSelections = live?.selections ?? snapshot?.selections ?? [];
  const gameweeks = live?.gameweeks ?? snapshot?.gameweeks ?? [];
  const geometry = formationCode ? snapshot?.formationRegistry[formationCode] : null;
  // Empty ClubOwner still shows the original pitch. This geometry is only a
  // visual scaffold: it is never assigned, saved or used to authorize a purchase.
  const displayGeometry = geometry ?? (marketPage ? snapshot?.formationRegistry["4-3-3"] : null);
  const catalogueById = useMemo(() => new Map((snapshot?.catalogue ?? []).map((card) => [card.canonicalPlayerId ?? card.id, card])), [snapshot]);
  // The fallback is display-only for an already-open pre-update SSR page.
  // Purchase/allocation routes resolve primary detail again on the server.
  const primaryDetails = clubPrimaryPositionIndex(snapshot?.catalogue ?? [], { allowLegacyDisplay: true });
  const eligiblePlayers = useMemo(() => (snapshot?.catalogue ?? []).flatMap((card): TouchlineFantasyEligiblePlayer[] => { const bucket = touchlineMarketPositionBucket(card.position, canonicalRosterRole(card.role)); const marketValueEur = card.editorialCard?.marketValueEur; return bucket !== "outfield" && marketValueEur !== undefined ? [{ playerId: card.canonicalPlayerId ?? card.id, clubId: card.clubName, marketValueEur, positionBucket: bucket }] : []; }), [snapshot]);
  const validation = geometry && snapshot ? validateTouchlineFantasyLineup({ selections, players: eligiblePlayers, geometry, budgetEur: marketBudgetEur, maxPlayersPerClub: collectionEnabled ? 11 : snapshot.config.maxPlayersPerClub, requireComplete: true, ...(collectionEnabled ? { primaryDetails } : {}) }) : null;
  const deadlineReached = deadlineReachedFor === activeGameweek?.id;
  const roundEditable = snapshot?.entitlementActive === true && activeGameweek?.state === "MARKET_OPEN" && !deadlineReached;
  const qaClubMarketOpen = collectionEnabled && (live?.qaClubMarketOpen ?? snapshot?.qaClubMarketOpen) === true;
  const marketOpen = qaClubMarketOpen || (activeGameweek?.state === "MARKET_OPEN" && !deadlineReached);
  const editable = snapshot?.entitlementActive === true && marketOpen;
  function applyCollectionSnapshot(owned: ClubAcquisitionState | null, open = marketOpen) {
    if(!collectionEnabled||!owned||!open)return;
    const projectionError = getClubCollectionBudgetCopy(locale, draftLocalesEnabled).savedFormationUnverified;
    setSelectedCoachId(owned.coach?.id ?? null);
    const shape=owned.formationCode?snapshot?.formationRegistry[owned.formationCode]:null;
    if (!shape) {
      // A missing registry entry is not a confirmed empty formation. Preserve
      // the current XI and retry projection when its geometry becomes known.
      if (owned.formationCode) { setFeedback(projectionError); return; }
      setFormationCode(null);setSelections([]);setVisibleStep("formation");visualIntentEpoch.appliedCollection=owned;return;
    }
    try {
      const nextSelections = clubStarterSelections(owned,shape,primaryDetails);
      setFormationCode(shape.formationCode);setSelections(nextSelections);
      if (formationCode !== shape.formationCode || !selectedCoachId) setVisibleStep("players");
      visualIntentEpoch.appliedCollection = owned;
      setFeedback(current => current === projectionError ? null : current);
    } catch {setFeedback(projectionError);}
  }
  function applyIncomingRound(state: LiveState) {
    setLive(state);
    if (collectionEnabled && (state.qaClubMarketOpen === true || state.activeGameweek?.state === "MARKET_OPEN")) {
      // A newly prepared round may be empty. It must never erase the owned XI.
      // A periodic read is not a new selection and must not reset the market
      // or briefly revoke a confirmed squad while the request is pending.
      // A first read may precede the market-open flag. Apply it once when the
      // view becomes editable; unchanged polls must not replay it thereafter.
      if (collection.state && visualIntentEpoch.appliedCollection !== collection.state) applyCollectionSnapshot(collection.state, true);
      collection.revalidate();
      return;
    }
    // A locked round owns a different displayed XI. Reopening must restore
    // the collection even when no acquisition revision changed meanwhile.
    visualIntentEpoch.appliedCollection = undefined;
    setSelectedCoachId(state.userGameweek?.selectedCoachId ?? null);
    setFormationCode(state.userGameweek?.formationCode ?? null);
    setSelections([...state.selections]);
    setVisibleStep(state.userGameweek?.selectedCoachId ? "players" : "coach");
  }
  const applyPolledRound = useEffectEvent(applyIncomingRound);
  const marketAccessCopy = getTouchlineFantasyMarketAccessCopy(locale, draftLocalesEnabled);
  const marketPlanLockCopy = getTouchlineFantasyMarketPlanLockCopy(locale, draftLocalesEnabled);
  const marketMetricsCopy = getTouchlineFantasyMarketMetricsCopy(locale, draftLocalesEnabled);
  const collectionBudgetCopy = getClubCollectionBudgetCopy(locale, draftLocalesEnabled);
  const workflowCopy = getTouchlineFantasyMarketWorkflowCopy(locale, draftLocalesEnabled);
  const marketStatusLabel = !activeGameweek?.state ? marketAccessCopy.unavailable : marketOpen ? marketAccessCopy.open : marketAccessCopy.closed;
  const marketAccessLabel = marketOpen ? marketAccessCopy.viewOnly : marketStatusLabel;
  const lockedZoomReason = !marketOpen && activeGameweek?.state
    ? `${marketAccessCopy.closed}. ${marketAccessCopy.windowRule}`
    : `${marketAccessLabel}. ${marketAccessCopy.browseReadOnly}`;
  const localFingerprint = lineupFingerprint({ selectedCoachId, formationCode, selections });
  const persistedFingerprint = lineupFingerprint({ selectedCoachId: persistedUserGameweek?.selectedCoachId ?? null, formationCode: persistedUserGameweek?.formationCode ?? null, selections: persistedSelections });
  const collectionRelatedChanged = collectionEnabled && (!collection.state
    || !clubRelatedConfirmed(collection.state.players, persistedUserGameweek?.collectionRelatedSnapshot));
  const hasUnsavedChanges = localFingerprint !== persistedFingerprint || collectionRelatedChanged;
  const lineupConfirmed = persistedUserGameweek?.state === "CONFIRMED" && !hasUnsavedChanges;
  const canonicalStep = resolveTouchlineFantasyBuilderStep({ editable, selectedCoachId, formationCode, selectedCount: selections.length, lineupValid: validation?.valid === true });
  const selectedCoach = snapshot?.coaches.find((entry) => entry.id === selectedCoachId) ?? null;
  // Review is bound to the confirmed collection contract, never a catalogue selection.
  // Opening the review never writes; confirmation uses the gated collection lifecycle.
  const coachReleaseAction = collectionEnabled && marketPage && collection.ready
    && selectedCoach
    && collection.state?.coach?.id === selectedCoach.id
    ? {
      label: getCoachReleaseReviewCopy(locale).releaseLabel,
      disabled: !editable || saving || !collectionSlotsEditable,
      onSelect: () => {
        if (editable && !saving && collectionSlotsEditable && snapshot?.userId && collection.state) {
          setCoachReleaseReview({ id: selectedCoach.id, accountId: snapshot.userId, seasonId: collection.state.seasonId });
        }
      },
    } : undefined;
  // A complete XI must still expose a usable replacement market. Keep a real
  // position active whenever the chosen formation has slots.
  const activeSlot = geometry?.slots.find((slot) => slot.id === activeSlotId)
    ?? (marketPage && geometry ? (() => {
      const choice = nextGuidedChoice(geometry.slots.map(slot => ({ slot, selection: selections.find(entry => entry.slotId === slot.id) ?? null })), collection.state);
      return choice?.area === "starters" ? geometry.slots.find(slot => slot.id === choice.slot) : undefined;
    })() : undefined)
    ?? geometry?.slots.find((slot) => !selections.some((selection) => selection.slotId === slot.id))
    ?? geometry?.slots[0]
    ?? null;
  const browsingPosition = browsePosition ?? activeSlot?.allowedPositions[0] ?? "goalkeeper";
  const browseSlot = resolveTouchlineFantasyBrowseSlot({ geometry, bucket: browsingPosition, activeSlotId: activeSlot?.id ?? null, selections });
  const marketTargetSlot = marketPage ? activeSlot : browseSlot;
  function marketSlotAccepts(slot: TouchlineFormationGeometrySlot | null, card: ClubOwnerSquadCard) {
    return collectionEnabled
      ? Boolean(slot && geometry && primaryPositionFitsTacticalSlot(primaryDetails[card.canonicalPlayerId ?? card.id], geometry.formationCode, slot.id))
      : slotAccepts(slot, card);
  }

  useEffect(() => {
    const pitch = pitchViewportRef.current?.querySelector<HTMLElement>(`.${styles.myClubTacticalPitch}`);
    if (!pitch || !displayGeometry) return;
    const resize = () => {
      const fieldWidth = touchlineFantasyPitchCardWidth(displayGeometry.slots, pitch.offsetWidth, pitch.offsetHeight, arenaOpen ? { labelHeight: editable ? 18 : 30, gap: 6 } : undefined);
      // Two equal wings reserve room for five cards each, even on the four-card side.
      const technicalWidth = touchlineFantasyTechnicalCardWidth(pitchViewportRef.current?.clientWidth ?? pitch.offsetWidth);
      setPitchCardWidth(showCollectionStructure && !arenaOpen ? Math.min(fieldWidth, technicalWidth) : fieldWidth);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(pitch);
    return () => observer.disconnect();
  }, [embedded, displayGeometry, selectedCoach, squadView, arenaOpen, editable, showCollectionStructure]);

  useEffect(() => { if (!activeGameweek) return; const deadline = Date.parse(activeGameweek.locksAt); if (!Number.isFinite(deadline)) return; const remaining = Math.max(0, deadline - Date.now()); const gameweekId = activeGameweek.id; const timer = window.setTimeout(() => setDeadlineReachedFor(gameweekId), Math.min(remaining, 2_147_000_000)); return () => window.clearTimeout(timer); }, [activeGameweek]);
  useEffect(() => {
    // Missing-round recovery owns its bounded command/readback. Do not race
    // that flow with a poll returning the pre-preparation empty snapshot.
    if (!snapshot?.entitlementActive || !activeGameweek
      || (activeGameweek.state === "MARKET_OPEN" && !persistedUserGameweek)) return;
    let disposed = false;
    let pending: AbortController | null = null;
    let pendingDeadline: number | undefined;
    const invalidateIndicators = () => {
      if (!disposed) setLive(previous => previous ? { ...previous, qaClubMarketOpen: false, matchCardIndicators: null, playerAvailabilityIndicators: null } : previous);
    };
    const poll = window.setInterval(async () => {
      if (pending || disposed) return;
      const controller = new AbortController();
      pending = controller;
      const deadline = window.setTimeout(() => controller.abort(), 20_000);
      pendingDeadline = deadline;
      try {
        const response = await fetch("/api/touchline-fantasy/state", { cache: "no-store", signal: controller.signal });
        const payload = response.ok ? await response.json() : null;
        if (disposed) return;
        if (controller.signal.aborted || !payload?.ok) { invalidateIndicators(); return; }
        setLive(payload);
        if (payload.qaClubMarketOpen === true || payload.activeGameweek?.id !== activeGameweek.id
          || (payload.activeGameweek?.state !== "MARKET_OPEN" && activeGameweek.state === "MARKET_OPEN")) applyPolledRound(payload);
      } catch { invalidateIndicators(); }
      finally { window.clearTimeout(deadline); pendingDeadline = undefined; pending = null; }
    }, 20_000);
    return () => { disposed = true; window.clearInterval(poll); window.clearTimeout(pendingDeadline); pending?.abort(); };
  }, [activeGameweek, snapshot?.entitlementActive, persistedUserGameweek]);
  useEffect(() => {
    const builder = builderRef.current;
    const guidePanel = guidePanelRef.current;
    if (!builder || !guidePanel) return;
    const synchroniseHeight = () => {
      const height = Math.ceil(builder.getBoundingClientRect().height);
      if (height > 0) guidePanel.style.setProperty("--market-guide-height", `${height}px`);
    };
    synchroniseHeight();
    const observer = new ResizeObserver(synchroniseHeight);
    observer.observe(builder);
    window.addEventListener("resize", synchroniseHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", synchroniseHeight);
    };
  }, []);
  if (snapshot?.betaEnrollmentAvailable === true && snapshot.entitlementActive === false && marketPolicy === null) {
    return <section data-fantasy-context={embedded ? "my-club" : "standalone"} data-market-onboarding="beta">
      <TouchlineBetaEnrollment locale={locale} draftLocalesEnabled={draftLocalesEnabled} autoStart={embedded} />
    </section>;
  }
  if (!snapshot || !isTouchlineFantasyMarketAccess(marketPolicy)) return <section className={styles.unavailable} data-fantasy-context={embedded ? "my-club" : "standalone"}><h1>{getTouchlineFantasyMarketStateCopy(locale, draftLocalesEnabled).unavailableTitle}</h1><p>{getTouchlineFantasyMarketStateCopy(locale, draftLocalesEnabled).unavailableMessage}</p></section>;
  // A missing lineup is normal for a reset/new ClubOwner after the deadline.
  // Recovery cannot prepare that closed round; retain the market lock instead
  // of presenting a permanent loading/retry panel for a non-existent team.
  const roundRecoveryPending = snapshot.entitlementActive && activeGameweek?.state === "MARKET_OPEN" && !persistedUserGameweek
    && (!marketPage || !deadlineReached);
  if (roundRecoveryPending && !marketPage) {
    return <div className={styles.unavailable}><TouchlineFantasyRoundContinuity key={`${snapshot.userId}:${activeGameweek.id}`}
      accountId={snapshot.userId} gameweekId={activeGameweek.id} locale={locale} draftLocalesEnabled={draftLocalesEnabled}
      onReady={applyIncomingRound} /></div>;
  }

  async function allocatePlanned(command: Omit<Extract<ClubAllocationCommand, { action: "move" }>, "expectedRevision" | "idempotencyKey"> | Omit<Extract<ClubAllocationCommand, { action: "formation" }>, "expectedRevision" | "idempotencyKey">) {
    const state = collection.state;
    const nextGeometry = command.action === "formation" ? snapshot!.formationRegistry[command.formationCode] : geometry;
    if (!state || !nextGeometry || !previewPlannedClubAllocation(state, { ...command, expectedRevision: state.revision, idempotencyKey: "allocation_preview" }, nextGeometry, primaryDetails)) {
      setFeedback(getClubCollectionBudgetCopy(locale, draftLocalesEnabled).incompatibleSquadAllocation);
      return false;
    }
    return collection.allocate(command);
  }
  function changeFormation(nextCode: string) { const nextGeometry = snapshot!.formationRegistry[nextCode]; if (!nextGeometry || !editable || saving || nextCode === formationCode) return;
    visualIntentEpoch.current++;
    if(collectionEnabled){if(collection.state&&!collection.busy)void allocatePlanned({action:"formation",formationCode:nextCode});return;}
    const remapped: TouchlineFantasySelection[] = []; for (const selection of selections) { const player = eligiblePlayers.find((entry) => entry.playerId === selection.playerId); if (!player) continue; const slotId = assignTouchlineFantasyPlayerToFirstSlot({ player, geometry: nextGeometry, selections: remapped }); if (slotId) remapped.push({ playerId: player.playerId, slotId }); } setFormationCode(nextCode); setSelections(remapped); setActiveSlotId(null); setBrowsePosition(null); setVisibleStep("players"); setFeedback(workflowCopy.formationUpdated); }
  function playerExceedsBudget(card: ClubOwnerSquadCard, targetSlot = activeSlot) {
    if(collectionEnabled&&collection.state)return !collection.state.players.some(p=>p.playerId===(card.canonicalPlayerId??card.id))
      && (card.editorialCard?.marketValueEur??Infinity)>collection.state.balanceEur;
    if (!geometry) return false;
    const player = eligiblePlayers.find((entry) => entry.playerId === (card.canonicalPlayerId ?? card.id));
    if (!player || (targetSlot && !touchlineFantasySlotAcceptsPlayer(targetSlot, player))) return false;
    const slotId = targetSlot?.id ?? assignTouchlineFantasyPlayerToFirstSlot({ player, geometry, selections });
    const slot = geometry.slots.find((entry) => entry.id === slotId);
    if (!slot) return false;
    // Use the same net replacement and domain budget rule as the write guard.
    // A full wallet is not required when the outgoing player's value funds it.
    const next = replaceTouchlineFantasyPlayerAtSlot({ selections, slot, player });
    return next !== null && validateTouchlineFantasyLineup({ selections: next, players: eligiblePlayers, geometry, budgetEur: marketBudgetEur, maxPlayersPerClub: snapshot!.config.maxPlayersPerClub, requireComplete: false }).issues.includes("BUDGET_EXCEEDED");
  }
  async function addPlayer(card: ClubOwnerSquadCard) {
    if (!editable || !geometry) return false;
    if (saving || (collectionEnabled && !collectionSlotsEditable)) return false;
    if (!canBrowseMarketClub(marketPolicy, findTouchLineClub(card.clubName)?.teamId)) {
      setFeedback(marketPlanLockCopy); return false;
    }
    const playerId = card.canonicalPlayerId ?? card.id;
    const player = eligiblePlayers.find((entry) => entry.playerId === playerId);
    if (!player) { setFeedback(workflowCopy.cardNotEligible); return false; }

    // A selected slot is intentional: never silently put an incompatible card
    // into some other empty position (for example, a full-back into attack).
    if (activeSlot && !(collectionEnabled ? marketSlotAccepts(activeSlot, card) : touchlineFantasySlotAcceptsPlayer(activeSlot, player))) {
      setFeedback(workflowCopy.slotNotEligible); return false;
    }
    const slotId = activeSlot?.id ?? assignTouchlineFantasyPlayerToFirstSlot({ player, geometry, selections });
    const slot = slotId ? geometry.slots.find((entry) => entry.id === slotId) ?? null : null;
    if (!slot) { setFeedback(workflowCopy.noCompatibleSlot); return false; }
    if (marketPage && !canChooseGuidedSlot(nextGuidedChoice(geometry.slots.map(entry => ({
      slot: entry, selection: selections.find(selection => selection.slotId === entry.id) ?? null,
    })), collection.state), { area: "starters", slot: slot.id }, selections.some(entry => entry.slotId === slot.id))) return false;
    const intent = visualIntentEpoch.current;
    const next = collectionEnabled
      ? selections.some(entry => entry.playerId === playerId && entry.slotId !== slot.id) ? null
        : [...selections.filter(entry => entry.slotId !== slot.id), { playerId, slotId: slot.id }]
      : replaceTouchlineFantasyPlayerAtSlot({ selections, slot, player });
    if (!next) { setFeedback(workflowCopy.alreadySelected); return false; }
    const nextValidation = validateTouchlineFantasyLineup({ selections: next, players: eligiblePlayers, geometry, budgetEur: marketBudgetEur, maxPlayersPerClub: snapshot.config.maxPlayersPerClub, requireComplete: false });
    if (nextValidation.issues.includes("BUDGET_EXCEEDED")) { setFeedback(workflowCopy.budgetExceeded); return false; }
    let confirmedNext = next;
    let confirmedCollection = collection.state;
    if (collectionEnabled) {
      if (!collection.state || collection.busy) return false;
      const owned = collection.state.players.find(entry => entry.playerId === playerId);
      const destination = { area: "starters" as const, slot: geometry.slots.findIndex(entry => entry.id === slot.id) };
      if (owned && (owned.area !== destination.area || owned.slot !== destination.slot)) {
        if(!await allocatePlanned({action:"move",playerId,...destination}))return false;
      }
      if (!owned && !await collection.purchase(playerId, destination)) return false;
      confirmedCollection = collection.getConfirmedState();
      if (!confirmedCollection) return false;
      if (intent !== visualIntentEpoch.current || confirmedCollection.formationCode !== geometry.formationCode) return true;
      // onSnapshot owns the squad. Do not restore the pre-request draft after
      // a debit/allocation, or overwrite a newer confirmed response.
      confirmedNext = clubStarterSelections(confirmedCollection, geometry, primaryDetails);
    } else {
      setSelections([...next]);
    }
    if (intent !== visualIntentEpoch.current) return true;
    const nextChoice = nextGuidedChoice(geometry.slots.map(entry => ({
      slot: entry, selection: confirmedNext.find(selection => selection.slotId === entry.id) ?? null,
    })), confirmedCollection);
    setActiveSlotId(nextChoice?.area === "starters" ? nextChoice.slot : null);
    if (confirmedNext.length === 11) setVisibleStep("review");
    setFeedback(null);
    return true;
  }
  async function removePlayer(playerId: string) {
    if (collectionEnabled) {
      if (editable && !saving && collectionSlotsEditable) setSquadSwap({ playerId, outsideOnly: true });
      return;
    }
    if (!editable || saving || (collectionEnabled && !collectionSlotsEditable)) return;
    const removed = selections.find((entry) => entry.playerId === playerId);
    if (!removed) return;
    const intent = visualIntentEpoch.current;
    if (!collectionEnabled) setSelections((current) => [...removeTouchlineFantasyPlayerFromSlot(current, removed.slotId)]);
    if (intent !== visualIntentEpoch.current) return;
    setActiveSlotId(removed.slotId);
    setVisibleStep("players");
    setFeedback(workflowCopy.changeNotSaved);
  }
  async function loadPersistedLineup(expectedFingerprint: string, expectedState: "DRAFT" | "CONFIRMED", expectedRelated?: string) {
    for (const delay of [0, 300, 800]) {
      if (delay) await wait(delay);
      const response = await fetch("/api/touchline-fantasy/state", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) continue;
      const payload = await response.json().catch(() => null) as (LiveState & { ok?: boolean }) | null;
      if (!payload?.ok || payload.activeGameweek?.id !== activeGameweek?.id || payload.userGameweek?.state !== expectedState || !Array.isArray(payload.selections)) continue;
      const authoritativeFingerprint = lineupFingerprint({ selectedCoachId: payload.userGameweek.selectedCoachId, formationCode: payload.userGameweek.formationCode, selections: payload.selections });
      if (authoritativeFingerprint !== expectedFingerprint) continue;
      if (expectedRelated !== undefined && (!payload.userGameweek.collectionRelatedSnapshot
        || clubRelatedFingerprint(payload.userGameweek.collectionRelatedSnapshot) !== expectedRelated)) continue;
      setLive(payload);
      setSelectedCoachId(payload.userGameweek.selectedCoachId);
      setFormationCode(payload.userGameweek.formationCode);
      setSelections([...payload.selections]);
      return true;
    }
    return false;
  }
  async function save(action: "draft" | "confirm") {
    if (!activeGameweek || !roundEditable || !selectedCoachId || !formationCode) return;
    if (collectionEnabled && (!collection.ready || !collection.state || collection.busy)) return;
    if (selections.some((selection) => !canBrowseMarketClub(marketPolicy, findTouchLineClub(catalogueById.get(selection.playerId)?.clubName)?.teamId))) {
      return setFeedback(marketPlanLockCopy);
    }
    if (action === "confirm" && !validation?.valid) return setFeedback(workflowCopy.fixXI);
    setSaving(true); setFeedback(null);
    const expectedFingerprint = lineupFingerprint({ selectedCoachId, formationCode, selections });
    const expectedRelated = collectionEnabled && collection.state ? clubRelatedFingerprint(collection.state.players) : undefined;
    try {
      const response = await fetch("/api/touchline-fantasy/lineup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameweekId: activeGameweek.id, selectedCoachId, formationCode, selections, action,
        idempotencyKey: collectionEnabled ? crypto.randomUUID() : newIdempotencyKey(action),
        ...(collectionEnabled&&collection.state?{collectionRevision:collection.state.revision,
          expectedAccountId:initialSnapshot?.userId,expectedSeasonId:collection.state.seasonId}:{}) }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return setFeedback(lineupErrorCopy(String(payload?.error ?? ""), locale, draftLocalesEnabled));
      const verified = await loadPersistedLineup(expectedFingerprint, action === "confirm" ? "CONFIRMED" : "DRAFT", expectedRelated);
      if (!verified) return setFeedback(workflowCopy.saveUnconfirmed);
      setFeedback(action === "confirm" ? (workflowCopy.confirmVerified) : (workflowCopy.draftVerified));
      if (action === "confirm") setVisibleStep("locked");
    } catch {
      setFeedback(workflowCopy.saveConnectionFailed);
    } finally {
      setSaving(false);
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const selectedPlayerClub = TOUCHLINE_ENGLAND_CLUBS_BY_RANK.find((club) => club.teamId === playerClubTeamId) ?? TOUCHLINE_ENGLAND_CLUBS_BY_RANK[0] ?? null;
  const selectedPlayerClubLocked = !canBrowseMarketClub(marketPolicy, selectedPlayerClub?.teamId);
  const selectedCoachClub = TOUCHLINE_ENGLAND_CLUBS_BY_RANK.find((club) => club.teamId === coachClubTeamId) ?? TOUCHLINE_ENGLAND_CLUBS_BY_RANK[0] ?? null;
  const filtered = snapshot.catalogue.filter((card) => {
    const selected = selections.some((entry) => entry.playerId === (card.canonicalPlayerId ?? card.id));
    const cardClub = findTouchLineClub(card.clubName);
    return !selected
      && canBrowseMarketClub(marketPolicy, cardClub?.teamId)
      && marketSlotAccepts(activeSlot ?? null, card)
      // Both entry points constrain the catalogue to the selected position
      // and canonical club identity.
      && cardClub?.teamId === selectedPlayerClub?.teamId
      && (!normalizedQuery || `${card.name} ${card.position}`.toLowerCase().includes(normalizedQuery));
  });
  const filteredCoaches = snapshot.coaches.filter((entry) => entry.selectable !== false && findTouchLineClub(entry.clubName)?.teamId === selectedCoachClub?.teamId
    && (!normalizedQuery || `${entry.coach.displayName} ${entry.clubName}`.toLowerCase().includes(normalizedQuery))
    // A confirmed vacancy must not fall through to the legacy checkout. The
    // collection's dedicated coach command is required before offering a hire.
    && (!collectionEnabled || !collection.state || collection.canHireCoach || entry.id === collection.state.coach?.id));
  // The review catalogue stays available when closed, including cards already
  // in the XI. Browsing never calls the lineup mutation functions.
  const browseCards = snapshot.catalogue.filter((card) => (
    canBrowseMarketClub(marketPolicy, findTouchLineClub(card.clubName)?.teamId)
    && (collectionEnabled && marketPage ? Boolean(collectionDestination && collection.state && geometry
      && collectionMarketPlayerFits(collectionDestination, collection.state, geometry, card.canonicalPlayerId ?? card.id, primaryDetails[card.canonicalPlayerId ?? card.id], primaryDetails))
      : marketPage ? Boolean(activeSlot) && marketSlotAccepts(activeSlot, card) : touchlineMarketPositionBucket(card.position, canonicalRosterRole(card.role)) === browsingPosition)
    && findTouchLineClub(card.clubName)?.teamId === selectedPlayerClub?.teamId
    && (!normalizedQuery || `${card.name} ${card.position}`.toLowerCase().includes(normalizedQuery))
  ));
  const currentAlerts = live?.lineupAlerts ?? snapshot.lineupAlerts;
  // A failed fresh read must not restore an older match's badge from SSR.
  const currentMatchCards = live?.matchCardIndicators ?? [];
  const currentAvailability = live?.playerAvailabilityIndicators ?? [];

  // My Club is a club command centre, not the legacy step-by-step Gameweek
  // wizard. The same canonical eligibility and persistence code remains in
  // charge; only the authenticated presentation changes.
  if (embedded) {
    const browsingCoaches = marketPage && !selectedCoach;
    const marketSearchLabel = browsingCoaches ? workflowCopy.chooseCoach : workflowCopy.searchPlayer;
    const selectedCards = displayGeometry?.slots.map((slot) => ({
      slot,
      selection: selections.find((entry) => entry.slotId === slot.id) ?? null,
    })) ?? [];
    const selectedCount = selectedCards.filter(({ selection }) => selection).length;
    const collectionPlan = collectionSlotPlan(geometry, collection.state?.players, primaryDetails);
    const destinationPosition = (destination: CollectionDestination) => collectionPlan?.[destination.area]?.[destination.slot] ?? null;
    const chooseCollectionPlace = (destination: CollectionDestination) => {
      if (!editable || saving || !collectionSlotsEditable) return;
      const owned = collection.state?.players.find(p => p.area === destination.area && p.slot === destination.slot);
      if (owned) {
        visualIntentEpoch.current++; collectionMarketIntentRef.current = null;
        setCollectionDestination(null); setCollectionMarketPlayer(null);
        setSquadSwap({ playerId: owned.playerId, outsideOnly: false });
      }
      else {
        if (!collection.state || !geometry || !canUseCollectionDestination(destination)) return;
        const intent = createCollectionMarketIntent(collection.state, geometry, snapshot.userId, destination, primaryDetails);
        if (!intent) return;
        visualIntentEpoch.current++;
        collectionMarketIntentRef.current = intent; setCollectionDestination(intent); setCollectionMarketPlayer(null);
        setArenaOpen(false); setActiveSlotId(destination.area === "starters" ? geometry.slots[destination.slot].id : null);
        setBrowsePosition(null); setVisibleStep("players"); setQuery("");
        scrollToLineupSection("my-club-player-selection");
      }
    };
    const guidedChoice = marketPage && selectedCoach && geometry && editable && !saving
      && (!collectionEnabled || collectionSlotsEditable)
      ? nextGuidedChoice(selectedCards, collection.state) : null;
    const canUseCollectionDestination = (destination: CollectionDestination) => {
      if (!editable || saving || !collectionSlotsEditable) return false;
      if (destination.area !== "starters" && !destinationPosition(destination)) return false;
      if (!marketPage) return true;
      const occupied = Boolean(collection.state?.players.some(player => player.area === destination.area && player.slot === destination.slot));
      if (destination.area === "starters") {
        const slotId = geometry?.slots[destination.slot]?.id;
        return Boolean(slotId && canChooseGuidedSlot(guidedChoice, { area: "starters", slot: slotId }, occupied));
      }
      return canChooseGuidedSlot(guidedChoice, destination as { area: "reserves" | "outside"; slot: number }, occupied);
    };
    const budgetExhausted = validation?.budgetRemainingEur !== null
      && validation?.budgetRemainingEur !== undefined
      && validation.budgetRemainingEur <= 0
      && selectedCount < 11;
    // Selecting a slot always opens the tactical selector. The premium card
    // board is the default overview, while the field remains the deliberate,
    // visible way to place or replace a player by position.
    const openTacticalSelector = (slotId: string) => {
      if (collectionEnabled && geometry) {
        const slot = geometry.slots.findIndex(entry => entry.id === slotId);
        if (slot >= 0) chooseCollectionPlace({area:"starters",slot});
        return;
      }
      if (marketPage && !selections.some(entry => entry.slotId === slotId)
        && !(guidedChoice?.area === "starters" && guidedChoice.slot === slotId)) return;
      if (!selectedCoach || !geometry) {
        scrollToLineupSection("my-club-player-selection");
        return;
      }
      visualIntentEpoch.current++;
      setArenaOpen(false);
      setActiveSlotId(slotId);
      setBrowsePosition(null);
      setVisibleStep("players");
      setSquadView("tactical");
      setQuery("");
      scrollToLineupSection("my-club-player-selection");
    };
    const replaceMyClubPlayer = (playerId: string, slotId: string) => {
      if (!editable || saving || (collectionEnabled && !collectionSlotsEditable) || !selections.some((entry) => entry.playerId === playerId && entry.slotId === slotId)) return;
      if (collectionEnabled) { setSquadSwap({ playerId, outsideOnly: false }); return; }
      openTacticalSelector(slotId);
    };
    const selectMyClubPlayer = async (card: ClubOwnerSquadCard) => {
      if (collectionEnabled) return;
      if (!activeSlot || (!marketPage && browseSlot?.id !== activeSlot.id)) return;
      const intent = visualIntentEpoch.current;
      if (!await addPlayer(card)) return;
      if (intent !== visualIntentEpoch.current) return;
      setBrowsePosition(null);
      setSquadView("tactical");
      scrollToLineupSection("my-club-xi-pitch");
    };
    const cancelCollectionMarket = () => {
      visualIntentEpoch.current++; collectionMarketIntentRef.current = null;
      setCollectionDestination(null); setCollectionMarketPlayer(null);
      scrollToLineupSection("my-club-xi-pitch");
    };
    const confirmCollectionMarket = async () => {
      const intent = collectionDestination, playerId = collectionMarketPlayer;
      if (!intent || collectionMarketIntentRef.current !== intent || !playerId || collectionMarketSending.current || !geometry || !collection.state
        || !canUseCollectionDestination(intent) || !collectionMarketIntentCurrent(intent, collection.state, geometry, snapshot.userId, primaryDetails)
        || !collectionMarketPlayerFits(intent, collection.state, geometry, playerId, primaryDetails[playerId], primaryDetails)) return;
      const card = catalogueById.get(playerId), price = card?.editorialCard?.marketValueEur;
      if (!card || !canBrowseMarketClub(marketPolicy, findTouchLineClub(card.clubName)?.teamId)
        || !Number.isSafeInteger(price) || !price || price <= 0 || price > collection.state.balanceEur) return;
      const epoch = visualIntentEpoch.current;
      collectionMarketSending.current = true;
      try {
        if (!await collection.purchase(playerId, {area:intent.area,slot:intent.slot})) return;
        if (epoch !== visualIntentEpoch.current || !collectionMarketPurchaseConfirmed(intent, collectionMarketIntentRef.current, collection.getConfirmedState(), playerId, snapshot.userId)) return;
        collectionMarketIntentRef.current = null; setCollectionDestination(null); setCollectionMarketPlayer(null);
        setSquadView("tactical"); setFeedback(null); scrollToLineupSection("my-club-xi-pitch");
      } finally { collectionMarketSending.current = false; }
    };
    const reviewBudgetRecovery = () => {
      setArenaOpen(false);
      setSquadView("tactical");
      scrollToLineupSection("my-club-xi-pitch");
    };
    const explorePlanRecovery = () => {
      const planHeader = document.querySelector<HTMLElement>("[data-clubowner-header='true']");
      if (!planHeader) return;
      planHeader.focus({ preventScroll: true });
      planHeader.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    };
    const formationPicker = <details className={styles.formationPicker} data-guided-action={marketPage && selectedCoach && !formationCode && editable && !saving && (!collectionEnabled || collectionSlotsEditable) ? "true" : undefined}>
      <summary>{workflowCopy.chooseFormation}<strong>{formationCode ?? "—"}</strong></summary>
      <div className={styles.formationSelectionPanel}>
      {selectedCoach ? <div className={styles.formationCoachPreview} aria-label={workflowCopy.technicalArea}>
        <FantasyCoachZoom entry={selectedCoach} locale={locale} draftLocalesEnabled={draftLocalesEnabled} eager />
      </div> : null}
      <div className={styles.formationChoices} aria-label={workflowCopy.formationSelectionAria}>
        {Object.entries(snapshot.formationRegistry).map(([code, shape]) => <button type="button" key={code} disabled={!editable || saving || !selectedCoach || (collectionEnabled && !collectionSlotsEditable)} aria-pressed={formationCode === code} onClick={() => changeFormation(code)}>
          <svg viewBox="0 0 105 68" aria-hidden="true"><rect x="2" y="2" width="101" height="64" rx="3" /><path d="M52.5 2v64" /><circle cx="52.5" cy="34" r="9" />{shape.slots.map((slot) => <circle key={slot.id} className={styles.formationDot} cx={slot.x * 1.05} cy={(100 - slot.y) * .68} r="2.4" />)}</svg>
          <b>{code}</b>
          <small>11 {workflowCopy.slots}</small>
        </button>)}
      </div>
      </div>
      <small>{marketStatusLabel}</small>
    </details>;
    const squadHeader = <header className={styles.myClubSquadHeader} data-formation-toolbar={marketPage && !arenaOpen ? "true" : undefined}>
      <div><span>{arenaOpen ? workflowCopy.arenaMode : workflowCopy.startingXI}</span><strong>{selectedCount}/11 · {formationCode}</strong></div>
      {marketPage && !arenaOpen ? formationPicker : null}
      <button type="button" className={styles.viewToggle} data-arena-open={!arenaOpen ? "true" : undefined} aria-expanded={arenaOpen} onClick={() => setArenaOpen((current) => !current)}>{arenaOpen ? workflowCopy.closeArena : workflowCopy.arenaMode}</button>
    </header>;
    const coachSelection = <section className={styles.myClubSetup} data-my-club-setup="coach" aria-label={workflowCopy.coachSelectionAria}>
      <header><span>{workflowCopy.step1}</span><h2>{workflowCopy.chooseYourCoach}</h2><p>{workflowCopy.coachInstruction}</p></header>
      <CompactClubSelector mode="coach" selectedTeamId={selectedCoachClub?.teamId ?? ""} onSelect={(club) => setCoachClubTeamId(club.teamId)} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
      <div className={styles.myClubCoachResults}>{filteredCoaches.map((entry) => <article key={entry.id}><span><FantasyCoachZoom entry={entry} locale={locale} draftLocalesEnabled={draftLocalesEnabled} eager /></span><div><strong>{entry.coach.displayName}</strong><CompactClubIdentity clubName={entry.clubName} clubLogoUrl={entry.clubLogoUrl} /></div><button type="button" disabled={!editable || saving} onClick={() => { if (!editable || saving) return; setSelectedCoachId(entry.id); setVisibleStep("formation"); setFeedback(workflowCopy.coachChosen); }}>{workflowCopy.chooseCoach}</button></article>)}{filteredCoaches.length === 0 ? <p>{workflowCopy.noCoach}</p> : null}</div>
    </section>;
    return <section className={styles.myClubCommand} data-fantasy-context={marketPage ? "market" : "my-club"} data-plan-theme={snapshot?.entitlementActive === true ? marketPolicy?.planKey : undefined} data-market-state={activeGameweek?.state ?? "unknown"} aria-label={marketPage ? (workflowCopy.playAria) : (workflowCopy.commandAria)}>
      {roundRecoveryPending && marketPage ? <TouchlineFantasyRoundContinuity key={`${snapshot.userId}:${activeGameweek!.id}`}
        startAllowed={!collectionEnabled || (collection.ready && !collection.busy && !collection.hasPending)}
        accountId={snapshot.userId} gameweekId={activeGameweek!.id} locale={locale} draftLocalesEnabled={draftLocalesEnabled}
        onReady={applyIncomingRound} /> : null}
      {collectionEnabled && collection.error ? <div role="alert"><p>{collection.error}</p><button type="button" className={controls.link} disabled={collection.busy} onClick={collection.reload}>{collectionBudgetCopy.refreshSquad}</button></div> : null}
      {collectionEnabled && collection.hasPending ? <button type="button" className={controls.link} disabled={collection.busy || !collection.ready}
        onClick={collection.retryPending}>{collection.pendingRecoveryOnly ? collectionBudgetCopy.refreshSquad : collectionBudgetCopy.confirmPendingOperation}</button> : null}
      {collectionEnabled && collection.state ? <output>{collectionBudgetCopy.squadBalance}: {new Intl.NumberFormat(locale).format(collection.state.balanceEur)} TC
        {collection.state.balanceEur<=1_000_000?<span role="status"> · {collectionBudgetCopy.lowBalance}</span>:null}</output>:null}
      {coachReleaseAction && coachReleaseReview
        && coachReleaseReview.accountId === snapshot.userId
        && coachReleaseReview.seasonId === collection.state?.seasonId
        && selectedCoach?.id === coachReleaseReview.id
        && collection.state?.coach?.id === coachReleaseReview.id ? <ClubOwnerCoachReleaseDialog
          key={`${coachReleaseReview.accountId}:${coachReleaseReview.seasonId}:${coachReleaseReview.id}`}
          state={collection.state} coachName={selectedCoach.coach.displayName}
          locale={locale} available={collection.coachLifecycleAvailable && editable && !saving} busy={collection.busy} error={collection.error}
          onConfirm={(coachId, revision) => editable && !saving ? collection.changeCoach("release-coach", coachId, revision) : Promise.resolve(false)}
          onClose={() => setCoachReleaseReview(null)} /> : null}
      {collectionEnabled && releasePlayerId && collection.state?.players.some(player => player.playerId === releasePlayerId) ? <ClubOwnerReleaseDialog
        key={releasePlayerId} state={collection.state} playerId={releasePlayerId}
        card={snapshot.catalogue.find(card => (card.canonicalPlayerId ?? card.id) === releasePlayerId)}
        ownerName={clubOwner?.name}
        playerName={snapshot.catalogue.find(card => (card.canonicalPlayerId ?? card.id) === releasePlayerId)?.name ?? (locale.startsWith("pt") ? "Jogador do elenco" : "Squad player")}
        locale={locale} enabled={editable && !saving && collectionSlotsEditable} available={collection.releaseAvailable}
        busy={collection.busy} pending={collection.hasPending} error={collection.error} onClose={() => setReleasePlayerId(null)}
        onConfirm={(playerId, revision) => editable && !saving && collectionSlotsEditable ? collection.release(playerId, revision) : Promise.resolve(false)} /> : null}
      {collectionEnabled && squadSwap && collection.state && geometry ? <ClubOwnerSquadSwapDialog liveSeasonRating
        key={`${squadSwap.playerId}:${squadSwap.outsideOnly}`} state={collection.state} playerId={squadSwap.playerId} outsideOnly={squadSwap.outsideOnly}
        catalogue={snapshot.catalogue} geometry={geometry} locale={locale} draftLocalesEnabled={draftLocalesEnabled} busy={collection.busy}
        enabled={editable && !saving && collectionSlotsEditable} error={collection.error} onClose={() => setSquadSwap(null)}
        onMove={(playerId, destination) => editable && !saving && collectionSlotsEditable
          ? allocatePlanned({ action: "move", playerId, ...destination }) : Promise.resolve(false)} /> : null}
      {collectionEnabled && placementPlayerId && collection.state && geometry ? <ClubOwnerPlayerPlacementDialog
        key={placementPlayerId} state={collection.state} playerId={placementPlayerId} catalogue={snapshot.catalogue} geometry={geometry} locale={locale} draftLocalesEnabled={draftLocalesEnabled}
        busy={collection.busy} enabled={editable && !saving && collectionSlotsEditable} error={collection.error} onClose={() => setPlacementPlayerId(null)}
        onMove={slot => editable && !saving && collectionSlotsEditable
          ? allocatePlanned({ action: "move", playerId: placementPlayerId, area: "starters", slot }) : Promise.resolve(false)} /> : null}
      {!snapshot.entitlementActive ? <p role="status">{getTouchlineBetaEnrollmentCopy(locale, draftLocalesEnabled).review}</p> : null}
      <FantasyBudgetNotice editable={editable} remainingBudget={validation?.budgetRemainingEur ?? null} selectedCount={selections.length} attemptedOverBudget={feedback === workflowCopy.budgetExceeded} locale={locale} draftLocalesEnabled={draftLocalesEnabled} collectionEnabled={collectionEnabled} collectionState={collection.state} collectionReady={collectionSlotsEditable} onReviewXI={reviewBudgetRecovery} onExplorePlans={explorePlanRecovery} />
      {marketPage ? <dl className={styles.ownerSummary} data-market-owner-metrics="true" aria-label={marketMetricsCopy.summaryAria}>
        <div><dt>{marketMetricsCopy.roundPoints}</dt><dd><Link href={`/rankings?lang=${encodeURIComponent(locale)}`} aria-label={marketMetricsCopy.roundPointsAria}>{(live?.gameweekScore ?? snapshot.gameweekScore).toFixed(2)}</Link></dd></div>
        <div><dt>{marketMetricsCopy.seasonPoints}</dt><dd><Link href={`/rankings?lang=${encodeURIComponent(locale)}`} aria-label={marketMetricsCopy.seasonPointsAria}>{(live?.seasonScore ?? snapshot.seasonScore).toFixed(2)}</Link></dd></div>
      </dl> : null}
      {!(marketPage && selectedCoach && formationCode) ? <section className={styles.myClubMarketStatus} data-market-open={marketOpen ? "true" : "false"} aria-label={marketAccessCopy.statusAria}>
        <div><span>{marketAccessCopy.lineupWindow}</span>{!marketPage ? <strong>{marketStatusLabel}</strong> : null}<small>{editable ? marketAccessCopy.manageXI : marketAccessCopy.browseReadOnly}</small><p className={styles.myClubMarketRule}>{marketAccessCopy.windowRule}</p></div>
        {qaClubMarketOpen ? <aside className={styles.marketClock} role="status"><strong>{collectionBudgetCopy.qaMarketOpen}</strong><p>{collectionBudgetCopy.qaRulesNotice}</p></aside> : <MarketWindowClock gameweeks={gameweeks} locale={locale} draftLocalesEnabled={draftLocalesEnabled} marketStatus={marketPage ? marketStatusLabel : undefined} />}
      </section> : null}
      {!(marketPage && selectedCoach && formationCode) ? <header className={styles.myClubCommandHeader}>
        <div>
          <span>{workflowCopy.myXI}</span>
          <h1>{formationCode ?? (workflowCopy.setFormation)}</h1>
          {!(marketPage && selectedCoach && formationCode && editable) ? <p>{!selectedCoach
            ? (workflowCopy.chooseCoachFirst)
            : collectionEnabled && !collection.state
              ? (collectionBudgetCopy.confirmCoachToUnlockFormation)
            : !formationCode
              ? (workflowCopy.chooseFormationFirst)
              : editable ? (workflowCopy.editInstruction) : (workflowCopy.readOnlyInstruction)}</p> : null}
        </div>
        {!marketPage ? <div className={styles.myClubCommandStatus} data-round-frame="true">
          <span>{workflowCopy.round}</span><strong>{activeGameweek?.number ?? "—"}</strong>
          <small>{statusCopy(activeGameweek?.state, locale, draftLocalesEnabled)}</small>
        </div> : null}
      </header> : null}
      {!marketPage && !selectedCoach ? coachSelection : !marketPage && !formationCode ? <section className={styles.myClubSetup} data-my-club-setup="formation" aria-label={workflowCopy.formationSelectionAria}>
        <header><span>{workflowCopy.step2}</span><h2>{workflowCopy.chooseFormation}</h2><p>{workflowCopy.formationInstruction}</p></header>
        <div className={styles.myClubFieldCoach} aria-label={workflowCopy.technicalArea}>
          {selectedCoach ?
          <div className={styles.technicalCoachCard} style={{ width: pitchCardWidth * 1.3 }}><FantasyCoachZoom frameDisplayWidth={pitchCardWidth * 1.3} entry={selectedCoach} locale={locale} draftLocalesEnabled={draftLocalesEnabled} eager /><span>{workflowCopy.coach}</span></div>
          : null}
          {formationPicker}
        </div>
      </section> : <div className={styles.myClubCommandGrid}>
        <ArenaView expanded={arenaOpen} label={workflowCopy.arenaMode} onClose={() => setArenaOpen(false)}>
        <section className={styles.myClubSquad} id="my-club-xi-pitch" tabIndex={-1} data-market-starting-xi="true" aria-label={workflowCopy.xiLinesAria}>
          {collectionEnabled && selectedCoach && (!collection.state || collection.state.coach === null) ? <section aria-label={collectionBudgetCopy.confirmCoach} data-coach-confirmation="true">
            <p role="status">{collectionBudgetCopy.coachPendingConfirmation}</p>
            <p>{selectedCoach.coach.displayName} · {Object.hasOwn(CLUB_COACH_VALUES, selectedCoach.slot.cardTier) ? `${new Intl.NumberFormat(locale).format(CLUB_COACH_VALUES[selectedCoach.slot.cardTier as keyof typeof CLUB_COACH_VALUES])} TC` : "—"}</p>
            <button type="button" className={controls.link} disabled={!editable || (!collection.canInitialize && !collection.canHireCoach)}
              onClick={() => collection.state?.coach === null ? collection.changeCoach("hire-coach", selectedCoach.id, collection.state.revision) : collection.initialize(selectedCoach.id)}>{collection.busy ? collectionBudgetCopy.confirmingSigning : collectionBudgetCopy.confirmSigning}</button>
            <button type="button" className={controls.link} disabled={collection.busy || (!collection.canInitialize && !collection.canHireCoach)}
              onClick={() => { if (!collection.canInitialize && !collection.canHireCoach) return; setSelectedCoachId(null); setQuery(""); setVisibleStep("coach"); }}>
              {collectionBudgetCopy.cancelCoachSelection}
            </button>
          </section> : null}
          {arenaOpen || marketPage ? null : squadHeader}
          {<>
            <div className={styles.arenaBody}>
            <div className={styles.arenaLiveRail} data-clubowner-live-position="above-reserves">
              <ClubHubFixtureStrip initialFixtures={initialLiveFixtures} initialAdmissionScope={initialLiveAdmissionScope} initialNow={initialLiveNow} initialTimeZone={liveTimeZone} locale={resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)} draftLocalesEnabled={draftLocalesEnabled} initialMetadata={initialLiveMetadata} />
            </div>
            <div className={styles.myClubPitchViewport} ref={pitchViewportRef}>
              {!arenaOpen && (selectedCoach || marketPage) ? <ClubOwnerTechnicalRail enabled={showCollectionStructure} cardWidth={pitchCardWidth} label={workflowCopy.technicalArea}>
              <div className={`${styles.myClubFieldCoach} ${showCollectionStructure ? collectionLayout.technicalRow : ""}`} aria-label={workflowCopy.technicalArea}>
                {showCollectionStructure ? <ClubOwnerCollectionSlots liveSeasonRating state={collection.state} catalogue={snapshot.catalogue} draftLocalesEnabled={draftLocalesEnabled}
                  slotPositions={CLUB_RESERVE_POSITIONS}
                  area="reserves" start={0} count={4} locale={locale} displayWidth={pitchCardWidth} guidedSlot={guidedChoice?.area === "reserves" ? guidedChoice.slot : undefined} enabled={editable && collectionSlotsEditable} onChoose={chooseCollectionPlace} onFieldPlayer={playerId => setSquadSwap({ playerId, outsideOnly: false })} onOutsidePlayer={playerId => setSquadSwap({ playerId, outsideOnly: true })} onReleasePlayer={setReleasePlayerId} /> : null}
                <div className={styles.technicalCoachCard} data-technical-coach="true" style={{ width: pitchCardWidth * 1.3 }}>{selectedCoach ? <FantasyCoachZoom frameDisplayWidth={pitchCardWidth * 1.3} entry={selectedCoach} locale={locale} draftLocalesEnabled={draftLocalesEnabled} releaseAction={coachReleaseAction} eager /> : <button type="button" className={styles.emptyPosition} data-collection-placeholder="true" data-guided-action={editable && !saving && (!collectionEnabled || collection.canInitialize || collection.canHireCoach) ? "true" : undefined} disabled={!editable || saving || (collectionEnabled && !collection.canInitialize && !collection.canHireCoach)} aria-label={workflowCopy.chooseCoach} aria-controls="my-club-player-selection" onClick={() => scrollToLineupSection("my-club-player-selection")}>+</button>}<span>{workflowCopy.coach}</span></div>
                {showCollectionStructure ? <ClubOwnerCollectionSlots liveSeasonRating state={collection.state} catalogue={snapshot.catalogue} draftLocalesEnabled={draftLocalesEnabled}
                  slotPositions={CLUB_RESERVE_POSITIONS}
                  area="reserves" start={4} count={5} locale={locale} displayWidth={pitchCardWidth} guidedSlot={guidedChoice?.area === "reserves" ? guidedChoice.slot : undefined} enabled={editable && collectionSlotsEditable} onChoose={chooseCollectionPlace} onFieldPlayer={playerId => setSquadSwap({ playerId, outsideOnly: false })} onOutsidePlayer={playerId => setSquadSwap({ playerId, outsideOnly: true })} onReleasePlayer={setReleasePlayerId} /> : null}
                {!marketPage && !showCollectionStructure ? formationPicker : null}
              </div>
              <div className={`${styles.myClubTechnicalLine} ${showCollectionStructure ? collectionLayout.technicalLine : ""}`} aria-label={workflowCopy.technicalArea}>
                <span>{workflowCopy.technicalArea}</span>
              </div>
              </ClubOwnerTechnicalRail> : null}
              {!arenaOpen && showCollectionStructure && !marketPage ? formationPicker : null}
              {marketPage && !arenaOpen ? squadHeader : null}
              {arenaOpen ? <div className={styles.arenaToolbar} data-arena-toolbar="true">
                  <div className={styles.arenaFormationControl} data-arena-formation="true">
                    {formationPicker}
                  </div>
                  <div className={styles.arenaHudRight} data-arena-hud-right="true">
                    <button type="button" className={styles.viewToggle} data-arena-close="true" aria-expanded="true" onClick={() => setArenaOpen(false)}>{workflowCopy.closeArena}</button>
                    <output className={styles.arenaRoundPoints} data-arena-round-points="true" aria-live="polite" aria-atomic="true" dir="auto">
                      <span>{marketMetricsCopy.roundPoints}</span>
                      <strong>{(live?.gameweekScore ?? snapshot.gameweekScore).toLocaleString(resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </output>
                  </div>
                  {selectedCoach ? <div className={styles.arenaCoach} data-arena-coach="true" aria-label={workflowCopy.technicalArea}>
                    <div style={{ width: pitchCardWidth }}><FantasyCoachZoom frameDisplayWidth={pitchCardWidth} entry={selectedCoach} locale={locale} draftLocalesEnabled={draftLocalesEnabled} releaseAction={coachReleaseAction} eager /></div>
                    <span>{workflowCopy.coach}</span>
                  </div> : null}
              </div> : null}
              <TouchlinePitchSurface className={styles.myClubTacticalPitch} ariaLabel={workflowCopy.pitchAria} orientation="horizontal" surfaceVariant="smoked-glass">
                {selectedCards.map(({ slot, selection }) => {
                const card = selection ? catalogueById.get(selection.playerId) : null;
                const availability = selection ? currentAvailability.filter((entry) => entry.playerId === selection.playerId) : [];
                const matchCard = selection ? currentMatchCards.filter((event) => event.playerId === selection.playerId)
                  .sort((first, second) => Number(second.kind === "red") - Number(first.kind === "red"))[0] : null;
                return <div key={slot.id} className={styles.myClubTacticalSlot} data-arena-slot={slot.id} data-pitch-edge={slot.x >= 75 ? "end" : undefined} style={{ ...horizontalMyClubPitchPosition(slot), width: Math.max(44, pitchCardWidth) }}>
<span style={{ width: pitchCardWidth, "--touchline-card-static-scale": pitchCardWidth / 430 } as CSSProperties}>{card ? <TouchlineGameweekCard liveSeasonRating card={card} locale={locale} draftLocalesEnabled={draftLocalesEnabled} compact displayWidth={pitchCardWidth} replacementAction={selection ? { label: `${workflowCopy.replace} · ${card.name}`, disabled: !editable || saving || (collectionEnabled && !collectionSlotsEditable), onSelect: () => replaceMyClubPlayer(selection.playerId, slot.id) } : undefined} removalAction={selection ? { label: `${workflowCopy.remove} · ${card.name}`, disabled: !editable || saving || (collectionEnabled && !collectionSlotsEditable), onSelect: () => removePlayer(selection.playerId) } : undefined} releaseAction={selection && collectionEnabled ? { label: locale.startsWith("pt") ? "Liberar jogador" : "Release player", disabled: !editable || saving || !collectionSlotsEditable, onSelect: () => { if (editable && !saving && collectionSlotsEditable) setReleasePlayerId(selection.playerId); } } : undefined} lockedReason={selection && !editable ? lockedZoomReason : undefined} /> : marketPage || marketOpen ? budgetExhausted ? <button type="button" className={styles.emptyPosition} disabled aria-label={`${getTouchlineFantasyMarketBudgetCopy(locale, draftLocalesEnabled).exhausted} · ${slot.id}`}><LockKeyhole size={16} aria-hidden="true" /></button> : <button type="button" className={styles.emptyPosition} data-collection-placeholder={marketPage ? "true" : undefined} data-guided-action={guidedChoice?.area === "starters" && guidedChoice.slot === slot.id ? "true" : undefined} disabled={!editable || saving || !selectedCoach || !geometry || (collectionEnabled && !collectionSlotsEditable) || (marketPage && !(guidedChoice?.area === "starters" && guidedChoice.slot === slot.id))} aria-label={`${workflowCopy.choosePlayer} · ${slot.id}`} aria-controls="my-club-player-selection" onClick={() => openTacticalSelector(slot.id)}>+</button> : null}</span>
                  {card && matchCard ? <div className={styles.myClubMatchCardBadge}>
                    <TouchlineMatchCardBadge kind={matchCard.kind} playerName={card.name} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
                  </div> : null}
                  {card && availability.length === 1 ? <div className={styles.myClubAvailabilityBadge}>
                    <TouchlinePlayerAvailabilityBadge badge={availability[0].badge} locale={resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)} />
                  </div> : null}
                  <b>{slot.id}</b>
                  {!editable ? <small className={styles.marketClosedLabel}>{marketAccessLabel}</small> : null}
                </div>;
              })}</TouchlinePitchSurface>
              {showCollectionStructure && !arenaOpen ? <section className={`${collectionLayout.outside} ${collectionLayout.exchange}`} aria-label="ClubOwner Exchange">
                <ClubOwnerNegotiationRoom locale={locale} draftLocalesEnabled={draftLocalesEnabled} ownerName={clubOwner?.name} plan={collection.state?.plan} agentNotice={<ClubOwnerExchangeHub locale={locale} draftLocalesEnabled={draftLocalesEnabled} expectedAccountId={snapshot.userId} onCommitted={collection.reload} ownerName={clubOwner?.name} plan={collection.state?.plan} state={collection.state} ready={collection.ready && !collection.busy && !collection.hasPending} catalogue={snapshot.catalogue} />}>
                {!collection.state ? <p role="status">{collectionBudgetCopy.fullSquadRecruitmentUnavailable}</p> : null}
                <ClubOwnerCollectionSlots liveSeasonRating state={collection.state} catalogue={snapshot.catalogue} draftLocalesEnabled={draftLocalesEnabled} area="outside" count={15} grouped imageLoading="lazy"
                  slotPositions={collectionPlan?.outside}
                  guidedSlot={guidedChoice?.area === "outside" ? guidedChoice.slot : undefined}
                  locale={locale} displayWidth={Math.max(70, pitchCardWidth)} enabled={editable && collectionSlotsEditable} onChoose={chooseCollectionPlace} onFieldPlayer={playerId => setSquadSwap({ playerId, outsideOnly: false })} onReleasePlayer={setReleasePlayerId} />
                <p>{collectionBudgetCopy.outsideSlotsExchangeNotice}</p>
                </ClubOwnerNegotiationRoom>
              </section> : null}
            </div>
            </div>
            <nav className={styles.myClubMobileSlotNav} aria-label={workflowCopy.browsePosition}>
              {selectedCards.map(({ slot, selection }) => {
                const card = selection ? catalogueById.get(selection.playerId) : null;
                return <button type="button" key={slot.id} onClick={() => openTacticalSelector(slot.id)} data-active={activeSlot?.id === slot.id ? "true" : undefined}>
                  <b>{slot.id}</b><span>{card?.shortName ?? (workflowCopy.openShort)}</span>
                </button>;
              })}
            </nav>
          </>}
        </section>
        </ArenaView>
      </div>}
      {collectionStructureVisible && marketPage && !arenaOpen ? <section className={collectionLayout.outside} aria-label={officeCopy(locale, draftLocalesEnabled).title}>
        <ClubOwnerOffice locale={locale} draftLocalesEnabled={draftLocalesEnabled}
          collection={!collectionEnabled ? { status: "unavailable" } : collection.error ? { status: "error" } : collection.ready ? { status: "ready", state: collection.state } : { status: "loading" }}
          playerLabels={catalogueById}
          renderPlayerCard={player => {
            const card = catalogueById.get(player.playerId);
            return card ? <TouchlineEliteExactCard player={squadCardToExactPlayer(card)} staticRenderScale={140 / 430}
              runtimeLocaleOverride={locale} draftLocalesEnabled={draftLocalesEnabled} subscribeToRanking={false}
              rankingMode="preview" enableInteractiveNeon={false} showCardActions={false} showProfileAction={false}
              showSocialMetrics={false} forceNeonActive /> : null;
          }} />
      </section> : null}
        <aside className={styles.myClubMarket} id="my-club-player-selection" tabIndex={-1} data-open="true" data-inline-selection="true" aria-label={workflowCopy.positionSelectionAria}>
          {marketPage ? <header className={styles.myClubMarketHeading} data-market-heading="status">
            {qaClubMarketOpen ? null : <MarketWindowClock gameweeks={gameweeks} locale={locale} draftLocalesEnabled={draftLocalesEnabled} hideAwaitingFinalHeading />}
            <button type="button" className={styles.viewToggle} onClick={() => collectionEnabled ? cancelCollectionMarket() : scrollToLineupSection("my-club-xi-pitch")}>{workflowCopy.backToPitch}</button>
          </header> : null}
          {!marketPage ? <header className={styles.myClubMarketHeading}><span>{workflowCopy.scouting}</span><h2>Market Transfer TouchLine</h2><p>{workflowCopy.exploreInstruction}</p></header> : null}
          {collectionEnabled && marketPage ? <div className={financeStyles.panel} data-club-finance-panel="true">
            <ClubOwnerBudgetCalculator locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
            <ClubOwnerValueSummary catalogue={snapshot.catalogue} locale={locale} draftLocalesEnabled={draftLocalesEnabled} />
          </div> : null}
          {collectionEnabled && collectionDestination ? <section aria-label={collectionBudgetCopy.signingDestination} data-collection-market-destination={`${collectionDestination.area}:${collectionDestination.slot}`}>
            <p>{collectionAreaLabel(collectionDestination.area, locale, draftLocalesEnabled)} · {collectionDestination.slot + 1} · {collectionDestination.position}</p>
            {!collection.ready || collection.hasPending || collection.busy ? <p role="status">{collectionBudgetCopy.waitForSquadConfirmation}</p>
              : !collectionMarketIntentCurrent(collectionDestination, collection.state, geometry, snapshot.userId, primaryDetails) ? <p role="status">{collectionBudgetCopy.squadChangedChooseSlot}</p> : null}
            {collection.error ? <p role="alert">{collection.error}</p> : null}
            <button type="button" className={controls.link} disabled={collection.busy} onClick={collection.reload}>{collectionBudgetCopy.refreshSquad}</button>
          </section> : null}
          <label className={styles.myClubSearch}><Search aria-hidden="true" /><span className={styles.srOnly}>{marketSearchLabel}</span><input value={query} onChange={(event) => changeMarketQuery(event.target.value)} placeholder={marketSearchLabel} /></label>
          <CompactClubSelector mode={browsingCoaches ? "coach" : "player"} selectedTeamId={(browsingCoaches ? selectedCoachClub : selectedPlayerClub)?.teamId ?? ""} onSelect={(club) => browsingCoaches ? setCoachClubTeamId(club.teamId) : setPlayerClubTeamId(club.teamId)} locale={locale} draftLocalesEnabled={draftLocalesEnabled} marketAccess={marketPolicy} lockedLabel={marketPlanLockCopy} onLockedSelect={() => setFeedback(marketPlanLockCopy)} />{!browsingCoaches && selectedPlayerClubLocked ? <p className={styles.marketPlanNotice} role="status"><LockKeyhole size={16} aria-hidden="true" />{marketPlanLockCopy}</p> : null}
          {!marketPage ? <nav className={styles.myClubPositionTabs} aria-label={workflowCopy.playerPositionsAria}>{TOUCHLINE_FANTASY_BROWSE_POSITIONS.map((position) => <button key={position.bucket} type="button" className={styles.viewToggle} aria-pressed={browsingPosition === position.bucket} aria-controls="my-club-position-results" aria-label={touchlineMarketPositionBucketLabel(position.bucket, locale, draftLocalesEnabled)} onClick={() => {
            visualIntentEpoch.current++;
            setBrowsePosition(position.bucket);
            const slot = resolveTouchlineFantasyBrowseSlot({ geometry, bucket: position.bucket, activeSlotId: activeSlot?.id ?? null, selections });
            if (slot) setActiveSlotId(slot.id);
          }}>{position.code}</button>)}</nav> : null}
          {browsingCoaches ? <>
            <header className={styles.myClubSelectionSummary} aria-live="polite"><div><span>{workflowCopy.coach}</span><h3>{workflowCopy.chooseYourCoach}</h3><p>{selectedCoachClub?.name}</p></div><p>{editable ? workflowCopy.coachInstruction : marketAccessLabel}</p></header>
            <div className={styles.myClubCoachResults} id="my-club-position-results" data-market-results="coach">
              {filteredCoaches.map((entry) => <article key={entry.id}>
                <span><FantasyCoachZoom entry={entry} locale={locale} draftLocalesEnabled={draftLocalesEnabled} eager /></span>
                <div><strong>{entry.coach.displayName}</strong><CompactClubIdentity clubName={entry.clubName} clubLogoUrl={entry.clubLogoUrl} />
                  <button type="button" disabled={!editable || saving || (collectionEnabled && !collection.canInitialize && !collection.canHireCoach)} onClick={() => {
                    if (!editable || saving || (collectionEnabled && !collection.canInitialize && !collection.canHireCoach)) return;
                    setSelectedCoachId(entry.id); setQuery(""); setVisibleStep("formation"); setFeedback(collectionEnabled ? (collectionBudgetCopy.coachSelectedConfirmBesidePitch) : workflowCopy.coachChosen);
                    scrollToLineupSection("my-club-xi-pitch");
                  }}>{workflowCopy.chooseCoach}</button>
                </div>
              </article>)}
              {filteredCoaches.length === 0 ? <p>{workflowCopy.noCoach}</p> : null}
            </div>
          </> : <>
          <header className={styles.myClubSelectionSummary} aria-live="polite" data-market-target-slot={collectionDestination ? `${collectionDestination.area}:${collectionDestination.slot}` : marketTargetSlot?.id}><div><span>{workflowCopy.playerSelection}</span><h3>{collectionDestination?.position ?? touchlineMarketPositionBucketLabel(browsingPosition, locale, draftLocalesEnabled)}</h3><p>{selectedPlayerClub?.name} · {workflowCopy.cardsInPosition.replace("{count}", () => String(browseCards.length))}</p></div><p>{collectionDestination ? `${collectionAreaLabel(collectionDestination.area, locale, draftLocalesEnabled)} · ${collectionDestination.slot + 1}` : editable && marketTargetSlot ? (workflowCopy.xiSlot.replace("{slot}", marketTargetSlot.id)) : !editable ? marketAccessLabel : (workflowCopy.browseInstruction)}</p></header>
          <div className={styles.myClubMarketResults} id="my-club-position-results">{browseCards.map((card) => {
            const targetSlot = marketPage ? activeSlot : browseSlot;
            const inLineup = selections.some((entry) => entry.playerId === (card.canonicalPlayerId ?? card.id));
            const overBudget = collectionEnabled ? !card.editorialCard?.marketValueEur || !collection.state || card.editorialCard.marketValueEur > collection.state.balanceEur : !inLineup && playerExceedsBudget(card, targetSlot);
            const tierKey = card.editorialCard?.tierKey;
            const palette = tierKey ? touchlineCardTierPalette(tierKey) : null;
            return <article key={card.canonicalPlayerId ?? card.id}
              data-market-budget-locked={overBudget || undefined}
              data-market-tier-frame={tierKey ?? "unresolved"}
              style={{ "--tier-accent": palette?.accent } as CSSProperties}>
              <TouchlineClubPerimeterTrace accent={palette?.accent} />
              <span><TouchlineGameweekCard liveSeasonRating card={card} locale={locale} draftLocalesEnabled={draftLocalesEnabled} displayWidth={126} fitContainer imageLoading="lazy"
                signingActions={collectionEnabled && collectionDestination ? {
                  select: {
                    label: collectionBudgetCopy.sign,
                    disabled: !editable || overBudget || !canUseCollectionDestination(collectionDestination) || !collectionMarketIntentCurrent(collectionDestination, collection.state, geometry, snapshot.userId, primaryDetails),
                    onSelect: () => { if (editable && !overBudget && collectionSlotsEditable && collection.state && geometry && collectionMarketIntentCurrent(collectionDestination, collection.state, geometry, snapshot.userId, primaryDetails)) setCollectionMarketPlayer(card.canonicalPlayerId ?? card.id); },
                  },
                  confirm: collectionMarketPlayer === (card.canonicalPlayerId ?? card.id) ? {
                    label: collectionBudgetCopy.confirmSigning,
                    disabled: !canUseCollectionDestination(collectionDestination) || !collectionMarketIntentCurrent(collectionDestination, collection.state, geometry, snapshot.userId, primaryDetails),
                    onSelect: confirmCollectionMarket,
                  } : undefined,
                  status: collectionMarketPlayer === (card.canonicalPlayerId ?? card.id) ? collection.error || (collection.busy || collection.hasPending ? (collectionBudgetCopy.awaitingSigningConfirmation) : null) : null,
                } : undefined} /></span>
              <div>
                <strong>{card.name}</strong><small>{localizedPositionLabel(card.position, locale, draftLocalesEnabled)}</small><em>{card.clubName}</em>
                {!editable ? <span className={styles.marketClosedLabel}>{marketAccessLabel}</span>
                  : collectionEnabled ? collectionDestination ? <button type="button" className={controls.link}
                    disabled={overBudget || !canUseCollectionDestination(collectionDestination) || !collectionMarketIntentCurrent(collectionDestination, collection.state, geometry, snapshot.userId, primaryDetails)}
                    onClick={() => { if (!overBudget && collectionSlotsEditable && collection.state && geometry && collectionMarketIntentCurrent(collectionDestination, collection.state, geometry, snapshot.userId, primaryDetails)) setCollectionMarketPlayer(card.canonicalPlayerId ?? card.id); }}>
                    {overBudget ? getTouchlineFantasyMarketBudgetCopy(locale, draftLocalesEnabled).insufficient : (collectionBudgetCopy.sign)}</button>
                    : <span className={styles.marketClosedLabel}>{workflowCopy.reviewOnly}</span>
                  : inLineup ? <span className={styles.marketClosedLabel}>{workflowCopy.inYourXI}</span>
                  : targetSlot && targetSlot.id === activeSlot?.id && selectedCoach
                    ? <button type="button" disabled={saving || (collectionEnabled && !collectionSlotsEditable) || (marketPage && !canChooseGuidedSlot(guidedChoice, {area:"starters",slot:targetSlot.id}, selections.some(entry=>entry.slotId===targetSlot.id)))} aria-disabled={overBudget || undefined} title={overBudget ? getTouchlineFantasyMarketBudgetCopy(locale, draftLocalesEnabled).insufficient : undefined} onClick={() => selectMyClubPlayer(card)}>{overBudget ? <><LockKeyhole size={16} aria-hidden="true" />{getTouchlineFantasyMarketBudgetCopy(locale, draftLocalesEnabled).insufficient}</> : selections.some((entry) => entry.slotId === targetSlot.id) ? (`${workflowCopy.replaceSlot} · ${targetSlot.id}`) : (`${workflowCopy.chooseSlot} · ${targetSlot.id}`)}</button>
                    : <span className={styles.marketClosedLabel}>{workflowCopy.reviewOnly}</span>}
                {collectionEnabled && collectionDestination && collectionMarketPlayer === (card.canonicalPlayerId ?? card.id) ? <div data-collection-signing-confirmation={card.canonicalPlayerId ?? card.id}>
                  <p>{card.name} · {card.editorialCard?.marketValueEur?.toLocaleString(locale)} TC</p>
                  {collection.busy || collection.hasPending ? <p role="status">{collectionBudgetCopy.awaitingSigningConfirmation}</p> : null}
                  {collection.error ? <p role="alert">{collection.error}</p> : null}
                  <button type="button" className={controls.link} disabled={!canUseCollectionDestination(collectionDestination) || !collectionMarketIntentCurrent(collectionDestination, collection.state, geometry, snapshot.userId, primaryDetails)} onClick={confirmCollectionMarket}>{collectionBudgetCopy.confirmSigning}</button>
                  <button type="button" className={controls.link} disabled={collection.busy} onClick={() => setCollectionMarketPlayer(null)}>{getAllocationDialogCopy(locale, draftLocalesEnabled).back}</button>
                </div> : null}
              </div>
            </article>;
          })}{!selectedPlayerClubLocked && browseCards.length === 0 ? <p>{workflowCopy.noCards}</p> : null}</div>
          </>}
          {marketPage && feedback ? <p role="status">{feedback}</p> : null}
        </aside>
<footer className={styles.myClubGameweekFooter}><div><span>{workflowCopy.round}</span><strong>{lineupConfirmed ? (workflowCopy.xiConfirmed) : !editable ? marketAccessLabel : !roundEditable ? marketAccessCopy.closed : validation?.valid ? (workflowCopy.readyConfirm) : `${selectedCount}/11`}</strong></div><div><small>{hasUnsavedChanges ? (workflowCopy.unsavedChanges) : (workflowCopy.squadSynced)}</small><button type="button" disabled={!roundEditable || saving || !selectedCoachId || !validation?.valid || lineupConfirmed} onClick={() => save("confirm")}>{workflowCopy.confirmXI}</button></div></footer>
      {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}
    </section>;
  }

  return <div className={styles.shell} data-canonical-step={canonicalStep} data-market-visual="my-club" data-fantasy-context={embedded ? "my-club" : "standalone"}>
    <section className={styles.controlRail}><div><CalendarClock /><span>{builderCopy.gameweek}</span><strong>{activeGameweek?.number ?? "—"}</strong></div><div><ShieldCheck /><span>{builderCopy.state}</span><strong>{statusCopy(activeGameweek?.state, locale, draftLocalesEnabled)}</strong></div><div><WalletCards /><span>{builderCopy.remaining}</span><strong>{marketBudgetEur === null ? "∞" : formatTouchlineFantasyMarketValue(validation?.budgetRemainingEur ?? marketBudgetEur, locale, draftLocalesEnabled)}</strong></div><div><Crown /><span>XI</span><strong>{selections.length}/11</strong></div></section>
    <section className={styles.classicBuilder} aria-labelledby="touchline-markt-title">
      <header className={styles.hero}><div><span>{builderCopy.heroKicker}</span><h1 id="touchline-markt-title">{builderCopy.heroTitle}</h1><p>{builderCopy.heroIntro}</p></div><MarketWindowClock gameweeks={gameweeks} locale={locale} draftLocalesEnabled={draftLocalesEnabled} /></header>
    <nav className={styles.stepper} aria-label={builderCopy.lineupStepsAria}>{STEPS.map((step, index) => { const complete = (step === "coach" && Boolean(selectedCoachId)) || (step === "formation" && Boolean(formationCode)) || (step === "players" && selections.length === 11) || (step === "review" && lineupConfirmed) || (step === "locked" && !editable); const accessible = step === "coach" || Boolean(selectedCoachId) && (step === "formation" || Boolean(formationCode)); return <button type="button" key={step} disabled={!accessible} onClick={() => setVisibleStep(step)} data-active={visibleStep === step ? "true" : undefined} data-complete={complete ? "true" : undefined}><i>{complete ? <Check /> : index + 1}</i><span>{stepLabel(step, locale, draftLocalesEnabled)}</span><ChevronRight /></button>; })}</nav>
    {!snapshot.entitlementActive ? <p role="status">{getTouchlineBetaEnrollmentCopy(locale, draftLocalesEnabled).review}</p> : null}
    <FantasyBudgetNotice editable={editable} remainingBudget={validation?.budgetRemainingEur ?? null} selectedCount={selections.length} attemptedOverBudget={feedback === workflowCopy.budgetExceeded} locale={locale} draftLocalesEnabled={draftLocalesEnabled} onReviewXI={() => { setVisibleStep("players"); scrollToLineupSection("fantasy-classic-builder"); }} onExplorePlans={() => scrollToLineupSection("clubowner-plan-selector")} />
    <main className={styles.workspace}><section className={styles.builder} ref={builderRef}><header className={styles.sectionHeading}><div><span>{builderCopy.mySquad}</span><h2>{formationCode ?? (builderCopy.chooseFormation)}</h2></div><div><b>{builderCopy.usedValue}</b><strong>{formatTouchlineFantasyMarketValue(validation?.totalMarketValueEur ?? 0, locale, draftLocalesEnabled)}</strong><button className={styles.viewToggle} type="button" onClick={() => setSquadView((current) => current === "squad" ? "tactical" : "squad")}>{squadView === "squad" ? (builderCopy.viewTacticalPitch) : (builderCopy.viewSquad)}</button></div></header>
      {squadView === "tactical" ? <TouchlinePitchSurface advertisingCampaign={TOUCHLINE_MARKET_HOUSE_CAMPAIGN} className={styles.pitch} ariaLabel={builderCopy.tacticalPitchAria} orientation="vertical" surfaceVariant="smoked-glass">{geometry?.slots.map((slot) => { const selection = selections.find((entry) => entry.slotId === slot.id); const card = selection ? catalogueById.get(selection.playerId) : null; const alert = selection ? currentAlerts.some((entry) => entry.playerId === selection.playerId) : false; const openSlot = () => { if (editable) { setActiveSlotId(slot.id); setVisibleStep("players"); } }; return <div className={styles.pitchSlot} role={editable ? "button" : undefined} tabIndex={editable ? 0 : -1} aria-label={`${card ? (builderCopy.replace) : (builderCopy.selectPlayerFor)} ${slot.id}`} key={slot.id} style={verticalPitchPosition(slot)} onClick={openSlot} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && editable) { event.preventDefault(); openSlot(); } }} data-state={!editable ? "locked" : card ? (alert ? "invalid" : "selected") : activeSlot?.id === slot.id ? "active" : "empty"}>{card ? <><span className={styles.pitchCard}><TouchlineGameweekCard liveSeasonRating card={card} locale={locale} draftLocalesEnabled={draftLocalesEnabled} compact displayWidth={62} /></span><b>{card.shortName}</b>{editable ? <i role="button" tabIndex={0} aria-label={`${builderCopy.remove} ${card.name}`} onClick={(event) => { event.stopPropagation(); removePlayer(selection!.playerId); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); removePlayer(selection!.playerId); } }}>×</i> : null}{alert ? <em><CircleAlert />{builderCopy.notSelected}</em> : null}</> : <><span className={styles.emptySlot}>+</span><b>{slot.id}</b></>}</div>; })}</TouchlinePitchSurface> : <section className={styles.squadBoard} aria-label={builderCopy.squadByPositionAria}>{geometry?.slots.map((slot) => { const selection = selections.find((entry) => entry.slotId === slot.id); const card = selection ? catalogueById.get(selection.playerId) : null; const alert = selection ? currentAlerts.some((entry) => entry.playerId === selection.playerId) : false; const openSlot = () => { if (editable) { setActiveSlotId(slot.id); setVisibleStep("players"); } }; return <article key={slot.id} data-state={!editable ? "locked" : card ? (alert ? "invalid" : "selected") : activeSlot?.id === slot.id ? "active" : "empty"}><button type="button" disabled={!editable} onClick={openSlot} aria-label={`${card ? (builderCopy.replace) : (builderCopy.selectPlayerFor)} ${slot.id}`}><span>{slot.id}</span><strong>{card?.shortName ?? (builderCopy.openSlot)}</strong><small>{slot.allowedPositions.map(position => localizedPositionLabel(position === "midfield" ? "midfielder" : position, locale, draftLocalesEnabled)).join(" / ")}</small></button>{card ? <div><span>{card.clubName}</span>{editable ? <button type="button" onClick={() => removePlayer(selection!.playerId)} aria-label={`${builderCopy.remove} ${card.name}`}>×</button> : null}</div> : null}</article>; })}</section>}
      <footer className={styles.pitchFooter}><span>{selectedCoach ? `${selectedCoach.coach.displayName} · ${selectedCoach.clubName}` : (builderCopy.coachPending)}</span><span>{builderCopy.noPerClubLimit}</span><strong>{validation?.valid ? <><BadgeCheck />{builderCopy.validXI}</> : `${selections.length}/11`}</strong></footer></section>
      <aside className={styles.guidePanel} ref={guidePanelRef} data-guide-step={visibleStep} tabIndex={0} aria-label={builderCopy.selectionPanelAria} onPointerDown={(event) => { if (event.target === event.currentTarget) event.currentTarget.focus({ preventScroll: true }); }}>{selectedCoach && visibleStep !== "coach" ? <section className={styles.selectedCoachSummary} data-coach-tier-frame={selectedCoach.slot.cardTier} style={{ "--tier-accent": touchlineCardTierPalette(selectedCoach.slot.cardTier).accent } as CSSProperties} aria-label={builderCopy.selectedCoach}><TouchlineClubPerimeterTrace accent={touchlineCardTierPalette(selectedCoach.slot.cardTier).accent} /><span><FantasyCoachZoom entry={selectedCoach} locale={locale} draftLocalesEnabled={draftLocalesEnabled} eager /></span><div className={styles.selectedCoachIdentity}><small>{builderCopy.selectedCoachKicker}</small><b>{selectedCoach.coach.displayName}</b><CompactClubIdentity clubName={selectedCoach.clubName} clubLogoUrl={selectedCoach.clubLogoUrl} /></div><dl className={styles.coachMetrics}><div><dt><Trophy aria-hidden="true" />{builderCopy.rank}</dt><dd>{selectedCoach.competition ? `#${selectedCoach.competition.rank}` : "—"}</dd></div><div><dt><House aria-hidden="true" />{builderCopy.home}</dt><dd>{selectedCoach.competition?.home.touchlinePoints ?? "—"}<small> TL</small></dd></div><div><dt><PlaneTakeoff aria-hidden="true" />{builderCopy.away}</dt><dd>{selectedCoach.competition?.away.touchlinePoints ?? "—"}<small> TL</small></dd></div></dl><button type="button" disabled={!editable} onClick={() => setVisibleStep("coach")}>{builderCopy.change}</button></section> : null}{visibleStep === "coach" ? <section className={styles.coachStage}><header><span>{builderCopy.step1} · {builderCopy.technicalArea}</span><h2>{builderCopy.chooseCoach}</h2><p>{builderCopy.coachInstruction}</p><CompactClubSelector mode="coach" selectedTeamId={selectedCoachClub?.teamId ?? ""} onSelect={(club) => setCoachClubTeamId(club.teamId)} locale={locale} draftLocalesEnabled={draftLocalesEnabled} /></header><div className={styles.coachScroller} tabIndex={0} aria-label={builderCopy.scrollCoachListAria}><div className={styles.coachGrid}>{filteredCoaches.map((entry) => <article key={entry.id} data-coach-tier-frame={entry.slot.cardTier} style={{ "--tier-accent": touchlineCardTierPalette(entry.slot.cardTier).accent } as CSSProperties} data-selected={entry.id === selectedCoachId ? "true" : undefined}><TouchlineClubPerimeterTrace accent={touchlineCardTierPalette(entry.slot.cardTier).accent} /><span><FantasyCoachZoom entry={entry} locale={locale} draftLocalesEnabled={draftLocalesEnabled} /></span><div className={styles.coachIdentity}><small>{builderCopy.verifiedMark}</small><b>{entry.coach.displayName}</b><CompactClubIdentity clubName={entry.clubName} clubLogoUrl={entry.clubLogoUrl} /></div><dl className={styles.coachMetrics}><div><dt><Trophy aria-hidden="true" />{builderCopy.rank}</dt><dd>{entry.competition ? `#${entry.competition.rank}` : "—"}</dd></div><div><dt><House aria-hidden="true" />{builderCopy.home}</dt><dd>{entry.competition?.home.touchlinePoints ?? "—"}<small> TL</small></dd></div><div><dt><PlaneTakeoff aria-hidden="true" />{builderCopy.away}</dt><dd>{entry.competition?.away.touchlinePoints ?? "—"}<small> TL</small></dd></div></dl><button type="button" disabled={!editable} onClick={() => { setSelectedCoachId(entry.id); setFeedback(builderCopy.coachHiredNext); setVisibleStep("formation"); }}>{builderCopy.hireCoach}</button></article>)}</div>{filteredCoaches.length === 0 ? <p className={styles.emptyResults}>{builderCopy.noCanonicalCoach}</p> : null}</div></section> : null}
      {visibleStep === "formation" ? <><span>{builderCopy.step2}</span><h2>{builderCopy.chooseFormation}</h2><p>{builderCopy.formationInstruction}</p><div className={styles.formationGrid}>{Object.keys(snapshot.formationRegistry).map((code) => <button type="button" key={code} onClick={() => changeFormation(code)} disabled={!editable} data-selected={code === formationCode ? "true" : undefined}><b>{code}</b><small>11 {builderCopy.slots}</small></button>)}</div></> : null}
      {visibleStep === "players" ? <section className={styles.selectionStage}><header><span>{builderCopy.step3}</span><h2>{builderCopy.fillSlot}</h2><p>{activeSlot ? `${activeSlot.id} · ${activeSlot.allowedPositions.map(position => localizedPositionLabel(position === "midfield" ? "midfielder" : position, locale, draftLocalesEnabled)).join(" / ")}` : (builderCopy.selectPitchSlot)}</p><div className={styles.filters}><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={builderCopy.searchPlayer} /></label></div><CompactClubSelector selectedTeamId={selectedPlayerClub?.teamId ?? ""} onSelect={(club) => setPlayerClubTeamId(club.teamId)} locale={locale} draftLocalesEnabled={draftLocalesEnabled} marketAccess={marketPolicy} lockedLabel={marketPlanLockCopy} onLockedSelect={() => setFeedback(marketPlanLockCopy)} />{selectedPlayerClubLocked ? <p className={styles.marketPlanNotice} role="status"><LockKeyhole size={16} aria-hidden="true" />{marketPlanLockCopy}</p> : null}</header><div className={styles.playerViewport}><div className={styles.playerScroller} tabIndex={0} aria-label={builderCopy.scrollPlayerListAria} onPointerDown={(event) => { const target = event.target as HTMLElement; if (!target.closest("button, a, input, select")) event.currentTarget.focus({ preventScroll: true }); }} onKeyDown={(event) => { if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return; event.preventDefault(); event.currentTarget.scrollBy({ top: event.key === "ArrowDown" ? 96 : -96, behavior: "smooth" }); }}><div className={styles.playerGrid}>{filtered.map((card) => { const overBudget = playerExceedsBudget(card); return <article data-player-choice-card="premium" data-market-budget-locked={overBudget || undefined} key={card.canonicalPlayerId ?? card.id} data-choice-tier-frame={card.editorialCard?.tierKey ?? "unresolved"} style={{ "--tier-accent": card.editorialCard?.tierKey ? touchlineCardTierPalette(card.editorialCard.tierKey).accent : undefined } as CSSProperties}><TouchlineClubPerimeterTrace accent={card.editorialCard?.tierKey ? touchlineCardTierPalette(card.editorialCard.tierKey).accent : undefined} /><div className={styles.marketCard}><TouchlineGameweekCard liveSeasonRating card={card} locale={locale} draftLocalesEnabled={draftLocalesEnabled} displayWidth={132} fitContainer /></div><div className={styles.playerIdentity}><b>{card.name}</b><CompactClubIdentity clubName={card.clubName} clubLogoUrl={findTouchLineClub(card.clubName)?.logoUrl ?? null} detail={localizedPositionLabel(card.position, locale, draftLocalesEnabled) ?? undefined} /></div><button type="button" disabled={!editable || saving} aria-disabled={overBudget || undefined} title={overBudget ? getTouchlineFantasyMarketBudgetCopy(locale, draftLocalesEnabled).insufficient : undefined} onClick={() => addPlayer(card)}>{overBudget ? <><LockKeyhole size={16} aria-hidden="true" />{getTouchlineFantasyMarketBudgetCopy(locale, draftLocalesEnabled).insufficient}</> : builderCopy.chooseForSlot}</button></article>; })}</div>{filtered.length === 0 ? <p className={styles.emptyResults}>{builderCopy.noPlayersForPosition}</p> : null}</div></div></section> : null}
      {visibleStep === "review" ? <><span>{builderCopy.step4}</span><h2>{builderCopy.reviewTeam}</h2><div className={styles.editActions}><button type="button" disabled={!editable} onClick={() => setVisibleStep("coach")}>{builderCopy.changeCoach}</button><button type="button" disabled={!editable} onClick={() => setVisibleStep("players")}>{builderCopy.editPlayers}</button></div><div className={styles.reviewCoach}>{selectedCoach ? <><Crown /><div><b>{selectedCoach.coach.displayName}</b><span>{selectedCoach.clubName}</span></div></> : null}</div><ol className={styles.reviewList}>{geometry?.slots.map((slot) => { const selection = selections.find((entry) => entry.slotId === slot.id); const card = selection ? catalogueById.get(selection.playerId) : null; return <li key={slot.id}><span>{slot.id}</span><b>{card?.name ?? "—"}</b></li>; })}</ol><div className={styles.validation}>{validation?.issues.map((issue) => <span key={issue}>{issue.replaceAll("_", " ")}</span>)}{validation?.valid ? <span data-valid="true"><Check />{builderCopy.readyConfirm}</span> : null}</div></> : null}
      {visibleStep === "locked" ? <><span>{editable ? builderCopy.step5 : builderCopy.lockedSnapshot}</span><h2>{editable ? (builderCopy.confirmedTeam) : (builderCopy.lockedTeam)}</h2>{editable ? <div className={styles.editActions}><button type="button" onClick={() => setVisibleStep("coach")}>{builderCopy.changeCoach}</button><button type="button" onClick={() => setVisibleStep("players")}>{builderCopy.editPlayers}</button></div> : null}<div className={styles.syncPanel}><Send /><p>{lineupConfirmed || !editable ? (builderCopy.marketReady) : (builderCopy.confirmToSync)}</p><a href={`/clubowner?lang=${encodeURIComponent(locale)}`} aria-disabled={!(lineupConfirmed || !editable)}>{builderCopy.openMarket}</a></div></> : null}</aside></main>
    <section className={styles.actionRail}><div><b>{builderCopy.canonicalDeadline}</b><strong suppressHydrationWarning>{activeGameweek ? formatTouchlineFantasyDeadline(activeGameweek.locksAt, locale, draftLocalesEnabled) : "—"}</strong><span>{builderCopy.deadlineRule}</span><em data-save-state={hasUnsavedChanges ? "dirty" : persistedUserGameweek?.selectedCoachId ? "saved" : "empty"}>{hasUnsavedChanges ? (builderCopy.unsavedChanges) : persistedUserGameweek?.selectedCoachId ? (builderCopy.teamSaved) : (builderCopy.notSaved)}</em></div><div><button type="button" onClick={() => save("draft")} disabled={!editable || saving || !selectedCoachId || !formationCode || !hasUnsavedChanges}><Save />{builderCopy.saveDraft}</button><button className={styles.confirm} type="button" onClick={() => save("confirm")} disabled={!editable || saving || !selectedCoachId || !validation?.valid || lineupConfirmed}><LockKeyhole />{builderCopy.confirmXI}</button></div></section>
    {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}
    {currentAlerts.length ? <section className={styles.alertPanel}><CircleAlert /><div><b>{builderCopy.lineupUpdate}</b><p>{formatTouchlineFantasyStandaloneAlert(builderCopy, currentAlerts.length, editable)}</p></div></section> : null}
    </section>
    <section className={styles.rankings}><RankingTable title={builderCopy.gameweekRanking} entries={live?.gameweekRanking ?? []} empty={builderCopy.rankingAfterLock} /><RankingTable title={builderCopy.seasonRanking} entries={live?.seasonRanking ?? []} empty={builderCopy.noFinalResults} /></section>
    <section className={styles.rules}><Users /><div><span>{builderCopy.rulesKicker}</span><h2>{builderCopy.rulesTitle}</h2><p>{builderCopy.rulesIntro} {getTouchlineFantasyMarketBudgetCopy(locale, draftLocalesEnabled).rule.replace("{budget}", marketBudgetEur === null ? "∞" : formatTouchlineFantasyBudgetAmount(marketBudgetEur, locale, draftLocalesEnabled))}</p></div></section>
  </div>;
}
