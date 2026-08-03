"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import TouchlineEliteExactCard, { type TouchlineEliteExactPlayer } from "@/components/touchline/cards/TouchlineEliteExactCard";
import {
  TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY,
  TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  touchlineArenaClubTemplateForCard,
  touchlineArenaCompetitionTierForCard,
} from "@/lib/touchlineArena/card-rules";
import { ARENA_ONLINE_ZONES } from "@/lib/touchlineArena/arena-online-hub";
import type { ArenaLineupPlayer } from "@/lib/football-data/arena-lineup";
import type { TouchlineFantasyEvent } from "@/lib/football-data/types";

const ENTRY_VIDEO = "/touchlineArena/arena/touchline-arena-entry-20260716.mp4";
const LOOP_VIDEO = "/touchlineArena/arena/touchline-arena-loop-20260716.mp4?v=202607170155";
const DEFAULT_CLUB_TEMPLATE_URL = "/touchlineArena/cards/templates/clubs/Manchester%20City/template.png";
const ARENA_MANUAL_LAYOUT_KEY = `${TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY}:manual-layout`;
const ARENA_LINEUP_BACKUP_KEY = `${TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY}:backup`;
const CARD_STUDIO_DRAFT_KEY = `${TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY}:studio-draft`;
const ARENA_ALERTS_ENABLED_KEY = `${TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY}:alerts-enabled`;
const ARENA_PREVIEW_SLOTS: Record<ArenaLineupPlayer["role"], Array<Pick<ArenaLineupPlayer, "x" | "y" | "heightVh">>> = {
  goalkeeper: [{ x: 50, y: 27, heightVh: 5.2 }],
  defender: [
    { x: 25, y: 38, heightVh: 5.2 },
    { x: 42, y: 38, heightVh: 5.2 },
    { x: 58, y: 38, heightVh: 5.2 },
    { x: 75, y: 38, heightVh: 5.2 },
  ],
  midfielder: [
    { x: 34, y: 45, heightVh: 5.1 },
    { x: 50, y: 45, heightVh: 5.1 },
    { x: 66, y: 45, heightVh: 5.1 },
  ],
  forward: [
    { x: 34, y: 53, heightVh: 5.3 },
    { x: 50, y: 54, heightVh: 5.4 },
    { x: 66, y: 53, heightVh: 5.3 },
  ],
};

type Phase = "entry" | "loop";
type DragState = { id: string; startX: number; startY: number; originX: number; originY: number; rectWidth: number; rectHeight: number };
type ArenaNotificationPermission = NotificationPermission | "unsupported";
type ArenaAlertKind = "goal" | "assist" | "card" | "lineup" | "market" | "rumor" | "watch" | "system";
type ArenaAlert = {
  id: string;
  kind: ArenaAlertKind;
  title: string;
  body: string;
  playerName?: string;
  fixtureName?: string;
  minute?: number;
  points?: number;
  source: "SportMonks" | "Touchline";
  occurredAt: string;
  isReal: boolean;
};

const ALERT_KIND_LABELS: Record<ArenaAlertKind, string> = {
  assist: "Assist",
  card: "Card",
  goal: "Goal",
  lineup: "Lineup",
  market: "Market",
  rumor: "Rumor",
  system: "Arena",
  watch: "Watch",
};

function initialArenaAlerts(): ArenaAlert[] {
  const occurredAt = new Date().toISOString();

  return [
    {
      id: "touchline-system-live-room",
      kind: "system",
      title: "Arena Live ready",
      body: "Enable alerts and test a goal to see the user being called back.",
      source: "Touchline",
      occurredAt,
      isReal: false,
    },
    {
      id: "touchline-watch-room",
      kind: "watch",
      title: "Watch Guide",
      body: "TouchLine England can provide fixture broadcasters. Live video requires an official partnership.",
      source: "Touchline",
      occurredAt,
      isReal: false,
    },
    {
      id: "touchline-rumor-room",
      kind: "rumor",
      title: "Daily news desk",
      body: "Area for real player news, rumours, injuries and market impact.",
      source: "Touchline",
      occurredAt,
      isReal: false,
    },
  ];
}

function arenaAlertKindFromEventType(type?: string | null): ArenaAlertKind {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("goal")) return "goal";
  if (normalized.includes("assist")) return "assist";
  if (normalized.includes("yellow") || normalized.includes("red") || normalized.includes("card")) return "card";
  if (normalized.includes("lineup")) return "lineup";
  return "system";
}

function fantasyEventToArenaAlert(event: TouchlineFantasyEvent): ArenaAlert {
  const kind = arenaAlertKindFromEventType(event.type);
  const minute = event.minute ? `${event.minute}' ` : "";
  const playerName = event.playerName || "Player";
  const related = event.relatedPlayerName ? ` Assist: ${event.relatedPlayerName}.` : "";
  const points = typeof event.fantasyPoints === "number" ? event.fantasyPoints : 0;

  return {
    id: `sportmonks-${event.id}`,
    kind,
    title: `${minute}${ALERT_KIND_LABELS[kind]} - ${playerName}`,
    body: `${event.type || "Live event"}${related} Card impact: ${points >= 0 ? "+" : ""}${points} pts.`,
    playerName,
    fixtureName: event.fixtureId ? `Fixture ${event.fixtureId}` : undefined,
    minute: event.minute,
    points,
    source: "SportMonks",
    occurredAt: new Date().toISOString(),
    isReal: true,
  };
}

function notificationStatusLabel(permission: ArenaNotificationPermission, enabled: boolean) {
  if (permission === "unsupported") return "Unsupported";
  if (permission === "denied") return "Blocked";
  if (permission === "granted" && enabled) return "On";
  if (permission === "granted") return "Allowed";
  return "Off";
}

function cleanArenaPlayer(player: ArenaLineupPlayer): ArenaLineupPlayer {
  const card = player.card;
  if (!card) return player;
  const cleanCard = { ...card } as typeof card & { cardPrice?: unknown };
  delete cleanCard.cardPrice;
  const cardTier = touchlineArenaCompetitionTierForCard(card.cardTier).key;
  const clubTemplateUrl = touchlineArenaClubTemplateForCard(card.clubName || "", card.marketValue, cardTier);

  return {
    ...player,
    card: {
      ...cleanCard,
      templateUrl: clubTemplateUrl || DEFAULT_CLUB_TEMPLATE_URL,
      frameUrl: "",
      marketValueSource: card.marketValueSource || (card.marketValue ? "verified-cache" : "unavailable"),
      cardTier,
      cardPriceVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    },
  };
}

function positionArenaPlayers(players: ArenaLineupPlayer[]) {
  const usedByRole: Partial<Record<ArenaLineupPlayer["role"], number>> = {};

  return players.map((player) => {
    const slots = ARENA_PREVIEW_SLOTS[player.role] || ARENA_PREVIEW_SLOTS.midfielder;
    const index = usedByRole[player.role] || 0;
    usedByRole[player.role] = index + 1;
    const slot = slots[index % slots.length];
    return { ...player, ...slot };
  });
}

function arenaCardToPlayer(player: ArenaLineupPlayer): TouchlineEliteExactPlayer {
  const card = player.card;
  const cardTier = touchlineArenaCompetitionTierForCard(card?.cardTier).key;
  const clubTemplateUrl = touchlineArenaClubTemplateForCard(card?.clubName || "", null, cardTier);

  return {
    sportmonksPlayerId: player.id,
    overall: card?.shirtNumber || "--",
    shirtNumber: card?.shirtNumber || "",
    role: card?.position || player.role,
    position: card?.position || player.role,
    flagUrl: card?.flagUrl || "",
    countryCode3: card?.countryCode3 || "N/A",
    name: card?.playerName || player.name,
    clubName: card?.clubName || "",
    clubLogoUrl: "",
    leagueName: "Premier League",
    leagueLogoUrl: "",
    marketValue: card?.marketValue || "Pending",
    cardTier,
    cardPriceVersion: card?.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    updatedAt: "SportMonks",
    age: "N/A",
    height: "N/A",
    foot: "N/A",
    contract: "",
    nationality: card?.countryCode3 || "N/A",
    stadiumName: "",
    avatarImageUrl: "",
    avatarStatus: "arena-preview",
    sourcePhotoUrl: "",
    frameUrl: "",
    cardTemplateUrl: clubTemplateUrl || DEFAULT_CLUB_TEMPLATE_URL,
    fantasyPoints: card?.fantasyPoints ?? "0.0",
    matchStats: card?.matchStats,
  };
}

function readSavedCards() {
  try {
    const saved = window.localStorage.getItem(TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY);
    const hasManualLayout = window.localStorage.getItem(ARENA_MANUAL_LAYOUT_KEY) === "1";
    const parsed = saved ? (JSON.parse(saved) as Partial<ArenaLineupPlayer>[]) : [];
    if (!Array.isArray(parsed)) return [];
    if (saved && saved !== "[]" && !window.localStorage.getItem(ARENA_LINEUP_BACKUP_KEY)) {
      window.localStorage.setItem(ARENA_LINEUP_BACKUP_KEY, saved);
    }

    const savedPlayers = parsed
      .filter((player) => player.id && !String(player.id).startsWith("demo-") && player.name && player.shortName && player.role && player.card)
      .map((player): ArenaLineupPlayer => ({
        id: String(player.id),
        name: String(player.name),
        shortName: String(player.shortName),
        role: player.role as ArenaLineupPlayer["role"],
        asset: player.asset,
        card: player.card,
        x: typeof player.x === "number" ? player.x : 50,
        y: typeof player.y === "number" ? player.y : 62,
        heightVh: typeof player.heightVh === "number" ? player.heightVh : 24,
      }));

    if (!savedPlayers.length) {
      return [];
    }

    const cleanPlayers = savedPlayers.map(cleanArenaPlayer);
    const nextPlayers = hasManualLayout ? cleanPlayers : positionArenaPlayers(cleanPlayers);
    if (saved && saved !== JSON.stringify(nextPlayers)) {
      window.localStorage.setItem(ARENA_LINEUP_BACKUP_KEY, saved);
    }
    window.localStorage.setItem(TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY, JSON.stringify(nextPlayers));
    return nextPlayers;
  } catch {
    return [];
  }
}

export default function ArenaVideoPreviewPage() {
  const arenaFrameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const notifiedAlertIdsRef = useRef<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>("loop");
  const [players, setPlayers] = useState<ArenaLineupPlayer[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null);
  const [isEditingPositions, setIsEditingPositions] = useState(false);
  const [isStartMenuOpen, setIsStartMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<ArenaNotificationPermission>("default");
  const [liveAlertsEnabled, setLiveAlertsEnabled] = useState(false);
  const [arenaAlerts, setArenaAlerts] = useState<ArenaAlert[]>(() => initialArenaAlerts());
  const [liveSyncStatus, setLiveSyncStatus] = useState("");

  const isLoop = phase === "loop";
  const source = isLoop ? LOOP_VIDEO : ENTRY_VIDEO;
  const isArenaExpanded = isFullscreen || isTheaterMode;
  const notificationStatus = notificationStatusLabel(notificationPermission, liveAlertsEnabled);

  useEffect(() => {
    queueMicrotask(() => setPlayers(readSavedCards()));
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setNotificationPermission("Notification" in window ? window.Notification.permission : "unsupported");
      setLiveAlertsEnabled(window.localStorage.getItem(ARENA_ALERTS_ENABLED_KEY) === "1");
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ARENA_ALERTS_ENABLED_KEY, liveAlertsEnabled ? "1" : "0");
  }, [liveAlertsEnabled]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("arenaFull") === "1") queueMicrotask(() => setIsTheaterMode(true));
  }, []);

  useEffect(() => {
    function syncFullscreenState() {
      const frameIsFullscreen = document.fullscreenElement === arenaFrameRef.current;
      setIsFullscreen(frameIsFullscreen);
      if (document.fullscreenElement) return;
      setIsTheaterMode(false);
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  function refreshCards() {
    setPlayers(readSavedCards());
  }

  function savePositions() {
    if (!players.length) {
      setSaveStatus("No card to save.");
      window.setTimeout(() => setSaveStatus(""), 1800);
      return;
    }

    const currentLineup = window.localStorage.getItem(TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY);
    if (currentLineup && currentLineup !== "[]") {
      window.localStorage.setItem(ARENA_LINEUP_BACKUP_KEY, currentLineup);
    }
    window.localStorage.setItem(ARENA_MANUAL_LAYOUT_KEY, "1");
    window.localStorage.setItem(TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY, JSON.stringify(players.map(cleanArenaPlayer)));
    setSaveStatus("Positions saved.");
    window.setTimeout(() => setSaveStatus(""), 1800);
  }

  function resetAutoPositions() {
    if (!players.length) {
      setSaveStatus("No card to position.");
      window.setTimeout(() => setSaveStatus(""), 1800);
      return;
    }

    const currentLineup = window.localStorage.getItem(TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY);
    if (currentLineup && currentLineup !== "[]") {
      window.localStorage.setItem(ARENA_LINEUP_BACKUP_KEY, currentLineup);
    }
    const nextPlayers = positionArenaPlayers(players.map(cleanArenaPlayer));
    window.localStorage.removeItem(ARENA_MANUAL_LAYOUT_KEY);
    window.localStorage.setItem(TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY, JSON.stringify(nextPlayers));
    setPlayers(nextPlayers);
    setSaveStatus("Auto field applied.");
    window.setTimeout(() => setSaveStatus(""), 1800);
  }

  function startCardDrag(event: PointerEvent<HTMLDivElement>, player: ArenaLineupPlayer) {
    if (!isEditingPositions) return;

    const rect = arenaFrameRef.current?.getBoundingClientRect();
    if (!rect) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      id: player.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: player.x,
      originY: player.y,
      rectWidth: rect.width,
      rectHeight: rect.height,
    };
  }

  function moveCardDrag(event: PointerEvent<HTMLDivElement>) {
    const active = dragStateRef.current;
    if (!active) return;

    event.preventDefault();
    event.stopPropagation();

    const nextX = Math.max(6, Math.min(94, active.originX + ((event.clientX - active.startX) / active.rectWidth) * 100));
    const nextY = Math.max(18, Math.min(76, active.originY + ((event.clientY - active.startY) / active.rectHeight) * 100));
    setPlayers((current) => current.map((player) => (player.id === active.id ? { ...player, x: Math.round(nextX * 10) / 10, y: Math.round(nextY * 10) / 10 } : player)));
  }

  function endCardDrag() {
    dragStateRef.current = null;
  }

  function playEntry() {
    setPhase("entry");
    window.requestAnimationFrame(() => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = 0;
      void video.play();
    });
  }

  function playLoop() {
    setPhase("loop");
    window.requestAnimationFrame(() => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = 0;
      void video.play();
    });
  }

  function handleEnded() {
    if (phase === "entry") playLoop();
  }

  async function toggleArenaFullscreen() {
    const frame = arenaFrameRef.current;
    if (!frame) return;

    if (isTheaterMode) {
      setIsTheaterMode(false);
      return;
    }

    if (document.fullscreenElement === frame) {
      await document.exitFullscreen();
      return;
    }

    if (typeof frame.requestFullscreen === "function") {
      await frame.requestFullscreen();
      return;
    }

    setIsTheaterMode(true);
  }

  function handleArenaFullscreenPointerDown(event: PointerEvent<HTMLElement>) {
    event.preventDefault();
    void toggleArenaFullscreen();
  }

  function handleArenaFullscreenKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void toggleArenaFullscreen();
  }

  function openCardEditor(player: ArenaLineupPlayer) {
    if (isEditingPositions) return;

    const editablePlayer = cleanArenaPlayer(player);
    window.localStorage.setItem(CARD_STUDIO_DRAFT_KEY, JSON.stringify(editablePlayer));
    window.location.assign(`/visual-qa/touchline-card-studio?edit=1&cardId=${encodeURIComponent(editablePlayer.id)}`);
  }

  function deliverArenaNotification(alert: ArenaAlert, permission: ArenaNotificationPermission = notificationPermission, force = false) {
    if (!force && !liveAlertsEnabled) return;
    if (permission !== "granted") return;
    if (!("Notification" in window)) return;
    if (notifiedAlertIdsRef.current.has(alert.id)) return;

    notifiedAlertIdsRef.current.add(alert.id);
    new window.Notification(`Touchline Arena - ${alert.title}`, {
      body: alert.body,
      tag: alert.id,
      requireInteraction: alert.kind === "goal",
    });
  }

  function pushArenaAlerts(alerts: ArenaAlert[], shouldNotify = true, permission: ArenaNotificationPermission = notificationPermission, forceNotification = false) {
    if (!alerts.length) return;
    setArenaAlerts((current) => {
      const seen = new Set<string>();
      return [...alerts, ...current]
        .filter((alert) => {
          if (seen.has(alert.id)) return false;
          seen.add(alert.id);
          return true;
        })
        .slice(0, 12);
    });

    if (shouldNotify) {
      alerts.forEach((alert) => deliverArenaNotification(alert, permission, forceNotification));
    }
  }

  async function enableLiveAlerts() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setLiveSyncStatus("This browser does not support web notifications.");
      return "unsupported" as const;
    }

    const permission = window.Notification.permission === "default" ? await window.Notification.requestPermission() : window.Notification.permission;
    setNotificationPermission(permission);

    if (permission === "granted") {
      setLiveAlertsEnabled(true);
      setLiveSyncStatus("Alerts are active in this window. The next step is PWA support for phones while the site is closed.");
    } else {
      setLiveAlertsEnabled(false);
      setLiveSyncStatus("Notification permission was not granted.");
    }

    return permission;
  }

  async function syncSportmonksLiveEvents() {
    setLiveSyncStatus("Fetching real TouchLine England events...");

    try {
      const response = await fetch("/api/football-data/fantasy/events", { cache: "no-store" });
      const payload = (await response.json()) as { ok?: boolean; data?: TouchlineFantasyEvent[]; error?: string; code?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "TouchLine England did not return events right now.");
      }

      const alerts = (payload.data || []).map(fantasyEventToArenaAlert);
      if (!alerts.length) {
        setLiveSyncStatus("TouchLine England connected, but no live event is available right now.");
        return;
      }

      pushArenaAlerts(alerts, true);
      setLiveSyncStatus(`${alerts.length} real event${alerts.length === 1 ? "" : "s"} loaded from TouchLine England.`);
    } catch (error) {
      setLiveSyncStatus(error instanceof Error ? error.message : "Could not fetch live events.");
    }
  }

  return (
    <main className="min-h-screen bg-[#05070b] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(181,255,75,.14),transparent_30%),radial-gradient(circle_at_78%_18%,rgba(56,189,248,.12),transparent_28%),linear-gradient(180deg,#071018,#030408)]" />

      <section className="relative z-10 mx-auto max-w-6xl">
        <p className="text-[10px] font-black text-lime-100/60">Touchline Arena</p>
        <h1 className="mt-2 text-3xl font-black  leading-none">Arena Card Preview</h1>
        <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-white/58">
          Safe preview: the second video plays with saved formation cards on top. Nothing here publishes or changes the final Arena.
        </p>

        <article className="mt-6 rounded-lg border border-white/10 bg-black/42 p-4 shadow-[0_24px_70px_rgba(0,0,0,.38)] backdrop-blur">
          <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-sm font-black">{isLoop ? "Card loop video" : "Entry video"}</h2>
              <p className="mt-1 text-xs font-bold leading-5 text-white/52">
                {isLoop ? `${players.length} card${players.length === 1 ? "" : "s"} por cima do segundo video.` : "Entrada sem cards."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <a
                href={isArenaExpanded ? "/visual-qa/arena-video-preview" : "/visual-qa/arena-video-preview?arenaFull=1"}
                onPointerDown={handleArenaFullscreenPointerDown}
                onKeyDown={handleArenaFullscreenKeyDown}
                className="rounded border border-cyan-300/40 bg-cyan-300/14 px-3 py-2 text-[10px] font-black text-cyan-50 hover:bg-cyan-300/22"
              >
                {isArenaExpanded ? "Exit full" : "Full screen"}
              </a>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded border border-white/10 bg-white/[.08] px-3 py-2 text-[10px] font-black text-white hover:bg-white/[.13] [&::-webkit-details-marker]:hidden">
                  Editor
                </summary>
                <div className="absolute right-0 z-[5200] mt-2 grid w-[190px] gap-2 rounded-lg border border-white/12 bg-[#060912]/95 p-2 shadow-[0_22px_60px_rgba(0,0,0,.6)]">
                  <button type="button" onClick={refreshCards} className="rounded bg-white/[.08] px-3 py-2 text-left text-[10px] font-black text-white hover:bg-white/[.13]">
                    Reload cards
                  </button>
                  <button type="button" onClick={() => setIsEditingPositions((current) => !current)} className={`rounded px-3 py-2 text-left text-[10px] font-black ${isEditingPositions ? "bg-cyan-300 text-black" : "bg-white/[.08] text-white hover:bg-white/[.13]"}`}>
                    {isEditingPositions ? "Editing on" : "Edit positions"}
                  </button>
                  <button type="button" onClick={savePositions} className="rounded bg-emerald-400 px-3 py-2 text-left text-[10px] font-black text-black">
                    Save positions
                  </button>
                  <button type="button" onClick={resetAutoPositions} className="rounded bg-white/[.08] px-3 py-2 text-left text-[10px] font-black text-white hover:bg-white/[.13]">
                    Auto field
                  </button>
                  <button type="button" onClick={playEntry} className="rounded bg-white/[.08] px-3 py-2 text-left text-[10px] font-black text-white hover:bg-white/[.13]">
                    Play entry
                  </button>
                  <button type="button" onClick={playLoop} className="rounded bg-lime-300 px-3 py-2 text-left text-[10px] font-black text-black">
                    Skip to loop
                  </button>
                </div>
              </details>
            </div>
          </div>

          <div ref={arenaFrameRef} className={`overflow-hidden bg-black ${isArenaExpanded ? "fixed inset-0 z-[9999] h-screen w-screen rounded-none border-0" : "relative rounded-md border border-white/10"}`}>
            <video
              key={source}
              ref={videoRef}
              className={`${isArenaExpanded ? "h-full w-full" : "aspect-video w-full"} bg-black object-cover`}
              controls={false}
              muted
              playsInline
              autoPlay
              loop={isLoop}
              preload="auto"
              src={source}
              onEnded={handleEnded}
            />
            <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/72 px-3 py-2 text-[10px] font-black text-lime-100">
              {isLoop ? "Loop with cards" : "Entry no cards"}
            </div>
            {isArenaExpanded ? (
              <div className="pointer-events-auto absolute left-4 right-4 top-4 z-[2400] overflow-hidden rounded-lg border border-white/14 bg-[#050912]/88 px-3 py-3 shadow-[0_18px_54px_rgba(0,0,0,.52)] backdrop-blur md:left-auto md:w-fit">
                <span className="pointer-events-none absolute -left-10 -top-9 h-20 w-32 rounded-full bg-cyan-200/18 blur-2xl" aria-hidden="true" />
                <span className="pointer-events-none absolute -right-10 -bottom-10 h-20 w-32 rounded-full bg-lime-200/16 blur-2xl" aria-hidden="true" />
                <div className="relative flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[9px] font-black text-lime-100/66">Arena Online</span>
                  <button type="button" onClick={() => setIsStartMenuOpen(true)} className="rounded bg-lime-300 px-3 py-2 text-[10px] font-black text-black">
                    Start
                  </button>
                  <button type="button" onClick={enableLiveAlerts} className="rounded border border-white/10 bg-white/[.08] px-3 py-2 text-[10px] font-black text-white/78 hover:bg-white/[.13]">
                    {liveAlertsEnabled ? "Alerts on" : "Alerts"}
                  </button>
                  <button type="button" onClick={syncSportmonksLiveEvents} className="rounded border border-white/10 bg-white/[.08] px-3 py-2 text-[10px] font-black text-white/78 hover:bg-white/[.13]">
                    Sync
                  </button>
                  <button type="button" onClick={() => setIsEditingPositions((current) => !current)} className={`rounded px-3 py-2 text-[10px] font-black ${isEditingPositions ? "bg-cyan-300 text-black" : "border border-white/10 bg-white/[.08] text-white/78 hover:bg-white/[.13]"}`}>
                    {isEditingPositions ? "Editing" : "Editor"}
                  </button>
                  {isEditingPositions ? (
                    <>
                      <button type="button" onClick={savePositions} className="rounded bg-emerald-400 px-3 py-2 text-[10px] font-black text-black">
                        Save
                      </button>
                      <button type="button" onClick={resetAutoPositions} className="rounded border border-white/10 bg-white/[.08] px-3 py-2 text-[10px] font-black text-white/78 hover:bg-white/[.13]">
                        Auto
                      </button>
                    </>
                  ) : null}
                  <a
                    href="/visual-qa/arena-video-preview"
                    onPointerDown={handleArenaFullscreenPointerDown}
                    onKeyDown={handleArenaFullscreenKeyDown}
                    className="rounded border border-white/16 bg-black/72 px-3 py-2 text-[10px] font-black text-white hover:bg-black/86"
                  >
                    Exit
                  </a>
                </div>
              </div>
            ) : null}
            {!isStartMenuOpen && !isArenaExpanded ? (
              <button
                type="button"
                onClick={() => setIsStartMenuOpen(true)}
                className="pointer-events-auto absolute bottom-4 left-1/2 z-[2200] -translate-x-1/2 rounded border border-lime-300/45 bg-black/72 px-5 py-3 text-[10px] font-black text-lime-50 shadow-[0_18px_44px_rgba(0,0,0,.48)] backdrop-blur hover:bg-black/86"
              >
                Start Arena Online
              </button>
            ) : null}
            {isStartMenuOpen ? (
              <section
                className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/88 p-3 backdrop-blur-sm"
                aria-label="Arena online start menu"
                style={{ zIndex: 10000 }}
              >
                <div className="w-full max-w-3xl rounded-lg border border-white/14 p-3 shadow-[0_30px_90px_rgba(0,0,0,.66)] md:p-4" style={{ backgroundColor: "#050912" }}>
                  <div className="flex flex-col gap-3 border-b border-white/10 pb-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-[9px] font-black text-lime-100/70">TouchLine Arena Online</p>
                      <h2 className="mt-1 text-2xl font-black  leading-none md:text-3xl">Start</h2>
                      <p className="mt-1 max-w-xl text-[11px] font-bold leading-5 text-white/56">
                        Choose an action and return to the pitch.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsStartMenuOpen(false)}
                      className="w-fit self-start rounded border border-white/12 bg-white/[.07] px-3 py-2 text-[10px] font-black text-white/78 hover:bg-white/[.12] md:self-auto"
                    >
                      Voltar
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {ARENA_ONLINE_ZONES.map((zone) => (
                      <a
                        key={zone.key}
                        href={zone.href}
                        className="group rounded border border-white/10 bg-[#0b111b] px-3 py-3 transition hover:border-lime-200/45 hover:bg-[#142117]"
                      >
                        <p className="text-[8px] font-black text-lime-100/58">{zone.eyebrow}</p>
                        <h3 className="mt-1 text-[11px] font-black  leading-tight text-white md:text-sm">{zone.title}</h3>
                        <span className="mt-2 inline-block text-[9px] font-black text-white/38 group-hover:text-lime-50">
                          Abrir
                        </span>
                      </a>
                    ))}
                  </div>

                </div>
              </section>
            ) : null}
            {isEditingPositions ? (
              <div className="pointer-events-none absolute left-3 top-14 z-[2000] rounded bg-cyan-300/92 px-3 py-2 text-[10px] font-black text-black">
                Drag cards and save
              </div>
            ) : null}
            {saveStatus ? (
              <div className="pointer-events-none absolute left-3 top-[5.7rem] z-[2000] rounded bg-emerald-400/92 px-3 py-2 text-[10px] font-black text-black">
                {saveStatus}
              </div>
            ) : null}
            {isLoop ? (
              <div className="pointer-events-none absolute inset-0">
                {players.length ? (
                  players.map((player) => {
                    const isHovered = hoveredPlayerId === player.id;
                    const baseScale = Math.max(0.42, Math.min(0.54, player.heightVh / 13));
                    const cardScale = isHovered ? baseScale * 3 : baseScale;

                    return (
                      <div
                        key={player.id}
                        className="pointer-events-auto absolute origin-center cursor-zoom-in drop-shadow-[0_22px_38px_rgba(0,0,0,.74)] transition-transform duration-200 ease-out"
                        onPointerDown={(event) => startCardDrag(event, player)}
                        onPointerMove={moveCardDrag}
                        onPointerUp={endCardDrag}
                        onPointerCancel={endCardDrag}
                        onDoubleClick={() => openCardEditor(player)}
                        onMouseEnter={() => setHoveredPlayerId(player.id)}
                        onMouseLeave={() => setHoveredPlayerId(null)}
                        onFocus={() => setHoveredPlayerId(player.id)}
                        onBlur={() => setHoveredPlayerId(null)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") openCardEditor(player);
                        }}
                        tabIndex={0}
                        style={{
                          left: `${player.x}%`,
                          top: `${player.y}%`,
                          width: 430,
                          transform: `translate(-50%, -50%) scale(${isEditingPositions ? baseScale : cardScale})`,
                          zIndex: isHovered ? 3000 : Math.round(player.y * 10),
                          cursor: isEditingPositions ? "grab" : "zoom-in",
                        }}
                      >
                        <TouchlineEliteExactCard player={arenaCardToPlayer(player)} layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY} />
                      </div>
                    );
                  })
                ) : (
                  <div className="absolute left-1/2 top-1/2 max-w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/12 bg-black/72 px-4 py-3 text-center text-xs font-black text-white/70">
                    Salve um card no Card Studio primeiro
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid gap-2 text-[10px] font-black text-white/44 md:grid-cols-2">
            <div className="rounded bg-white/[.04] px-3 py-2">Entry: {ENTRY_VIDEO}</div>
            <div className="rounded bg-white/[.04] px-3 py-2">Loop: {LOOP_VIDEO}</div>
          </div>
        </article>

        <article className="mt-4 rounded-lg border border-white/10 bg-black/36 p-3 shadow-[0_18px_52px_rgba(0,0,0,.28)] backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black text-lime-100/60">Arena Online</p>
              <h2 className="mt-1 text-lg font-black  leading-none">Start inside the pitch</h2>
              <p className="mt-1 max-w-2xl text-xs font-bold leading-5 text-white/50">
                Console-style flow: the user presses Start, opens one area and returns to the Arena.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button type="button" onClick={() => setIsStartMenuOpen(true)} className="rounded bg-lime-300 px-3 py-2 text-[10px] font-black text-black">
                Start
              </button>
              <button type="button" onClick={enableLiveAlerts} className="rounded bg-white/[.08] px-3 py-2 text-[10px] font-black text-white hover:bg-white/[.13]">
                {liveAlertsEnabled ? "Alerts on" : "Alerts"}
              </button>
              <button type="button" onClick={syncSportmonksLiveEvents} className="rounded bg-white/[.08] px-3 py-2 text-[10px] font-black text-white hover:bg-white/[.13]">
                Sync real
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {ARENA_ONLINE_ZONES.map((zone) => (
              <a key={zone.key} href={zone.href} className="rounded border border-white/10 bg-white/[.05] px-3 py-2 text-[10px] font-black text-white/68 transition hover:border-lime-200/45 hover:bg-lime-200/10 hover:text-lime-50">
                {zone.title}
              </a>
            ))}
          </div>

          {liveSyncStatus ? (
            <p className="mt-3 rounded border border-cyan-200/18 bg-cyan-200/8 px-3 py-2 text-xs font-bold leading-5 text-cyan-50/72">{liveSyncStatus}</p>
          ) : null}
          <p className="mt-2 text-[10px] font-black text-white/35">
            Notification status: {notificationStatus} / Latest signal: {arenaAlerts[0]?.title || "None"}
          </p>
        </article>
      </section>
    </main>
  );
}
