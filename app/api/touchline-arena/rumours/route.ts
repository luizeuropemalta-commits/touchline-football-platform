import { NextRequest, NextResponse } from "next/server";

import { withFootballDataCache } from "@/lib/football-data/cache";
import { asString, footballDataFetchJson } from "@/lib/football-data/http";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type {
  TouchlineFantasyEvent,
  TouchlineFantasyFixtureFeed,
  TouchlineFantasyLineupMember,
  TouchlineFantasySidelinedPlayer,
  TouchlineFixture,
} from "@/lib/football-data/types";

const PUBLIC_SOURCE_LABEL = "TouchLine England";

type TouchLineSignalType =
  | "rumor"
  | "confirmed_lineup"
  | "predicted_lineup"
  | "injury"
  | "suspension"
  | "absence"
  | "live_event"
  | "news"
  | "transfer";

type TouchLineSignalStatus = "rumor" | "doubt" | "confirmed" | "official" | "live" | "unavailable";

type TouchLineArenaSignal = {
  id: string;
  type: TouchLineSignalType;
  status: TouchLineSignalStatus;
  title: string;
  summary: string;
  club?: string;
  clubId?: string;
  player?: string;
  playerId?: string;
  fixture?: string;
  fixtureId?: string;
  minute?: number;
  confidence: number;
  happenedAt?: string;
  sourceLabel: typeof PUBLIC_SOURCE_LABEL;
  trace: {
    fixtureId?: string;
    sourceType: "fixture_lineup" | "fixture_sidelined" | "fixture_event" | "live_event" | "news";
    fetchedAt: string;
  };
};

type SportmonksNewsEnvelope = {
  data?: SportmonksNewsItem[];
  message?: string;
};

type SportmonksNewsItem = Record<string, unknown>;

function publicError() {
  return `${PUBLIC_SOURCE_LABEL} updates are temporarily unavailable.`;
}

function relationEntity(item: SportmonksNewsItem, name: string): SportmonksNewsItem | undefined {
  const value = item[name];
  if (!value || typeof value !== "object") return undefined;

  const relation = value as SportmonksNewsItem;
  if (relation.data && typeof relation.data === "object" && !Array.isArray(relation.data)) {
    return relation.data as SportmonksNewsItem;
  }

  return relation;
}

function newsFixtureName(item: SportmonksNewsItem) {
  const fixture = relationEntity(item, "fixture");
  return asString(fixture?.name) ?? asString(fixture?.label) ?? asString(fixture?.fixture_name);
}

function newsClubName(item: SportmonksNewsItem) {
  const participant = relationEntity(item, "participant") ?? relationEntity(item, "team");
  return asString(participant?.name);
}

function signalFromNews(item: SportmonksNewsItem, fetchedAt: string): TouchLineArenaSignal | null {
  const title = asString(item.title) ?? asString(item.name);
  if (!title) return null;

  const fixtureId = asString(item.fixture_id) ?? asString(relationEntity(item, "fixture")?.id);
  const type = asString(item.type);
  const summary = [
    type ? `${PUBLIC_SOURCE_LABEL} ${type.toLowerCase()} update` : `${PUBLIC_SOURCE_LABEL} news update`,
    newsFixtureName(item),
  ].filter(Boolean).join(" / ");

  return {
    id: `news:${asString(item.id) ?? fixtureId ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    type: "news",
    status: "official",
    title,
    summary,
    club: newsClubName(item),
    fixture: newsFixtureName(item),
    fixtureId,
    confidence: 82,
    happenedAt: asString(item.updated_at) ?? asString(item.created_at) ?? fetchedAt,
    sourceLabel: PUBLIC_SOURCE_LABEL,
    trace: { fixtureId, sourceType: "news", fetchedAt },
  };
}

async function fetchPremierTouchLineNewsSignals() {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) {
    return { signals: [] as TouchLineArenaSignal[], warning: publicError() };
  }

  const leagueId = process.env.SPORTMONKS_PREMIER_LEAGUE_ID ?? "8";
  const baseUrl = process.env.SPORTMONKS_BASE_URL ?? "https://api.sportmonks.com/v3/football";
  const endpoints = ["/news/pre-match/upcoming", "/news/pre-match"];
  const warnings: string[] = [];
  const signals: TouchLineArenaSignal[] = [];

  for (const endpoint of endpoints) {
    const result = await withFootballDataCache("daily", ["touchline-arena-news", endpoint, leagueId], async () => {
      const url = new URL(endpoint.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`);
      url.searchParams.set("api_token", token);
      url.searchParams.set("include", "fixture;league;participant");
      url.searchParams.set("filters", `newsitemLeagues:${leagueId}`);
      url.searchParams.set("order", "desc");
      url.searchParams.set("per_page", "12");

      return footballDataFetchJson<SportmonksNewsEnvelope>(url, {
        provider: "sportmonks",
        timeoutMs: 12_000,
      });
    }, 15 * 60);

    if (!result.value.ok) {
      warnings.push(publicError());
      continue;
    }

    const fetchedAt = new Date().toISOString();
    signals.push(...(result.value.data?.data ?? []).map((item) => signalFromNews(item, fetchedAt)).filter((signal): signal is TouchLineArenaSignal => Boolean(signal)));
  }

  return {
    signals,
    warning: warnings[0],
  };
}

function teamNameForId(feed: TouchlineFantasyFixtureFeed, teamId?: string) {
  if (!teamId) return undefined;
  if (feed.fixture.homeTeam?.providerId === teamId) return feed.fixture.homeTeam.name;
  if (feed.fixture.awayTeam?.providerId === teamId) return feed.fixture.awayTeam.name;
  return undefined;
}

function absenceType(item: TouchlineFantasySidelinedPlayer): Pick<TouchLineArenaSignal, "type" | "status" | "confidence"> {
  const text = `${item.category ?? ""} ${item.reason ?? ""}`.toLowerCase();
  if (/suspend|ban|red card/.test(text)) return { type: "suspension", status: "confirmed", confidence: 90 };
  if (/injur|illness|hamstring|knee|ankle|muscle/.test(text)) return { type: "injury", status: "confirmed", confidence: 88 };
  return { type: "absence", status: "confirmed", confidence: 84 };
}

function eventTitle(event: TouchlineFantasyEvent) {
  const type = (event.type ?? "Match event").toLowerCase();
  if (type.includes("goal")) return "Goal recorded";
  if (type.includes("assist")) return "Assist recorded";
  if (type.includes("card")) return "Disciplinary event";
  if (type.includes("substitution")) return "Substitution";
  return event.type ?? "Match event";
}

function signalFromSidelined(feed: TouchlineFantasyFixtureFeed, item: TouchlineFantasySidelinedPlayer): TouchLineArenaSignal {
  const detail = absenceType(item);
  const club = item.teamName ?? teamNameForId(feed, item.teamId);
  return {
    id: `absence:${item.fixtureId}:${item.providerId}`,
    ...detail,
    title: item.playerName ? `${item.playerName} availability update` : "Player availability update",
    summary: [item.reason, item.category].filter(Boolean).join(" / ") || "A player is marked unavailable for this fixture.",
    club,
    clubId: item.teamId,
    player: item.playerName,
    playerId: item.playerId,
    fixture: feed.fixture.name,
    fixtureId: feed.fixture.providerId,
    sourceLabel: PUBLIC_SOURCE_LABEL,
    trace: { fixtureId: feed.fixture.providerId, sourceType: "fixture_sidelined", fetchedAt: feed.fetchedAt },
  };
}

function signalFromLineup(feed: TouchlineFantasyFixtureFeed, item: TouchlineFantasyLineupMember): TouchLineArenaSignal {
  const club = item.teamName ?? teamNameForId(feed, item.teamId);
  return {
    id: `lineup:${item.fixtureId}:${item.providerId}`,
    type: item.isStarter ? "confirmed_lineup" : "predicted_lineup",
    status: item.isStarter ? "confirmed" : "doubt",
    title: item.isStarter ? `${item.playerName} in the XI` : `${item.playerName} squad signal`,
    summary: [item.position, item.jerseyNumber ? `#${item.jerseyNumber}` : null].filter(Boolean).join(" / ") || "Line-up data available.",
    club,
    clubId: item.teamId,
    player: item.playerName,
    playerId: item.playerId,
    fixture: feed.fixture.name,
    fixtureId: feed.fixture.providerId,
    confidence: item.isStarter ? 92 : 62,
    sourceLabel: PUBLIC_SOURCE_LABEL,
    trace: { fixtureId: feed.fixture.providerId, sourceType: "fixture_lineup", fetchedAt: feed.fetchedAt },
  };
}

function signalFromEvent(event: TouchlineFantasyEvent, fetchedAt: string, fixture?: TouchlineFixture): TouchLineArenaSignal {
  return {
    id: `event:${event.fixtureId ?? fixture?.providerId ?? "live"}:${event.providerId}`,
    type: "live_event",
    status: "live",
    title: eventTitle(event),
    summary: [event.playerName, event.relatedPlayerName ? `with ${event.relatedPlayerName}` : null].filter(Boolean).join(" ") || "Live fixture event.",
    clubId: event.teamId,
    player: event.playerName,
    playerId: event.playerId,
    fixture: fixture?.name,
    fixtureId: event.fixtureId ?? fixture?.providerId,
    minute: event.minute,
    confidence: 96,
    happenedAt: fetchedAt,
    sourceLabel: PUBLIC_SOURCE_LABEL,
    trace: { fixtureId: event.fixtureId ?? fixture?.providerId, sourceType: fixture ? "fixture_event" : "live_event", fetchedAt },
  };
}

function fixtureIdsFromRequest(request: NextRequest) {
  const ids = [
    request.nextUrl.searchParams.get("fixtureId"),
    request.nextUrl.searchParams.get("fixtureIds"),
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value));

  return Array.from(new Set(ids)).slice(0, 4);
}

export async function GET(request: NextRequest) {
  const provider = createFootballDataProvider("sportmonks");
  const fixtureIds = fixtureIdsFromRequest(request);
  const signals: TouchLineArenaSignal[] = [];
  const errors: string[] = [];

  const news = await fetchPremierTouchLineNewsSignals();
  signals.push(...news.signals);
  if (news.warning) errors.push(news.warning);

  for (const fixtureId of fixtureIds) {
    const result = await provider.getFixtureFantasyFeed(fixtureId);
    if (!result.ok) {
      errors.push(publicError());
      continue;
    }
    if (!result.data) continue;

    signals.push(...result.data.sidelined.map((item) => signalFromSidelined(result.data!, item)));
    signals.push(...result.data.lineups.slice(0, 36).map((item) => signalFromLineup(result.data!, item)));
    signals.push(...result.data.events.map((event) => signalFromEvent(event, result.data!.fetchedAt, result.data!.fixture)));
  }

  if (!fixtureIds.length) {
    const liveEvents = await provider.getLiveFantasyEvents();
    if (liveEvents.ok) {
      signals.push(...liveEvents.data.map((event) => signalFromEvent(event, liveEvents.fetchedAt)));
    } else if (liveEvents.error.code !== "not_configured") {
      errors.push(publicError());
    }
  }

  const uniqueSignals = Array.from(new Map(signals.map((signal) => [signal.id, signal])).values());

  uniqueSignals.sort((a, b) => {
    const aTime = Date.parse(a.happenedAt ?? a.trace.fetchedAt);
    const bTime = Date.parse(b.happenedAt ?? b.trace.fetchedAt);
    return bTime - aTime || b.confidence - a.confidence;
  });

  return NextResponse.json({
    ok: true,
    sourceLabel: PUBLIC_SOURCE_LABEL,
    data: uniqueSignals.slice(0, 80),
    fetchedAt: new Date().toISOString(),
    status: uniqueSignals.length
      ? `${uniqueSignals.length} TouchLine England news & signals`
      : "No verified TouchLine England signals right now.",
    warnings: errors,
    note: "Signals are generated only from contracted football data available to the server. They are not presented as confirmed news unless the source data supports that status.",
  });
}
