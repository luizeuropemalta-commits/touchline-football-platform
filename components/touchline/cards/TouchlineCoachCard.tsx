"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import type { TouchlineCoach } from "@/lib/football-data/types";
import { touchlineCoachCardArtForTier, type TouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { touchlineArenaTierForKey, touchlineCardTierPalette } from "@/lib/touchlineArena/card-rules";
import { touchlineCountryFlagUrl } from "@/lib/touchlineArena/country-flags";
import type { TouchlineCoachFixtureContext } from "@/lib/touchlineArena/coach-scoring";
import {
  TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT,
  TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA,
  TOUCHLINE_COACH_CARD_LAYOUT_EVENT,
  TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY,
  normalizeTouchlineCoachCardLayout,
  type TouchlineCoachCardLayout,
  type TouchlineCoachLayerKey,
} from "@/lib/touchlineArena/coach-card-layout";
import { TouchlineClubCrestPerimeterTrace } from "@/components/touchline/cards/TouchlineClubCrestPerimeterTrace";
import { TouchlineCardPerimeterTrace } from "@/components/touchline/cards/TouchlineCardPerimeterTrace";

import styles from "./TouchlineCoachCard.module.css";

const COACH_CARD_ASSET_VERSION = "2026-07-28-1";

export function touchlineLiveCompactCoachFrameUrl(cardTier: TouchlineArenaCoachSlot["cardTier"]) {
  const cardTemplateFileName = touchlineCoachCardArtForTier(cardTier).split("/").pop() ?? "02_red_coach.png";
  return `/touchlineArena/cards/templates/live-compact/coaches/${cardTemplateFileName.replace(/\.png$/i, ".webp")}?v=${COACH_CARD_ASSET_VERSION}`;
}

export function touchlineZoomCoachFrameUrl(cardTier: TouchlineArenaCoachSlot["cardTier"]) {
  const cardTemplateFileName = touchlineCoachCardArtForTier(cardTier).split("/").pop() ?? "02_red_coach.png";
  return `/touchlineArena/cards/templates/zoom/coaches/${cardTemplateFileName.replace(/\.png$/i, ".webp")}?v=${COACH_CARD_ASSET_VERSION}`;
}

function touchlineRuntimeCoachCrestUrl(sourceUrl?: string | null) {
  if (!sourceUrl) return null;
  if (!sourceUrl.includes("/touchlineArena/shared/club-logos/2026-27/ui-512/")) return sourceUrl;
  return `${sourceUrl
    .replace("/touchlineArena/shared/club-logos/2026-27/ui-512/", "/touchlineArena/shared/club-logos/2026-27/live-160/")
    .replace(/\.png$/i, ".webp")}?v=${COACH_CARD_ASSET_VERSION}`;
}

type TouchlineCoachCardProps = {
  className?: string;
  coach: TouchlineCoach | null;
  slot: TouchlineArenaCoachSlot;
  clubName: string;
  clubLogoUrl?: string | null;
  clubAccent?: string;
  countryCode3?: string;
  formation?: string;
  locale?: string;
  editable?: boolean;
  forceNeonActive?: boolean;
  layoutOverride?: TouchlineCoachCardLayout;
  onLayoutChange?: (layout: TouchlineCoachCardLayout) => void;
  editableLayers?: TouchlineCoachLayerKey[];
  displayMode?: "default" | "compact";
  optimizeForLiveCompact?: boolean;
  enableInteractiveNeon?: boolean;
  assetLoading?: "eager" | "lazy";
  frameLoading?: "eager" | "lazy";
  frameDecoding?: "sync" | "async" | "auto";
  frameFetchPriority?: "high" | "low" | "auto";
  fixtureContext?: TouchlineCoachFixtureContext | null;
};

function CoachStatIcon({ type }: { type: "result" | "home" | "travel" | "discipline" | "points" }) {
  if (type === "discipline") {
    return <span className={styles.cardPair} aria-hidden="true"><i /><i /></span>;
  }
  return (
    <svg className={styles.statIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {type === "result" ? <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 9 3.5-2.4L15.5 9l-1.3 4.1H9.8L8.5 9Zm1.3 4.1-2.6 2.2m7-2.2 2.6 2.2M12 6.6V3.5" /></> : null}
      {type === "travel" ? <><path d="M3.5 13.5 20 5.8l-4.2 14.7-3.9-5.7-6.4 2.6 3-4.2-5-.3Z" /><path d="m11.9 14.8 3.9-3.8" /></> : null}
      {type === "home" ? <><path d="M3 20V9l9-6 9 6v11" /><path d="M7 20v-7h10v7M9.5 13v-3h5v3" /></> : null}
      {type === "points" ? <><path d="M7 3h10v4c0 3.2-2.1 5.6-5 5.6S7 10.2 7 7V3Z" /><path d="M7 5H4v2c0 2 1.3 3.4 3.6 3.8M17 5h3v2c0 2-1.3 3.4-3.6 3.8M12 13v4m-4 3h8m-6-3h4" /></> : null}
    </svg>
  );
}

export default function TouchlineCoachCard({
  className = "",
  coach,
  slot,
  clubName,
  clubLogoUrl,
  clubAccent = "#6cabdd",
  countryCode3 = "ITA",
  locale = "pt-BR",
  editable = false,
  forceNeonActive = false,
  layoutOverride,
  onLayoutChange,
  editableLayers,
  displayMode = "default",
  optimizeForLiveCompact = false,
  enableInteractiveNeon = true,
  assetLoading,
  frameLoading,
  frameDecoding,
  frameFetchPriority,
  fixtureContext = null,
}: TouchlineCoachCardProps) {
  const [storedLayout, setStoredLayout] = useState<TouchlineCoachCardLayout>(TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT);
  const [isNeonActive, setIsNeonActive] = useState(false);
  const [isFrameReady, setIsFrameReady] = useState(false);
  const shellRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLImageElement | null>(null);
  const flagRef = useRef<HTMLImageElement | null>(null);
  const crestRef = useRef<HTMLImageElement | null>(null);
  const neonInstanceId = useId();
  const [dragState, setDragState] = useState<{
    key: TouchlineCoachLayerKey;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    renderedWidthPercent: number;
    renderedHeightPercent: number;
  } | null>(null);
  const layout = layoutOverride ?? storedLayout;
  const isPortuguese = locale === "pt-BR";
  const tier = touchlineArenaTierForKey(slot.cardTier) ?? touchlineArenaTierForKey("ruby-red")!;
  const tierPalette = touchlineCardTierPalette(tier.key);
  const compactCardTemplateUrl = touchlineLiveCompactCoachFrameUrl(slot.cardTier);
  const zoomCardTemplateUrl = touchlineZoomCoachFrameUrl(slot.cardTier);
  const runtimeCardTemplateUrl = optimizeForLiveCompact ? compactCardTemplateUrl : zoomCardTemplateUrl;
  const runtimeClubLogoUrl = touchlineRuntimeCoachCrestUrl(clubLogoUrl);
  const flagUrl = touchlineCountryFlagUrl(countryCode3);
  const points = slot.status === "audited" && Number.isFinite(slot.touchlinePoints) ? String(slot.touchlinePoints) : "—";
  const coachDisplayName = coach?.displayName ?? (isPortuguese ? "Aguardando treinador" : "Awaiting coach");
  const coachNameLength = coachDisplayName.replace(/\s+/g, "").length;
  const coachNameFit = coachNameLength > 22 ? "long" : coachNameLength > 15 ? "medium" : "short";

  useEffect(() => {
    if (layoutOverride || typeof window === "undefined") return;

    function loadStoredLayout() {
      try {
        const saved = window.localStorage.getItem(TOUCHLINE_COACH_CARD_LAYOUT_STORAGE_KEY);
        if (saved) {
          setStoredLayout(normalizeTouchlineCoachCardLayout(JSON.parse(saved)));
          return;
        }
        fetch("/touchlineArena/card-layouts/coach-card-layout.json", { cache: "no-store" })
          .then((response) => response.ok ? response.json() : null)
          .then((payload) => {
            if (payload) setStoredLayout(normalizeTouchlineCoachCardLayout(payload));
          })
          .catch(() => undefined);
      } catch {
        setStoredLayout(TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT);
      }
    }

    function handleLayoutChange(event: Event) {
      const detail = (event as CustomEvent<{ layout?: unknown }>).detail;
      setStoredLayout(normalizeTouchlineCoachCardLayout(detail?.layout));
    }

    loadStoredLayout();
    window.addEventListener("storage", loadStoredLayout);
    window.addEventListener(TOUCHLINE_COACH_CARD_LAYOUT_EVENT, handleLayoutChange);
    return () => {
      window.removeEventListener("storage", loadStoredLayout);
      window.removeEventListener(TOUCHLINE_COACH_CARD_LAYOUT_EVENT, handleLayoutChange);
    };
  }, [layoutOverride]);

  useEffect(() => {
    if (!enableInteractiveNeon || editable || typeof window === "undefined") return;

    function clearWhenAnotherCardIsSelected(event: Event) {
      const selectedId = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (selectedId && selectedId !== neonInstanceId) setIsNeonActive(false);
    }

    function clearWhenPointerLeavesTheCard(event: PointerEvent) {
      const shell = shellRef.current;
      if (shell && event.target instanceof Node && !shell.contains(event.target)) setIsNeonActive(false);
    }

    window.addEventListener("touchline-card-neon-select", clearWhenAnotherCardIsSelected);
    document.addEventListener("pointerdown", clearWhenPointerLeavesTheCard);
    return () => {
      window.removeEventListener("touchline-card-neon-select", clearWhenAnotherCardIsSelected);
      document.removeEventListener("pointerdown", clearWhenPointerLeavesTheCard);
    };
  }, [editable, enableInteractiveNeon, neonInstanceId]);

  useEffect(() => {
    let active = true;
    // Reset the atomic reveal when any of the three visual assets changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsFrameReady(false);

    function waitForDecodedImage(image: HTMLImageElement | null) {
      if (!image) return Promise.resolve();
      const targetImage = image;
      return new Promise<void>((resolve) => {
        let settled = false;
        const safetyTimer = window.setTimeout(settle, 600);
        function cleanup() {
          targetImage.removeEventListener("load", finish);
          targetImage.removeEventListener("error", finish);
          window.clearTimeout(safetyTimer);
        }
        function settle() {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        }
        function finish() {
          if (targetImage.naturalWidth <= 0) {
            settle();
            return;
          }
          if (!targetImage.decode) {
            settle();
            return;
          }
          targetImage.decode().then(settle).catch(settle);
        }
        if (targetImage.complete) {
          finish();
          return;
        }
        targetImage.addEventListener("load", finish, { once: true });
        targetImage.addEventListener("error", finish, { once: true });
      });
    }

    Promise.all([
      waitForDecodedImage(frameRef.current),
      waitForDecodedImage(flagRef.current),
      waitForDecodedImage(crestRef.current),
    ]).then(() => {
      if (!active) return;
      // The assets have already loaded, decoded or reached the safety timer.
      // Commit immediately: Safari can suspend requestAnimationFrame for a
      // background tab and otherwise leave the entire coach card invisible.
      setIsFrameReady(true);
    }).catch(() => undefined);

    return () => {
      active = false;
    };
  }, [flagUrl, runtimeCardTemplateUrl, runtimeClubLogoUrl]);

  const cardStyle = {
    "--coach-club-accent": clubAccent,
    "--coach-tier-accent": tierPalette.accent,
    "--coach-tier-secondary": tierPalette.secondary,
    "--touchline-card-frame-color": tierPalette.accent,
    "--touchline-club-crest-color": clubAccent,
    "--coach-nationality-x": `${layout.layers.nationality.x}%`,
    "--coach-nationality-y": `${layout.layers.nationality.y}%`,
    "--coach-nationality-w": `${layout.layers.nationality.w}%`,
    "--coach-club-crest-x": `${layout.layers.clubCrest.x}%`,
    "--coach-club-crest-y": `${layout.layers.clubCrest.y}%`,
    "--coach-club-crest-w": `${layout.layers.clubCrest.w}%`,
    "--coach-portrait-x": `${layout.layers.portrait.x}%`,
    "--coach-portrait-y": `${layout.layers.portrait.y}%`,
    "--coach-portrait-w": `${layout.layers.portrait.w}%`,
    "--coach-portrait-h": `${layout.layers.portrait.h ?? 25.5}%`,
    "--coach-nameplate-x": `${layout.layers.nameplate.x}%`,
    "--coach-nameplate-y": `${layout.layers.nameplate.y}%`,
    "--coach-nameplate-w": `${layout.layers.nameplate.w}%`,
    "--coach-stats-x": `${layout.layers.stats.x}%`,
    "--coach-stats-y": `${layout.layers.stats.y}%`,
    "--coach-stats-w": `${layout.layers.stats.w}%`,
    "--coach-footer-x": `${layout.layers.footer.x}%`,
    "--coach-footer-y": `${layout.layers.footer.y}%`,
    "--coach-footer-w": `${layout.layers.footer.w}%`,
    "--coach-portrait-scale": String(layout.portraitScale),
    "--coach-name-size": `${layout.nameSize}cqw`,
    "--coach-crest-size": `${Math.round(layout.crestSize * 3)}px`,
    "--coach-neon-alpha": String(Math.min(.92, .2 + layout.neonStrength * .3)),
    "--coach-neon-soft-alpha": String(Math.min(.88, .18 + layout.neonStrength * .3)),
    "--coach-art-scale": "1",
  } as CSSProperties;

  function handleLayerPointerDown(key: TouchlineCoachLayerKey, event: ReactPointerEvent<HTMLElement>) {
    if (!editable || !onLayoutChange) return;
    const inner = event.currentTarget.closest('[data-coach-card-inner="true"]');
    if (!(inner instanceof HTMLElement)) return;

    event.preventDefault();
    event.stopPropagation();
    const layer = layout.layers[key];
    const bounds = inner.getBoundingClientRect();
    const layerBounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: layer.x,
      originY: layer.y,
      renderedWidthPercent: (layerBounds.width / bounds.width) * 100,
      renderedHeightPercent: (layerBounds.height / bounds.height) * 100,
    });
  }

  function handleLayerPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragState;
    if (!drag || drag.pointerId !== event.pointerId || !onLayoutChange) return;
    const inner = event.currentTarget.closest('[data-coach-card-inner="true"]');
    if (!(inner instanceof HTMLElement)) return;
    const bounds = inner.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const layer = layout.layers[drag.key];
    const nextX = drag.originX + ((event.clientX - drag.startX) / bounds.width) * 100;
    const nextY = drag.originY + ((event.clientY - drag.startY) / bounds.height) * 100;
    const maxX = Math.max(
      TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA.left,
      TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA.right - drag.renderedWidthPercent,
    );
    const maxY = Math.max(
      TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA.top,
      TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA.bottom - drag.renderedHeightPercent,
    );
    onLayoutChange(normalizeTouchlineCoachCardLayout({
      ...layout,
      layers: {
        ...layout.layers,
        [drag.key]: {
          ...layer,
          x: Math.max(TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA.left, Math.min(maxX, nextX)),
          y: Math.max(TOUCHLINE_COACH_CARD_EDITOR_SAFE_AREA.top, Math.min(maxY, nextY)),
        },
      },
    }));
  }

  function handleLayerPointerEnd(event: ReactPointerEvent<HTMLElement>) {
    if (dragState?.pointerId !== event.pointerId) return;
    setDragState(null);
  }

  function editableLayerProps(key: TouchlineCoachLayerKey, label: string) {
    if (!editable) return {};
    if (editableLayers && !editableLayers.includes(key)) return {};
    return {
      "data-coach-layer": label,
      "data-coach-layer-active": dragState?.key === key ? "true" : "false",
      ...(key === "nameplate" ? { "data-coach-name-fit": coachNameFit } : {}),
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => handleLayerPointerDown(key, event),
      onPointerMove: handleLayerPointerMove,
      onPointerUp: handleLayerPointerEnd,
      onPointerCancel: handleLayerPointerEnd,
    };
  }

  return (
    <article
      ref={shellRef}
      className={`${styles.shell} touchline-card-surface ${className}`}
      style={cardStyle}
      data-card-tier={slot.cardTier}
      data-card-motion="true"
      data-card-neon="permanent-tier-art"
      data-neon-active={forceNeonActive || isNeonActive ? "true" : "false"}
      data-coach-card-art="official-coach-tier"
      data-coach-card-editable={editable ? "true" : "false"}
      data-coach-card-display={displayMode}
      data-coach-frame-ready={isFrameReady ? "true" : "false"}
      aria-label={`${coach?.displayName ?? (isPortuguese ? "Treinador pendente" : "Coach pending")} TouchLine coach card`}
      onClick={() => {
        if (!enableInteractiveNeon || editable) return;
        const nextNeonState = !isNeonActive;
        setIsNeonActive(nextNeonState);
        if (nextNeonState) {
          window.dispatchEvent(new CustomEvent("touchline-card-neon-select", { detail: { id: neonInstanceId } }));
        }
      }}
    >
      <TouchlineCardPerimeterTrace />
      <div className={styles.inner} data-coach-card-inner="true">
        <div className={styles.identity} {...editableLayerProps("nationality", "Nacionalidade")}>
          <span>{isPortuguese ? "Nacionalidade" : "Nationality"}</span>
          {flagUrl ? <img ref={flagRef} src={flagUrl} alt={countryCode3} draggable={false} loading={assetLoading ?? "eager"} /> : null}
          <b>{countryCode3}</b>
        </div>

        {runtimeClubLogoUrl ? (
          <div className={styles.clubBadge} {...editableLayerProps("clubCrest", "Escudo do clube")}>
            <span>{isPortuguese ? "Clube atual" : "Current club"}</span>
            <div data-touchline-card-crest-trace-host="true">
              <TouchlineClubCrestPerimeterTrace />
              <img ref={crestRef} src={runtimeClubLogoUrl} alt={clubName} draggable={false} loading={assetLoading ?? "eager"} data-touchline-card-crest="true" />
            </div>
          </div>
        ) : null}

        <div className={styles.nameplate} data-coach-name-fit={coachNameFit} {...editableLayerProps("nameplate", "Nome do treinador")}>
          <small>{isPortuguese ? "Treinador principal" : "First-team manager"}</small>
          <strong>{coachDisplayName}</strong>
          <span>{clubName}</span>
        </div>

        <div className={styles.stats} {...editableLayerProps("stats", "Informações técnicas")}>
          <span className={styles.stat}>
            {fixtureContext === "home" ? (
              <span className={styles.matchContext} aria-label="Home fixture"><CoachStatIcon type="home" /> {isPortuguese ? "Casa" : "Home"}</span>
            ) : null}
            {fixtureContext === "away" ? (
              <span className={styles.matchContext} aria-label="Away fixture"><CoachStatIcon type="travel" /> {isPortuguese ? "Fora" : "Away"}</span>
            ) : null}
            <CoachStatIcon type="result" />
            <small>{isPortuguese ? "Resultado" : "Result"}</small>
            <strong>—</strong>
          </span>
          <span className={styles.stat}><CoachStatIcon type="discipline" /><small>{isPortuguese ? "Cartões" : "Cards"}</small><strong>0 / 0</strong></span>
          <span className={`${styles.stat} ${styles.pointsStat}`}><CoachStatIcon type="points" /><small>TL PTS</small><strong>{points}</strong></span>
        </div>

      </div>
      <img
        ref={frameRef}
        className={styles.frame}
        data-touchline-card-frame="true"
        data-live-card-asset="frame"
        data-card-delivery={optimizeForLiveCompact ? "live-compact" : "zoom-optimized"}
        src={optimizeForLiveCompact ? compactCardTemplateUrl : zoomCardTemplateUrl}
        alt=""
        draggable={false}
        loading={frameLoading ?? (optimizeForLiveCompact ? "eager" : "lazy")}
        decoding={frameDecoding ?? (optimizeForLiveCompact ? "sync" : "async")}
        fetchPriority={frameFetchPriority ?? (optimizeForLiveCompact ? "high" : "auto")}
      />
    </article>
  );
}
