"use client";

import Link from "next/link";

import TouchlineCoachCard from "@/components/touchline/cards/TouchlineCoachCard";
import TouchlineEliteExactCard, { type TouchlineEliteExactPlayer } from "@/components/touchline/cards/TouchlineEliteExactCard";
import TouchlineArenaIntro from "@/components/touchline/arena/TouchlineArenaIntro";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import { AuthLayout } from "@/components/auth-layout";
import ClubHubOfficialLineup from "@/components/touchline/ClubHubOfficialLineup";
import TouchlineMatchCentre from "@/components/touchline/match-centre/TouchlineMatchCentre";
import { createTouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { buildTouchLineClubLineup } from "@/lib/touchlineArena/club-lineup";
import { CLUB_OWNER_SQUAD_CARDS, findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import type { TouchlineFixture } from "@/lib/football-data/types";
import {
  TOUCHLINE_AUDIT_MATCH_STATES,
  TOUCHLINE_AUDIT_PERSONAS,
  TOUCHLINE_AUDIT_ROUTES,
  type TouchlineAuditRoute,
} from "@/lib/touchlineAudit/catalog";

import styles from "./TouchlineAuditStudio.module.css";

type Props = {
  auditToken: string;
  routeId?: string;
  initialPersona?: string;
  initialMatchState?: string;
  initialLanguage?: string;
};

const auditPlayer: TouchlineEliteExactPlayer = {
  sportmonksPlayerId: "audit-demo-player-01",
  overall: "84",
  shirtNumber: 8,
  role: "MID",
  position: "Central Midfielder",
  countryCode3: "ENG",
  name: "AUDIT DEMO PLAYER",
  clubName: "TouchLine United",
  leagueName: "TouchLine England",
  marketValue: "AUDIT DEMO",
  marketValueSource: "unavailable",
  cardTier: "radiant-gold",
  cardPriceVersion: "audit-demo",
  updatedAt: "2026-08-03T00:00:00.000Z",
  age: "25",
  height: "180 cm",
  foot: "Right",
  contract: "Audit demo only",
  nationality: "England",
  totalRating: null,
  seasonStats: { goals: 0, assists: 0, defense: 0, cleanSheets: 0, cards: 0 },
};

const auditCoach = {
  id: "audit-demo-coach-01",
  providerId: "audit-demo-coach-01",
  provider: "sportmonks" as const,
  name: "AUDIT DEMO COACH",
  displayName: "AUDIT DEMO COACH",
  nationality: "England",
  teamId: "audit-team",
  source: { provider: "sportmonks" as const, providerId: "audit-demo-coach-01", raw: { auditDemo: true } },
};

function auditHref(routeId: string, token: string, persona: string, matchState: string, lang: string) {
  const query = new URLSearchParams({ auditToken: token, persona, matchState, lang });
  return `/audit/${routeId}?${query.toString()}`;
}

function auditIndexHref(token: string, persona: string, matchState: string, lang: string) {
  const query = new URLSearchParams({ auditToken: token, persona, matchState, lang });
  return `/audit-index?${query.toString()}`;
}

function groupRoutes() {
  return TOUCHLINE_AUDIT_ROUTES.reduce<Record<string, TouchlineAuditRoute[]>>((groups, route) => {
    (groups[route.group] ??= []).push(route);
    return groups;
  }, {});
}

const englishGroups: Record<string, string> = {
  "Público e autenticação": "Public and authentication", "Cards e economia": "Cards and economy", "Competição": "Competition", "Comunicação": "Communication", "Admin demonstrativo": "Admin demonstration",
};

const englishTitles: Record<string, string> = {
  "cards/tier-gallery": "Seven tiers and frames", "club-owner/renewals": "Renewals", "club-owner/frozen": "Frozen / maintenance", "arena/no-round": "No round", "arena/upcoming": "Upcoming round", "arena/half-time": "Half-time", "arena/pitch-empty": "Empty pitch", "arena/pitch-complete": "Complete pitch", "arena/frozen": "Frozen state", "match-centre/half-time": "Half-time", "match-centre/invalid-fixture": "Invalid fixture", "match-centre/no-fixture": "No fixture", "market/empty": "Empty / unavailable", "profiles/no-data": "No data", "competition/table": "League table", "competition/statistics": "Scorers and statistics",
};

const portugueseTitles: Record<string, string> = {
  "public/home": "Início", "public/login": "Entrar", "public/register": "Criar conta", "public/forgot-password": "Recuperar palavra-passe", "public/reset-password": "Redefinir palavra-passe", "public/error": "Erro", "public/404": "Página não encontrada", "public/maintenance": "Manutenção",
  "onboarding/new-user": "Novo utilizador", "onboarding/club-identity": "Identidade do clube", "onboarding/choose-coach": "Escolha o seu treinador", "onboarding/coach-selected": "Treinador selecionado", "onboarding/squad-empty": "Elenco vazio", "onboarding/squad-partial": "Elenco parcial", "onboarding/squad-complete": "Elenco completo", "onboarding/club-confirmation": "Confirmação do clube",
  "cards/tier-gallery": "Galeria de tiers", "cards/player": "Card de jogador", "cards/coach": "Card de treinador", "cards/states": "Estados do card",
  "club-owner/hub": "Club Hub", "club-owner/history": "Histórico", "club-owner/renewals": "Renovações", "club-owner/substitutions": "Substituições", "club-owner/frozen": "Clube congelado",
  "arena/intro": "Introdução da Arena", "arena/no-round": "Sem rodada", "arena/upcoming": "Próxima rodada", "arena/live": "Ao vivo", "arena/half-time": "Intervalo", "arena/finished": "Encerrado", "arena/pitch-empty": "Campo vazio", "arena/pitch-complete": "Campo completo", "arena/frozen": "Elegibilidade congelada",
  "match-centre/upcoming": "Próxima partida", "match-centre/live": "Partida ao vivo", "match-centre/half-time": "Intervalo", "match-centre/finished": "Partida encerrada", "match-centre/archive": "Arquivo", "match-centre/invalid-fixture": "Partida inválida", "match-centre/no-fixture": "Sem partida",
  "market/list": "Lista do Mercado", "market/players": "Jogadores", "market/coaches": "Treinadores", "market/cart": "Carrinho", "market/empty": "Mercado vazio",
  "profiles/player": "Perfil do jogador", "profiles/coach": "Perfil do treinador", "profiles/club": "Perfil do clube", "profiles/no-data": "Sem dados",
  "competition/table": "Tabela da liga", "competition/rankings": "Rankings", "competition/top-11": "Top 11", "competition/statistics": "Estatísticas",
  "communication/central": "TouchLine Central", "communication/inbox": "Caixa de entrada", "communication/notifications": "Notificações", "admin/overview": "Visão geral Admin", "admin/cards": "Cards Admin", "admin/finance": "Finanças Admin",
};

function localizedRoute(route: TouchlineAuditRoute, language: string) {
  if (language === "pt-BR") {
    const title = portugueseTitles[route.id] ?? route.title;
    return { ...route, title, description: `Representação de auditoria somente leitura de ${title}.` };
  }
  const title = englishTitles[route.id] ?? route.title;
  return { ...route, group: englishGroups[route.group] ?? route.group, title, description: `Read-only audit representation of ${title}.` };
}

function words(language: string) {
  const pt = language === "pt-BR";
  return pt ? {
    index: "Índice de auditoria", temporary: "Mirror temporário somente leitura", demo: "DADOS DE AUDITORIA", context: "sem conta de produção, API ou ação de escrita", persona: "Persona", state: "Estado da partida", language: "Idioma", readonly: "SOMENTE LEITURA", current: "Persona atual", boundary: "Limite de dados", note: "Nota de auditoria", safe: "Dados demonstrativos sanitizados; nenhuma conta, saldo, identificador privado ou ação real.", action: "Ação desativada", coach: "A escolha do treinador é obrigatória antes dos jogadores.", inspect: "Inspecione estrutura, conteúdo, navegação e estados como apresentados.",
  } : {
    index: "Audit index", temporary: "Temporary read-only mirror", demo: "AUDIT DEMO DATA", context: "no production account, API or write action", persona: "Persona", state: "Match state", language: "Language", readonly: "READ-ONLY", current: "Current persona", boundary: "Data boundary", note: "Audit note", safe: "Sanitised demonstration data; no account, balance, private identifier or real action.", action: "Action disabled", coach: "Coach selection is required before the player stage.", inspect: "Inspect structure, content, navigation and states exactly as presented.",
  };
}

export function TouchlineAuditStudio({ auditToken, routeId, initialPersona, initialMatchState, initialLanguage }: Props) {
  const groupedRoutes = groupRoutes();
  const persona = TOUCHLINE_AUDIT_PERSONAS.includes(initialPersona as (typeof TOUCHLINE_AUDIT_PERSONAS)[number]) ? initialPersona! : "Anonymous";
  const matchState = TOUCHLINE_AUDIT_MATCH_STATES.includes(initialMatchState as (typeof TOUCHLINE_AUDIT_MATCH_STATES)[number]) ? initialMatchState! : "Upcoming";
  const language = initialLanguage === "pt-BR" ? "pt-BR" : "en-GB";
  const copy = words(language);
  const currentRoute = TOUCHLINE_AUDIT_ROUTES.find((route) => route.id === routeId);
  const coachSlot = createTouchlineArenaCoachSlot(auditCoach, null, "sapphire-blue");

  return (
    <main className={styles.page}>
      <header className={styles.banner}>
        <span className={styles.auditMark}>AUDIT MODE</span>
        <span>{copy.temporary} · {copy.demo} · {copy.context}</span>
        <Link href={auditIndexHref(auditToken, persona, matchState, language)}>{copy.index}</Link>
      </header>

      <section className={styles.controlBar} aria-label="Audit controls">
        <label>{copy.persona}
          <select value={persona} onChange={(event) => { window.location.href = routeId ? auditHref(routeId, auditToken, event.target.value, matchState, language) : auditIndexHref(auditToken, event.target.value, matchState, language); }}>
            {TOUCHLINE_AUDIT_PERSONAS.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>{copy.state}
          <select value={matchState} onChange={(event) => { window.location.href = routeId ? auditHref(routeId, auditToken, persona, event.target.value, language) : auditIndexHref(auditToken, persona, event.target.value, language); }}>
            {TOUCHLINE_AUDIT_MATCH_STATES.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>{copy.language}
          <select value={language} onChange={(event) => { window.location.href = routeId ? auditHref(routeId, auditToken, persona, matchState, event.target.value) : auditIndexHref(auditToken, persona, matchState, event.target.value); }}>
            <option value="en-GB">English</option><option value="pt-BR">Português</option>
          </select>
        </label>
        <span className={styles.context}>/{routeId ?? "audit-index"} · {persona} · {matchState}</span>
      </section>

      {currentRoute ? (
        <AuditRoutePreview route={localizedRoute(currentRoute, language)} auditToken={auditToken} persona={persona} matchState={matchState} language={language} player={auditPlayer} coachSlot={coachSlot} />
      ) : (
        <AuditIndex groupedRoutes={groupedRoutes} auditToken={auditToken} persona={persona} matchState={matchState} language={language} />
      )}
    </main>
  );
}

function AuditIndex({ groupedRoutes, auditToken, persona, matchState, language }: {
  groupedRoutes: Record<string, TouchlineAuditRoute[]>; auditToken: string; persona: string; matchState: string; language: string;
}) {
  return <section className={styles.index}>
    <div className={styles.hero}><p className={styles.eyebrow}>TOUCHLINE / {language === "pt-BR" ? "REVISÃO EXTERNA" : "EXTERNAL REVIEW"}</p><h1>{language === "pt-BR" ? "Índice completo de auditoria" : "Full product audit index"}</h1><p>{language === "pt-BR" ? "Cada link abre uma representação visual segura e sanitizada. Revise o sistema visual real e registre problemas; ações permanecem desativadas." : "Every link opens a safe, sanitised visual representation. Review the real visual system and report issues; actions remain disabled."}</p></div>
    {Object.entries(groupedRoutes).map(([group, routes]) => <section key={group} className={styles.routeGroup}>
      <h2>{language === "pt-BR" ? group : englishGroups[group] ?? group}</h2><div className={styles.routeGrid}>{routes.map((route) => { const display = localizedRoute(route, language); return <Link key={route.id} className={styles.routeLink} href={auditHref(route.id, auditToken, persona, matchState, language)}><strong>{display.title}</strong><span>{display.description}</span><code>/audit/{route.id}</code></Link>; })}</div>
    </section>)}
  </section>;
}

function AuditAuth({ route, language }: { route: TouchlineAuditRoute; language: string }) {
  const pt = language === "pt-BR";
  const mode = route.id.split("/")[1];
  const heading = mode === "login" ? (pt ? "Entrar na Arena" : "Enter the Arena") : mode === "register" ? (pt ? "Criar conta" : "Create your account") : mode === "forgot-password" ? (pt ? "Recuperar acesso" : "Recover access") : (pt ? "Redefinir senha" : "Reset password");
  return <AuthLayout locale={language} cinematic={mode === "register"}><form className="space-y-4" onSubmit={(event) => event.preventDefault()}><p className="text-sm text-slate-300">{heading} · {pt ? "modo de auditoria" : "audit mode"}</p>{mode === "register" ? <input disabled placeholder={pt ? "Nome completo" : "Full name"} className="w-full rounded-xl border border-white/10 bg-black/30 p-3" /> : null}<input disabled placeholder="email@audit.demo" className="w-full rounded-xl border border-white/10 bg-black/30 p-3" /><input disabled placeholder={pt ? "Palavra-passe" : "Password"} className="w-full rounded-xl border border-white/10 bg-black/30 p-3" /><button disabled className="w-full rounded-xl bg-[#a3ff12]/20 p-3 font-black text-[#b7ff45]">{pt ? "Envio desativado" : "Submission disabled"}</button></form></AuthLayout>;
}

function AuditHome({ language }: { language: string }) {
  const pt = language === "pt-BR";
  return <section className={styles.productSurface}><nav><strong>TOUCHLINE</strong><span>{pt ? "Arena" : "Arena"}</span><span>{pt ? "Mercado" : "Market"}</span><span>{pt ? "Competição" : "Competition"}</span></nav><div className={styles.landingHero}><p>{pt ? "TOUCHLINE ENGLAND" : "TOUCHLINE ENGLAND"}</p><h2>{pt ? "O seu clube. A sua jornada." : "Your club. Your journey."}</h2><span>{pt ? "Cards oficiais, clube, escalação e Arena." : "Official cards, club ownership, squad building and Arena."}</span><div><button disabled>{pt ? "Começar jornada" : "Start journey"}</button><button disabled>{pt ? "Explorar competição" : "Explore competition"}</button></div></div><section className={styles.featureTiles}>{[pt ? "Cards oficiais" : "Official cards", pt ? "ClubOwner" : "ClubOwner", pt ? "Arena ao vivo" : "Live Arena"].map((label) => <article key={label}><b>{label}</b><span>{pt ? "Estado visual de auditoria" : "Audit visual state"}</span></article>)}</section></section>;
}

function AuditClubOwnerPage({ route, language, player, coachSlot }: { route: TouchlineAuditRoute; language: string; player: TouchlineEliteExactPlayer; coachSlot: ReturnType<typeof createTouchlineArenaCoachSlot> }) {
  const club = findTouchLineClub("Manchester United");
  if (!club) return null;
  const lineup = buildTouchLineClubLineup({ club, squadCards: CLUB_OWNER_SQUAD_CARDS });
  const pt = language === "pt-BR";
  const navigation = <header className={styles.productNav}><strong>ClubHub</strong><span>{pt ? "Histórico" : "History"}</span><span>{pt ? "Renovações" : "Renewals"}</span><span>{pt ? "Substituições" : "Substitutions"}</span></header>;
  if (route.id === "club-owner/hub") return <section className={styles.realSurface}>{navigation}<ClubHubOfficialLineup clubName={club.name} lineup={lineup} locale={language} labels={{ nationality: pt ? "País" : "Nat", points: pt ? "Pontos" : "Points", totalPoints: pt ? "Pontos TouchLine" : "TouchLine points", cardPrice: "TC" }} /></section>;
  if (route.id === "club-owner/history") return <section className={styles.realSurface}>{navigation}<div className={styles.historySurface}><h2>{pt ? "Histórico do clube" : "Club history"}</h2>{[pt ? "Clube criado" : "Club created", pt ? "Primeira escalação confirmada" : "First line-up confirmed", pt ? "Rodada concluída" : "Matchweek completed"].map((item, index) => <article key={item}><span>2026/{27 - index}</span><b>{item}</b><small>{pt ? "Registro de auditoria" : "Audit record"}</small></article>)}</div></section>;
  if (route.id === "club-owner/renewals") return <section className={styles.realSurface}>{navigation}<div className={styles.renewalSurface}><h2>{pt ? "Central de renovações" : "Renewal Centre"}</h2><article><TouchlineEliteExactCard player={player} initialRenderScale={0.3} optimizeForLiveCompact subscribeToRanking={false} enableInteractiveNeon={false} showCardActions={false} showProfileAction={false} showSocialMetrics={false} rankingMode="preview" /><div><b>{player.name}</b><span>{pt ? "Contrato termina no fim da temporada" : "Contract ends at season end"}</span><button disabled>{pt ? "Renovar desativado" : "Renewal disabled"}</button></div></article></div></section>;
  if (route.id === "club-owner/substitutions") return <section className={styles.realSurface}>{navigation}<div className={styles.substitutionSurface}><h2>{pt ? "Substituições" : "Substitutions"}</h2><TouchlinePitchSurface ariaLabel="Substitution pitch" className={styles.pitch}><span className={styles.pitchMarker} style={{ left: "46%", top: "43%" }}>CM</span></TouchlinePitchSurface><aside><b>{pt ? "Banco" : "Bench"}</b>{["DEF", "MID", "FWD"].map((role) => <button disabled key={role}>{role} · {pt ? "Trocar" : "Swap"}</button>)}</aside></div></section>;
  return <section className={styles.realSurface}>{navigation}<div className={styles.frozenSurface}><span>{pt ? "Manutenção vencida" : "Maintenance expired"}</span><h2>{pt ? "Clube preservado; entrada em novas rodadas bloqueada." : "Club preserved; entry into new matchweeks is blocked."}</h2><p>{pt ? "Histórico, cards, treinador e elenco permanecem disponíveis." : "History, cards, coach and squad remain available."}</p><button disabled>{pt ? "Reativar manutenção desativado" : "Reactivate maintenance disabled"}</button></div></section>;
}

function auditFixtures(matchState: string): TouchlineFixture[] {
  const base = { provider: "sportmonks" as const, providerId: "audit", raw: { auditDemo: true } };
  return [
    { id: "audit-live", providerId: "audit-live", provider: "sportmonks" as const, name: "TouchLine United vs Audit City", startsAt: "2026-08-03T15:00:00.000Z", status: matchState === "Live" ? "LIVE" : "FT", homeScore: 2, awayScore: 1, competitionId: "audit-england", seasonId: "2026/27", homeTeam: { id: "audit-home", providerId: "audit-home", provider: "sportmonks" as const, name: "TouchLine United", source: base }, awayTeam: { id: "audit-away", providerId: "audit-away", provider: "sportmonks" as const, name: "Audit City", source: base }, source: base },
    { id: "audit-upcoming", providerId: "audit-upcoming", provider: "sportmonks" as const, name: "Audit Rovers vs TouchLine FC", startsAt: "2026-08-10T15:00:00.000Z", status: "NS", competitionId: "audit-england", seasonId: "2026/27", homeTeam: { id: "audit-rovers", providerId: "audit-rovers", provider: "sportmonks" as const, name: "Audit Rovers", source: base }, awayTeam: { id: "audit-fc", providerId: "audit-fc", provider: "sportmonks" as const, name: "TouchLine FC", source: base }, source: base },
  ];
}

function AuditMatchCentrePage({ route, matchState, language }: { route: TouchlineAuditRoute; matchState: string; language: string }) {
  const pt = language === "pt-BR";
  const unavailable = route.id === "match-centre/no-fixture" || route.id === "match-centre/invalid-fixture";
  const fixtures = unavailable ? [] : auditFixtures(route.id === "match-centre/archive" ? "Finished" : matchState);
  return <div className={styles.realSurface}>
    {route.id === "match-centre/invalid-fixture" ? <p className={styles.auditRouteNotice}>{pt ? "A partida solicitada não existe ou já não está disponível." : "The requested fixture does not exist or is no longer available."}</p> : null}
    {route.id === "match-centre/archive" ? <p className={styles.auditRouteNotice}>{pt ? "Arquivo de partidas encerradas." : "Finished match archive."}</p> : null}
    <TouchlineMatchCentre
      initialFixtures={fixtures}
      initialFixtureId={fixtures[0]?.id}
      initialLocale={language === "pt-BR" ? "pt-BR" : "en-GB"}
      initialNow={Date.parse("2026-08-20T13:00:00.000Z")}
      initialTimeZone="UTC"
    />
  </div>;
}

function AuditArenaPage({ route, language, matchState, persona, player, coachSlot }: { route: TouchlineAuditRoute; language: string; matchState: string; persona: string; player: TouchlineEliteExactPlayer; coachSlot: ReturnType<typeof createTouchlineArenaCoachSlot> }) {
  const pt = language === "pt-BR";
  const nav = <header className={styles.productNav}><strong>TouchLine Arena</strong><span>{pt ? "Rodada 1" : "Matchweek 1"}</span><span className={styles.liveChip}>{matchState}</span><button disabled>{pt ? "Assistir introdução" : "Watch intro"}</button></header>;
  if (persona === "Anonymous") return <section className={styles.realSurface}>{nav}<div className={styles.arenaBoundary}><h2>{pt ? "Entre para montar o seu clube" : "Enter to build your club"}</h2><p>{pt ? "A Arena pode ser explorada; ações de ClubOwner exigem acesso." : "Arena can be explored; ClubOwner actions require access."}</p><button disabled>{pt ? "Entrar desativado" : "Sign in disabled"}</button></div></section>;
  if (route.id === "arena/intro") return <section className={styles.realSurface}><TouchlineArenaIntro locale={language} mode="first" onComplete={() => undefined} onReveal={() => undefined} onSequenceStart={() => undefined} onSkip={() => undefined} /><p className={styles.auditRouteNotice}>{pt ? "Introdução oficial reproduzida em modo de auditoria; nenhum estado de conta é guardado." : "Official intro replayed in audit mode; no account state is stored."}</p></section>;
  if (persona === "ClubOwner no coach") return <section className={styles.realSurface}>{nav}<div className={styles.coachFirstArena}><p>{pt ? "Passo obrigatório" : "Required step"}</p><h2>{pt ? "Escolha o seu treinador" : "Choose your coach"}</h2><TouchlineCoachCard coach={auditCoach} slot={coachSlot} clubName="TouchLine United" countryCode3="ENG" displayMode="compact" optimizeForLiveCompact enableInteractiveNeon={false} /><button disabled>{pt ? "Confirmar treinador" : "Confirm coach"}</button></div></section>;
  if (route.id === "arena/no-round") return <section className={styles.realSurface}>{nav}<div className={styles.noRound}><h2>{pt ? "Nenhuma rodada disponível" : "No matchweek available"}</h2><p>{pt ? "O seu clube e os seus cards permanecem disponíveis na Arena." : "Your club and cards remain available in the Arena."}</p><button disabled>{pt ? "Ver histórico" : "View history"}</button></div></section>;
  if (route.id === "arena/frozen" || persona === "Frozen club") return <section className={styles.realSurface}>{nav}<div className={styles.frozenSurface}><span>{pt ? "Elegibilidade bloqueada" : "Eligibility locked"}</span><h2>{pt ? "A manutenção impede apenas a próxima rodada." : "Maintenance blocks only the next matchweek."}</h2><p>{pt ? "Resultados bloqueados anteriormente não foram alterados." : "Previously locked results remain unchanged."}</p></div></section>;
  const emptyPitch = route.id === "arena/pitch-empty";
  const finished = route.id === "arena/finished" || matchState === "Finished";
  const halftime = route.id === "arena/half-time" || matchState === "Half-time";
  const live = route.id === "arena/live" || matchState === "Live";
  return <section className={styles.realSurface}>{nav}<div className={styles.carousel}><article>{pt ? "Carrossel da rodada" : "Matchweek carousel"}<b>TouchLine United — Audit City</b><small>{finished ? "FT · 2–1" : halftime ? "HT · 1–0" : live ? "63' · LIVE · 1–0" : "Sat · 15:00"}</small></article><article>{pt ? "Match Centre" : "Match Centre"}<button disabled>{pt ? "Abrir partida" : "Open match"}</button></article></div><div className={styles.arenaLayout}><TouchlinePitchSurface ariaLabel="Audit Arena pitch" className={styles.pitch}>{emptyPitch ? <span className={styles.emptyPitchLabel}>{pt ? "Formação vazia" : "Empty formation"}</span> : <div className={styles.auditCardSpot}><TouchlineEliteExactCard player={{ ...player, matchRating: live ? 8 : finished ? 12 : null }} initialRenderScale={0.28} optimizeForLiveCompact subscribeToRanking={false} enableInteractiveNeon={false} showCardActions={false} showProfileAction={false} showSocialMetrics={false} rankingMode="preview" /></div>}</TouchlinePitchSurface><aside><span>{pt ? "Treinador" : "Coach"}</span><TouchlineCoachCard coach={auditCoach} slot={coachSlot} clubName="TouchLine United" countryCode3="ENG" displayMode="compact" optimizeForLiveCompact enableInteractiveNeon={false} /><b>{finished ? (pt ? "Nota final: 12" : "Final rating: 12") : live ? (pt ? "Nota ao vivo: 8" : "Live rating: 8") : (pt ? "Escalação em preparação" : "Line-up preparing")}</b><button disabled>{pt ? "Entrar na rodada" : "Enter round"}</button></aside></div></section>;
}

function AuditMarketPage({ route, language, player, coachSlot }: { route: TouchlineAuditRoute; language: string; player: TouchlineEliteExactPlayer; coachSlot: ReturnType<typeof createTouchlineArenaCoachSlot> }) {
  const pt = language === "pt-BR";
  const coaches = route.id === "market/coaches";
  const empty = route.id === "market/empty";
  const cart = route.id === "market/cart";
  return <section className={styles.productSurface}><header className={styles.productNav}><strong>TouchLine Market</strong><input disabled placeholder={pt ? "Pesquisar jogadores ou treinadores" : "Search players or coaches"} /><button disabled>{pt ? `Carrinho (${cart ? 2 : 0})` : `Cart (${cart ? 2 : 0})`}</button></header><div className={styles.marketTabs}><b className={!coaches ? styles.activeTab : ""}>{pt ? "Jogadores" : "Players"}</b><b className={coaches ? styles.activeTab : ""}>{pt ? "Treinadores" : "Coaches"}</b><span>{pt ? "Disponibilidade" : "Availability"}</span></div><div className={styles.marketGrid}><aside><b>{pt ? "Filtros" : "Filters"}</b><button disabled>{pt ? "Todas as posições" : "All positions"}</button><button disabled>{pt ? "Todas as molduras" : "All frames"}</button><button disabled>{pt ? "Ordenar: relevância" : "Sort: relevance"}</button></aside><section><header><b>{empty ? (pt ? "Nenhum card disponível" : "No cards available") : coaches ? (pt ? "Treinadores disponíveis" : "Available coaches") : (pt ? "Jogadores disponíveis" : "Available players")}</b><span>{empty ? (pt ? "Altere os filtros" : "Change filters") : (pt ? "Moldura, preço e estado" : "Frame, price and status")}</span></header>{empty ? <div className={styles.marketEmpty}><h3>{pt ? "Sem resultados" : "No results"}</h3><p>{pt ? "Nenhum card corresponde aos filtros atuais." : "No cards match the current filters."}</p></div> : <div className={styles.marketCards}>{coaches ? <TouchlineCoachCard coach={auditCoach} slot={coachSlot} clubName="TouchLine United" countryCode3="ENG" displayMode="compact" optimizeForLiveCompact enableInteractiveNeon={false} /> : <><TouchlineEliteExactCard player={player} initialRenderScale={0.34} optimizeForLiveCompact subscribeToRanking={false} enableInteractiveNeon={false} showCardActions={false} showProfileAction={false} showSocialMetrics={false} rankingMode="preview" /><TouchlineEliteExactCard player={{ ...player, sportmonksPlayerId: "audit-player-2", name: "SECOND AUDIT PLAYER", cardTier: "sapphire-blue" }} initialRenderScale={0.34} optimizeForLiveCompact subscribeToRanking={false} enableInteractiveNeon={false} showCardActions={false} showProfileAction={false} showSocialMetrics={false} rankingMode="preview" /></>}</div>}</section><aside><b>{pt ? "Resumo do carrinho" : "Cart summary"}</b>{cart ? <><span>{pt ? "2 cards selecionados" : "2 cards selected"}</span><b>£5</b></> : <span>{pt ? "Sem itens" : "No items"}</span>}<button disabled>{pt ? "Checkout desativado" : "Checkout disabled"}</button></aside></div></section>;
}

function AuditProfilePage({ route, language, player, coachSlot }: { route: TouchlineAuditRoute; language: string; player: TouchlineEliteExactPlayer; coachSlot: ReturnType<typeof createTouchlineArenaCoachSlot> }) {
  const pt = language === "pt-BR";
  if (route.id === "profiles/no-data") return <section className={styles.profileSurface}><header className={styles.productNav}><strong>{pt ? "Perfil" : "Profile"}</strong></header><div className={styles.profileEmpty}><h2>{pt ? "Dados ainda não disponíveis" : "Data not available yet"}</h2><p>{pt ? "Este é o estado real de perfil sem uma fonte verificada." : "This is the real profile state without a verified source."}</p></div></section>;
  if (route.id === "profiles/coach") return <section className={styles.profileSurface}><header className={styles.productNav}><strong>{pt ? "Perfil do treinador" : "Coach profile"}</strong><span>{pt ? "Futebol real" : "Real football"}</span><span>TouchLine</span></header><div className={styles.profileGrid}><TouchlineCoachCard coach={auditCoach} slot={coachSlot} clubName="TouchLine United" countryCode3="ENG" displayMode="compact" optimizeForLiveCompact enableInteractiveNeon={false} /><section><p>{pt ? "Carreira real" : "Real career"}</p><h2>{auditCoach.displayName}</h2><dl><div><dt>{pt ? "Clube atual" : "Current club"}</dt><dd>TouchLine United</dd></div><div><dt>{pt ? "Liga anterior" : "Previous league"}</dt><dd>Audit Premier Division</dd></div><div><dt>{pt ? "Posição final" : "Final position"}</dt><dd>5</dd></div><div><dt>{pt ? "Temporada" : "Last completed season"}</dt><dd>2025/26</dd></div></dl><p>{pt ? "Reputação TouchLine" : "TouchLine reputation"}</p><dl><div><dt>{pt ? "Tier" : "Tier"}</dt><dd>Sapphire Blue</dd></div><div><dt>{pt ? "Motivo" : "Reason"}</dt><dd>{pt ? "Classificação aguardando fonte auditada" : "Classification pending audited source"}</dd></div></dl></section></div></section>;
  if (route.id === "profiles/club") return <section className={styles.profileSurface}><header className={styles.productNav}><strong>{pt ? "Perfil do clube" : "Club profile"}</strong><span>{pt ? "Elenco" : "Squad"}</span><span>{pt ? "Jogos" : "Fixtures"}</span><span>{pt ? "Trofeus" : "Trophies"}</span></header><div className={styles.clubProfile}><section><h2>TouchLine United</h2><p>{pt ? "Informação do clube real" : "Real club information"}</p><dl><div><dt>{pt ? "Posição" : "Table position"}</dt><dd>4</dd></div><div><dt>{pt ? "Próximo jogo" : "Next fixture"}</dt><dd>vs Audit City</dd></div></dl></section><section><h3>{pt ? "Módulos TouchLine" : "TouchLine modules"}</h3><span>{pt ? "Entrada no Match Centre" : "Match Centre entry"}</span><span>{pt ? "Cards e pontos" : "Cards and points"}</span></section></div></section>;
  return <section className={styles.profileSurface}><header className={styles.productNav}><strong>{pt ? "Perfil do jogador" : "Player profile"}</strong><span>{pt ? "Futebol real" : "Real football"}</span><span>{pt ? "Dados TouchLine" : "TouchLine data"}</span></header><div className={styles.profileGrid}><TouchlineEliteExactCard player={player} initialRenderScale={0.42} optimizeForLiveCompact subscribeToRanking={false} enableInteractiveNeon={false} showCardActions={false} showProfileAction={false} showSocialMetrics={false} rankingMode="preview" /><section><p>{pt ? "Futebol real" : "Real football"}</p><h2>{player.name}</h2><dl><div><dt>{pt ? "Posição" : "Position"}</dt><dd>{player.position}</dd></div><div><dt>{pt ? "Clube" : "Club"}</dt><dd>{player.clubName}</dd></div><div><dt>{pt ? "Forma" : "Form"}</dt><dd>7.4</dd></div><div><dt>{pt ? "Histórico" : "History"}</dt><dd>{pt ? "Dados sanitizados" : "Sanitised data"}</dd></div></dl><p>{pt ? "Dados TouchLine" : "TouchLine Game"}</p><dl><div><dt>{pt ? "Tier" : "Tier"}</dt><dd>Radiant Gold</dd></div><div><dt>{pt ? "Pontos" : "Points"}</dt><dd>0</dd></div></dl></section></div></section>;
}

function AuditCompetitionPage({ route, language }: { route: TouchlineAuditRoute; language: string }) {
  const pt = language === "pt-BR";
  const names = ["TouchLine United", "Audit City", "Arena Rovers", "Demo FC", "North Star", "Southbank", "Crown Athletic", "Harbour FC", "Kingsbridge", "Redwood", "Westside", "Eastside"];
  if (route.id === "competition/top-11") return <section className={styles.dataSurface}><header className={styles.productNav}><strong>Top 11</strong><span>{pt ? "Rodada 1" : "Matchweek 1"}</span></header><div className={styles.topEleven}>{names.slice(0, 11).map((name, index) => <article key={name}><span>{index + 1}</span><b>{name}</b><small>{["GK", "DEF", "MID", "FWD"][index % 4]} · {12 - index} pts</small></article>)}</div></section>;
  if (route.id === "competition/statistics") return <section className={styles.dataSurface}><header className={styles.productNav}><strong>{pt ? "Estatísticas" : "Statistics"}</strong><span>{pt ? "Temporada 2026/27" : "Season 2026/27"}</span></header><div className={styles.statColumns}>{[[pt ? "Artilheiros" : "Scorers", pt ? "10 golos" : "10 goals"], [pt ? "Assistências" : "Assists", pt ? "8 assistências" : "8 assists"], [pt ? "Jogos sem sofrer golo" : "Clean sheets", pt ? "7 jogos sem sofrer golo" : "7 clean sheets"], [pt ? "Recordes" : "Records", "12 pts"]].map(([label, value]) => <article key={label}><b>{label}</b><span>Audit Player</span><strong>{value}</strong></article>)}</div></section>;
  return <section className={styles.dataSurface}><header className={styles.productNav}><strong>{route.id === "competition/rankings" ? (pt ? "Rankings TouchLine" : "TouchLine rankings") : (pt ? "Tabela da liga" : "League table")}</strong><span>{pt ? "Temporada 2026/27" : "Season 2026/27"}</span><button disabled>{pt ? "Filtro" : "Filter"}</button></header><div className={styles.leagueTable}>{names.map((name, index) => <article key={name}><span>{index + 1}</span><b>{name}</b><small>{index + 1} {pt ? "jogos" : "matches"}</small><strong>{28 - index} pts</strong></article>)}</div></section>;
}

function AuditCommunicationPage({ route, language }: { route: TouchlineAuditRoute; language: string }) {
  const pt = language === "pt-BR";
  const messages = [[pt ? "Manutenção da competição" : "Competition maintenance", pt ? "Prioridade alta" : "High priority", true], [pt ? "Rodada disponível" : "Matchweek available", pt ? "TouchLine England" : "TouchLine England", false], [pt ? "Atualização de contrato" : "Contract update", pt ? "Mensagem do clube" : "Club message", false]] as const;
  return <section className={styles.dataSurface}><header className={styles.productNav}><strong>{route.id === "communication/central" ? "TouchLine Central" : route.id === "communication/inbox" ? (pt ? "Caixa de entrada" : "Inbox") : (pt ? "Notificações" : "Notifications")}</strong><span>{pt ? "Todas" : "All"}</span><button disabled>{pt ? "Filtros" : "Filters"}</button></header><aside className={styles.messageFilters}><b>{pt ? "Global" : "Global"}</b><b>{pt ? "Competição" : "Competition"}</b><b>{pt ? "Não lidas" : "Unread"}</b></aside><div className={styles.messageList}>{messages.map(([title, category, unread], index) => <article key={title}><span className={unread ? styles.unread : ""}>{unread ? "●" : "○"}</span><div><b>{title}</b><p>{pt ? "Mensagem demonstrativa com link profundo seguro e histórico persistente visível." : "Demonstration message with safe deep link and visible persistent history."}</p></div><small>{category} · {index + 1}h</small></article>)}</div></section>;
}

function AuditAdminPage({ route, language }: { route: TouchlineAuditRoute; language: string }) {
  const pt = language === "pt-BR";
  if (route.id === "admin/overview") return <section className={styles.dataSurface}><header className={styles.productNav}><strong>Admin</strong><span>{pt ? "Somente leitura" : "Read-only"}</span></header><div className={styles.adminStats}>{[[pt ? "Saúde do sistema" : "System health", "Healthy"], [pt ? "Sincronização" : "Sync", "20/20"], [pt ? "ClubOwners" : "ClubOwners", "100"], [pt ? "Alertas" : "Alerts", "2"]].map(([label, value]) => <article key={label}><span>{label}</span><b>{value}</b><small>{pt ? "Dados de auditoria" : "Audit data"}</small></article>)}</div><div className={styles.jobList}>{["fixture-sync", "card-validation", "notification-snapshot"].map((job) => <article key={job}><b>{job}</b><span>ready</span><small>audit-demo</small></article>)}</div></section>;
  if (route.id === "admin/cards") return <section className={styles.dataSurface}><header className={styles.productNav}><strong>{pt ? "Catálogo de cards" : "Card catalogue"}</strong><span>{pt ? "Validação" : "Validation"}</span></header><div className={styles.cardAdminRows}>{[["Ruby Red", "£0", "player", "ready"], ["Sapphire Blue", "£1", "coach", "ready"], ["Missing asset", "—", "player", "attention"]].map(([tier, price, subject, status]) => <article key={tier}><b>{tier}</b><span>{price}</span><small>{subject}</small><em>{status}</em></article>)}</div></section>;
  return <section className={styles.dataSurface}><header className={styles.productNav}><strong>{pt ? "Observações financeiras" : "Finance observations"}</strong><span>HOLD</span></header><div className={styles.financeHold}><h2>{pt ? "Nenhuma operação financeira está disponível." : "No financial operation is available."}</h2><p>{pt ? "Somente observações de Test Mode, ledger e estado de gates externos." : "Test Mode observations, ledger and external-gate status only."}</p><div><span>Stripe Test Mode</span><b>HOLD</b><span>{pt ? "Wallet monetária" : "Monetary wallet"}</span><b>HOLD</b></div></div></section>;
}

function AuditCardPage({ route, language, player, coachSlot }: { route: TouchlineAuditRoute; language: string; player: TouchlineEliteExactPlayer; coachSlot: ReturnType<typeof createTouchlineArenaCoachSlot> }) {
  const pt = language === "pt-BR";
  const tiers = ["ruby-red", "sapphire-blue", "amethyst-purple", "radiant-gold", "emerald-green", "clear-diamond", "diamond-gold"] as const;
  const prices = ["£0", "£1", "£2", "£4", "£7", "£10", "£15"];
  if (route.id === "cards/tier-gallery") return <section className={styles.cardGallery}><header className={styles.productNav}><strong>{pt ? "Galeria de tiers" : "Tier gallery"}</strong><span>{pt ? "Sete molduras canónicas" : "Seven canonical frames"}</span></header><div>{tiers.map((tier, index) => <article key={tier}><span>{tier.replace("-", " ")}</span><TouchlineEliteExactCard player={{ ...player, sportmonksPlayerId: `audit-${tier}`, name: "AUDIT PLAYER", cardTier: tier }} initialRenderScale={0.19} optimizeForLiveCompact subscribeToRanking={false} enableInteractiveNeon={false} showCardActions={false} showProfileAction={false} showSocialMetrics={false} rankingMode="preview" /><b>{prices[index]}</b></article>)}</div></section>;
  if (route.id === "cards/coach") return <section className={styles.cardStateSurface}><header className={styles.productNav}><strong>{pt ? "Card de treinador" : "Coach card"}</strong><span>Sapphire Blue · £1</span></header><TouchlineCoachCard coach={auditCoach} slot={coachSlot} clubName="TouchLine United" countryCode3="ENG" displayMode="compact" optimizeForLiveCompact enableInteractiveNeon={false} /><dl><div><dt>{pt ? "Estado" : "State"}</dt><dd>{pt ? "Disponível" : "Available"}</dd></div><div><dt>{pt ? "Reputação" : "Reputation"}</dt><dd>Sapphire Blue</dd></div></dl></section>;
  if (route.id === "cards/states") return <section className={styles.cardStateSurface}><header className={styles.productNav}><strong>{pt ? "Estados de card" : "Card states"}</strong></header><div className={styles.stateGrid}>{[[pt ? "Selecionado" : "Selected", "selected"], [pt ? "Contratado" : "Contracted", "contracted"], [pt ? "Indisponível" : "Unavailable", "unavailable"], [pt ? "Lesionado" : "Injured", "injured"], [pt ? "Suspenso" : "Suspended", "suspended"], [pt ? "Expirado" : "Expired", "expired"], [pt ? "Renovação" : "Renewal", "renewal"], [pt ? "A carregar" : "Loading", "loading"]].map(([label, state]) => <article key={state} data-state={state}><b>{label}</b><span>{pt ? "Estado visual do componente" : "Component visual state"}</span></article>)}</div></section>;
  return <section className={styles.cardStateSurface}><header className={styles.productNav}><strong>{pt ? "Card de jogador" : "Player card"}</strong><span>Radiant Gold · £4</span></header><TouchlineEliteExactCard player={player} initialRenderScale={0.48} optimizeForLiveCompact subscribeToRanking={false} enableInteractiveNeon={false} showCardActions={false} showProfileAction={false} showSocialMetrics={false} rankingMode="preview" /><dl><div><dt>{pt ? "Disponibilidade" : "Availability"}</dt><dd>{pt ? "Disponível" : "Available"}</dd></div><div><dt>{pt ? "Preço" : "Price"}</dt><dd>£4</dd></div></dl></section>;
}

function AuditRoutePreview({ route, auditToken, persona, matchState, language, player, coachSlot }: {
  route: TouchlineAuditRoute; auditToken: string; persona: string; matchState: string; language: string; player: TouchlineEliteExactPlayer; coachSlot: ReturnType<typeof createTouchlineArenaCoachSlot>;
}) {
  const detail = language === "pt-BR" ? "Demonstração sanitizada para auditoria" : "Sanitised audit demonstration";
  const copy = words(language);
  const noCoach = persona === "ClubOwner no coach" || route.id === "onboarding/choose-coach";
  return <section className={styles.preview}>
    <nav className={styles.breadcrumb}><Link href={auditIndexHref(auditToken, persona, matchState, language)}>Audit index</Link><span>/</span><span>{route.group}</span><span>/</span><strong>{route.title}</strong></nav>
    <div className={styles.previewHeader}><div><p className={styles.eyebrow}>{detail}</p><h1>{route.title}</h1><p>{route.description}</p></div><span className={styles.readOnly}>READ-ONLY · {matchState}</span></div>

    {route.id === "public/home" ? <AuditHome language={language} /> : null}
    {route.id.startsWith("public/") && route.id !== "public/home" ? <AuditAuth route={route} language={language} /> : null}
    {route.id.startsWith("club-owner/") ? <AuditClubOwnerPage route={route} language={language} player={player} coachSlot={coachSlot} /> : null}
    {route.id.startsWith("arena/") ? <AuditArenaPage route={route} language={language} matchState={matchState} persona={persona} player={player} coachSlot={coachSlot} /> : null}
    {route.id.startsWith("match-centre/") ? <AuditMatchCentrePage route={route} language={language} matchState={route.id.endsWith("no-fixture") ? "No fixture" : matchState} /> : null}
    {route.id.startsWith("market/") ? <AuditMarketPage route={route} language={language} player={player} coachSlot={coachSlot} /> : null}
    {route.id.startsWith("profiles/") ? <AuditProfilePage route={route} language={language} player={player} coachSlot={coachSlot} /> : null}
    {route.id.startsWith("competition/") ? <AuditCompetitionPage route={route} language={language} /> : null}
    {route.id.startsWith("communication/") ? <AuditCommunicationPage route={route} language={language} /> : null}
    {route.id.startsWith("admin/") ? <AuditAdminPage route={route} language={language} /> : null}

    {route.id.startsWith("onboarding/") ? <section className={styles.onboardingSurface}><header><span>1. {language === "pt-BR" ? "Identidade" : "Identity"}</span><span>2. {language === "pt-BR" ? "Treinador" : "Coach"}</span><span>3. {language === "pt-BR" ? "Jogadores" : "Players"}</span><span>4. {language === "pt-BR" ? "Confirmação" : "Confirmation"}</span></header>{noCoach ? <div className={styles.coachOnly}><p>{language === "pt-BR" ? "Escolha o seu treinador" : "Choose your coach"}</p><TouchlineCoachCard coach={auditCoach} slot={coachSlot} clubName="TouchLine United" countryCode3="ENG" displayMode="compact" optimizeForLiveCompact enableInteractiveNeon={false} /><button disabled>{language === "pt-BR" ? "Confirmar treinador" : "Confirm coach"}</button></div> : route.id.includes("squad-") ? <div className={styles.squadBuilder}><section><h2>{route.id.endsWith("empty") ? (language === "pt-BR" ? "Elenco vazio" : "Empty squad") : route.id.endsWith("partial") ? (language === "pt-BR" ? "Elenco parcial" : "Partial squad") : (language === "pt-BR" ? "Elenco completo" : "Complete squad")}</h2><TouchlinePitchSurface ariaLabel="Onboarding squad builder" className={styles.pitch}>{route.id.endsWith("empty") ? <span className={styles.emptyPitchLabel}>{language === "pt-BR" ? "Escolha jogadores no Mercado" : "Choose players in Market"}</span> : <div className={styles.auditCardSpot}><TouchlineEliteExactCard player={player} initialRenderScale={0.24} optimizeForLiveCompact subscribeToRanking={false} enableInteractiveNeon={false} showCardActions={false} showProfileAction={false} showSocialMetrics={false} rankingMode="preview" /></div>}</TouchlinePitchSurface></section><aside><h3>{language === "pt-BR" ? "Validação" : "Validation"}</h3><span>{route.id.endsWith("complete") ? (language === "pt-BR" ? "Pronto para confirmar" : "Ready to confirm") : (language === "pt-BR" ? "Requisitos pendentes" : "Requirements pending")}</span><button disabled>{language === "pt-BR" ? "Continuar" : "Continue"}</button></aside></div> : <div className={styles.onboardingStage}><h2>{route.id === "onboarding/club-identity" ? (language === "pt-BR" ? "Crie a identidade do seu clube" : "Create your club identity") : route.id === "onboarding/coach-selected" ? (language === "pt-BR" ? "Treinador confirmado" : "Coach confirmed") : route.id === "onboarding/club-confirmation" ? (language === "pt-BR" ? "Confirme o seu clube" : "Confirm your club") : (language === "pt-BR" ? "Comece a sua jornada" : "Start your journey")}</h2><p>{language === "pt-BR" ? "Estado sequencial do onboarding com dados de auditoria." : "Sequential onboarding state with audit data."}</p><button disabled>{language === "pt-BR" ? "Continuar" : "Continue"}</button></div>}</section> : null}

    {route.id.startsWith("cards/") ? <AuditCardPage route={route} language={language} player={player} coachSlot={coachSlot} /> : null}

    <section className={styles.infoGrid}>
      <article><h2>{copy.current}</h2><p>{noCoach ? copy.coach : persona}</p><button disabled>{noCoach ? (language === "pt-BR" ? "Escolher treinador desativado" : "Choose coach disabled") : copy.action}</button></article>
      <article><h2>{copy.boundary}</h2><p>{copy.safe}</p></article>
      <article><h2>{copy.note}</h2><p>{copy.inspect}</p></article>
    </section>
  </section>;
}
