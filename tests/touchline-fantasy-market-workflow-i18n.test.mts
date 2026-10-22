import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as domain from "../lib/touchlineFantasy/domain.ts";
import { canChooseGuidedSlot, nextGuidedChoice } from "../lib/touchlineFantasy/next-guided-choice.ts";
import { CLUB_RESERVE_POSITIONS, collectionSlotPlan } from "../lib/touchlineFantasy/collection-slot-plan.ts";
import { clubPrimaryPositionIndex } from "../lib/touchlineFantasy/club-primary-position-index.ts";
import { primaryPositionFitsTacticalSlot } from "../lib/touchlineFantasy/club-primary-position-policy.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "../lib/touchlineArena/formation-geometry.ts";
import { getTouchlineFantasyStandaloneBuilderCopy, formatTouchlineFantasyStandaloneAlert } from "../lib/touchlineFantasy/standalone-builder-i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { getTouchlineFantasyMarketAccessCopy } from "../lib/touchlineFantasy/market-access-i18n.ts";
import { getTouchlineFantasyMarketMetricsCopy } from "../lib/touchlineFantasy/market-metrics-i18n.ts";
import { touchlineFantasyStatusCopy, touchlineFantasyLineupErrorCopy } from "../lib/touchlineFantasy/market-state-i18n.ts";
import { touchlineMarketPositionBucket, touchlineMarketPositionBucketLabel } from "../lib/touchlineArena/position-eligibility.ts";
import { localizedPositionLabel } from "../lib/touchlineArena/position-labels.ts";
import { findTouchLineClub } from "../lib/touchlineArena/demo-data.ts";
import { TOUCHLINE_APPROVED_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
const releasePolicy: { isTouchLineSiteLocalesEnabled?: (path?: string) => boolean } = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: releasePolicy, process: { env: {} } });


const load = () => import("../lib/touchlineFantasy/market-workflow-i18n.ts");
// EN/PT characterization; approved wording changes are STEP → Etapa,
// GAMEWEEK → Rodada/Round, neutral count templates, search-aware empty copy,
// and explicit lineup removal (not release/refund of the owned player).
const baseline = {
  "en-GB": {
    "metadataDescription": "Manage your TouchLine XI by position.",
    "chooseClub": "Choose a club",
    "formationUpdated": "Formation updated. Save again to persist the change.",
    "cardNotEligible": "This card is not eligible for this Gameweek.",
    "slotNotEligible": "This card is not eligible for the selected slot.",
    "noCompatibleSlot": "No compatible slot remains in this formation.",
    "alreadySelected": "This card is already in another slot in your team.",
    "budgetExceeded": "This card exceeds the available budget.",
    "changeNotSaved": "Change not saved yet.",
    "fixXI": "Fix the XI requirements before confirming.",
    "saveUnconfirmed": "The server received the save, but verification has not returned yet. Refresh before making another change.",
    "confirmVerified": "XI confirmed, persisted and verified in TouchLine.",
    "draftVerified": "Draft persisted and verified in TouchLine.",
    "saveConnectionFailed": "The connection failed before save confirmation. Try again.",
    "playAria": "Play TouchLine",
    "commandAria": "My Club command centre",
    "myXI": "MY XI",
    "setFormation": "Set your formation",
    "chooseCoachFirst": "Choose your club coach first.",
    "chooseFormationFirst": "Now choose a formation before building the 11 players.",
    "editInstruction": "Select a card to replace or remove it. The selection only shows players eligible for that position.",
    "readOnlyInstruction": "Your XI is preserved. Explore positions below and open any card to view its profile.",
    "round": "Round",
    "coachSelectionAria": "Coach selection",
    "step1": "STEP 1",
    "chooseYourCoach": "Choose your coach",
    "coachInstruction": "Select a club to see its canonical coach, then continue to formation.",
    "chooseCoach": "Choose coach",
    "coachChosen": "Coach chosen. Now choose a formation.",
    "noCoach": "No canonical coach is available for this club.",
    "formationSelectionAria": "Formation selection",
    "step2": "STEP 2",
    "chooseFormation": "Choose formation",
    "formationInstruction": "The canonical formation opens the 11 eligible slots for your build.",
    "slots": "slots",
    "xiLinesAria": "Your XI by lines",
    "startingXI": "STARTING XI",
    "viewTactical": "View tactical layout",
    "viewCards": "View cards",
    "arenaMode": "Arena mode",
    "closeArena": "Close Arena",
    "pitchAria": "Interactive tactical field",
    "choosePlayer": "Choose player",
    "removeFromXI": "Remove from XI",
    "browsePosition": "Browse a position",
    "openShort": "Open",
    "openSlot": "Open slot",
    "replace": "Replace",
    "choose": "Choose",
    "remove": "Remove from line-up",
    "technicalArea": "Technical area",
    "coach": "Coach",
    "formation": "Formation",
    "positionSelectionAria": "Position selection",
    "market": "Market",
    "backToPitch": "Back to pitch",
    "scouting": "MY CLUB · SCOUTING",
    "exploreInstruction": "Explore the club. Choose a position. Discover every player.",
    "searchPlayer": "Search player",
    "playerPositionsAria": "Player positions",
    "playerSelection": "PLAYER SELECTION",
    "cardsInPosition": "Cards in this position: {count}",
    "xiSlot": "XI slot: {slot}",
    "browseInstruction": "Browse cards; choose a coach and formation to build the XI.",
    "inYourXI": "In your XI",
    "replaceSlot": "Replace",
    "chooseSlot": "Choose",
    "reviewOnly": "Review only",
    "noCards": "No cards match this selection or search. Clear the search or try another position or club.",
    "xiConfirmed": "XI confirmed",
    "readyConfirm": "Ready to confirm",
    "unsavedChanges": "Unsaved changes",
    "squadSynced": "Squad synced",
    "confirmXI": "Confirm XI"
  },
  "pt-BR": {
    "metadataDescription": "Gerencie seu XI TouchLine por posição.",
    "chooseClub": "Escolha um clube",
    "formationUpdated": "Formação atualizada. Salve novamente para gravar a alteração.",
    "cardNotEligible": "Este card não está elegível nesta rodada.",
    "slotNotEligible": "Este card não é elegível para a vaga selecionada.",
    "noCompatibleSlot": "Não há vaga compatível nesta formação.",
    "alreadySelected": "Este card já está em outra vaga da sua equipe.",
    "budgetExceeded": "Este card ultrapassa o orçamento disponível.",
    "changeNotSaved": "Alteração ainda não salva.",
    "fixXI": "Corrija os requisitos do XI antes de confirmar.",
    "saveUnconfirmed": "O servidor recebeu o salvamento, mas a verificação ainda não voltou. Atualize a página antes de fazer outra mudança.",
    "confirmVerified": "XI confirmado, gravado e verificado no TouchLine.",
    "draftVerified": "Rascunho gravado e verificado no TouchLine.",
    "saveConnectionFailed": "A conexão falhou antes da confirmação do salvamento. Tente novamente.",
    "playAria": "Jogar TouchLine",
    "commandAria": "Central do Meu Clube",
    "myXI": "MEU XI",
    "setFormation": "Defina sua formação",
    "chooseCoachFirst": "Escolha primeiro o treinador do seu clube.",
    "chooseFormationFirst": "Agora escolha a formação antes de montar os 11 jogadores.",
    "editInstruction": "Escolha um card para trocar ou remover. A seleção mostra apenas atletas elegíveis para a posição.",
    "readOnlyInstruction": "Seu XI está preservado. Explore as posições abaixo e abra qualquer card para ver o perfil.",
    "round": "Rodada",
    "coachSelectionAria": "Escolha de treinador",
    "step1": "Etapa 1",
    "chooseYourCoach": "Escolha seu treinador",
    "coachInstruction": "Selecione um clube para ver o treinador canônico e continue para a formação.",
    "chooseCoach": "Escolher treinador",
    "coachChosen": "Treinador escolhido. Agora escolha a formação.",
    "noCoach": "Nenhum treinador canônico disponível para este clube.",
    "formationSelectionAria": "Escolha de formação",
    "step2": "Etapa 2",
    "chooseFormation": "Escolha a formação",
    "formationInstruction": "A formação canônica abre as 11 vagas elegíveis para montagem.",
    "slots": "vagas",
    "xiLinesAria": "Seu XI por linhas",
    "startingXI": "ELENCO TITULAR",
    "viewTactical": "Ver visão tática",
    "viewCards": "Ver cards",
    "arenaMode": "Modo Arena",
    "closeArena": "Fechar Arena",
    "pitchAria": "Campo tático interativo",
    "choosePlayer": "Escolher jogador",
    "removeFromXI": "Retirar do XI",
    "browsePosition": "Explore uma posição",
    "openShort": "Vaga",
    "openSlot": "Vaga aberta",
    "replace": "Trocar",
    "choose": "Escolher",
    "remove": "Retirar da escalação",
    "technicalArea": "Área técnica",
    "coach": "Treinador",
    "formation": "Formação",
    "positionSelectionAria": "Seleção por posição",
    "market": "Mercado",
    "backToPitch": "Voltar ao campo",
    "scouting": "MY CLUB · SCOUTING",
    "exploreInstruction": "Explore o clube. Escolha a posição. Conheça cada atleta.",
    "searchPlayer": "Pesquisar jogador",
    "playerPositionsAria": "Posições dos jogadores",
    "playerSelection": "SELEÇÃO DE JOGADORES",
    "cardsInPosition": "Cards nesta posição: {count}",
    "xiSlot": "Vaga do XI: {slot}",
    "browseInstruction": "Consulte os cards; escolha treinador e formação para montar o XI.",
    "inYourXI": "No seu XI",
    "replaceSlot": "Substituir",
    "chooseSlot": "Escolher",
    "reviewOnly": "Somente consulta",
    "noCards": "Nenhum card corresponde a esta seleção ou busca. Limpe a busca ou experimente outra posição ou clube.",
    "xiConfirmed": "XI confirmado",
    "readyConfirm": "Pronto para confirmar",
    "unsavedChanges": "Alterações não salvas",
    "squadSynced": "Elenco sincronizado",
    "confirmXI": "Confirmar XI"
  }
};

const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("Fantasy.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, string>(); let embedded = ""; let getter = ""; let lockedReasonGetter = ""; let browseInitializer = ""; let targetSlotGetter = "";
let standalone = "";
function visit(node: ts.Node) {
  if (ts.isReturnStatement(node) && node.expression && node.expression.getText(ast).startsWith('<div className={styles.shell} data-canonical-step=')) standalone = node.expression.getText(ast);
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node.getText(ast));
  if (ts.isIfStatement(node) && node.expression.getText(ast) === "embedded" && ts.isBlock(node.thenStatement)) embedded = node.thenStatement.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "workflowCopy") getter = `const ${node.getText(ast)};`;
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "lockedZoomReason") lockedReasonGetter = `const ${node.getText(ast)};`;
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "browseCards") browseInitializer = node.initializer!.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "marketTargetSlot") targetSlotGetter = `const ${node.getText(ast)};`;
  ts.forEachChild(node, visit);
}
visit(ast);
const slot = { id: "ST", allowedPositions: ["striker"], x: 75, y: 50, line: "attack" };
const geometry = { slots: [slot], code: "4-3-3" };
const card = { id: "player-1", canonicalPlayerId: "player-1", name: "Canonical Player", shortName: "C. Player", clubName: "Canonical Club", position: "Striker" };
const coach = { id: "coach-1", coach: { displayName: "Canonical Coach" }, clubName: "Canonical Club", clubLogoUrl: null };
const player = { playerId: "player-1", positionBucket: "striker", marketValueEur: 10, clubId: "club-1" };
const icon = () => null;
const child = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
// Source is immutable for this test process; each execution still gets a fresh VM.
const compiledConsumers = new Map<boolean, string>();

// Actual embedded JSX and mutation functions; only independent child components,
// framework assets and I/O are boundaries. No replica of rendering/state rules.
function actual(input: Record<string, unknown> = {}, getCopy: (locale: string, draftLocalesEnabled?: boolean) => unknown = () => ({}), draftLocalesEnabled = false, standaloneMode = false) {
  assert.ok(embedded); const calls: Array<[string, unknown]> = [];
  const visualIntentEpoch = { current: 0 };
  const context: Record<string, unknown> = {
    collectionEnabled: false, showCollectionStructure: false, collectionStructureVisible: false,
    collection: { state: null, ready: false, busy: false, hasPending: false, canInitialize: false },
    collectionSlotsEditable: false, collectionDestination: null,
    roundRecoveryPending: false, qaClubMarketOpen: false,
    displayGeometry: input.geometry ?? geometry, roundEditable: input.editable ?? true,
    canChooseGuidedSlot, nextGuidedChoice, CLUB_RESERVE_POSITIONS, collectionSlotPlan,
    primaryPositionFitsTacticalSlot, primaryDetails: clubPrimaryPositionIndex([card], { allowLegacyDisplay: true }),
    visualIntentEpoch, clubSelectionVersion: visualIntentEpoch,
    builderCopy: getTouchlineFantasyStandaloneBuilderCopy(String(input.locale ?? "en-GB"), draftLocalesEnabled), formatTouchlineFantasyStandaloneAlert,
    canonicalStep: "coach", visibleStep: "coach", embedded: false, STEPS: ["coach", "formation", "players", "review", "locked"],
    CalendarClock: icon, ShieldCheck: icon, WalletCards: icon, Crown: icon, Check: icon, ChevronRight: icon, BadgeCheck: icon, Trophy: icon, House: icon, PlaneTakeoff: icon, Send: icon, Save: icon, LockKeyhole: icon, CircleAlert: icon, Users: icon,
    builderRef: { current: null }, guidePanelRef: { current: null }, currentAlerts: [], filtered: [], persistedUserGameweek: null, RankingTable: icon,
    stepLabel: (step: string) => step, formatTouchlineFantasyMarketValue: () => "100", formatTouchlineFantasyDeadline: () => "deadline", formatTouchlineFantasyBudgetAmount: () => "100", getTouchlineFantasyMarketBudgetCopy: () => ({ rule: "{budget}" }),
    React, ArenaView: child, TouchlineMatchCentre: icon, resolveTouchlineCatalogueLocale, liveTimeZone: "UTC", initialLiveFixtures: [], initialLiveNow: 0, arenaOpen: false, ...domain, locale: "en-GB", draftLocalesEnabled, pt: false, marketPage: true, editable: true, saving: false,
    styles: new Proxy({}, { get: (_, key) => String(key) }), gameweeks: [], activeGameweek: { id: "round-7", number: 7, state: "MARKET_OPEN" },
    selectedCoach: coach, selectedCoachId: coach.id, formationCode: "4-3-3", geometry, selections: [], eligiblePlayers: [player],
    catalogueById: new Map([[card.id, card]]), browseCards: [card], filteredCoaches: [coach], selectedPlayerClub: { name: "Canonical Club", teamId: "club-1" }, selectedCoachClub: { teamId: "club-1" },
    snapshot: { config: { budgetEur: 900, maxPlayersPerClub: 11 }, formationRegistry: { "4-3-3": geometry }, coaches: [coach], gameweekScore: 0, seasonScore: 0 },
    activeSlot: slot, browseSlot: slot, browsingPosition: "striker", squadView: "tactical", pitchCardWidth: 74, pitchViewportRef: { current: null }, query: "", feedback: null,
    live: null, currentMatchCards: [], currentAvailability: [], TouchlineMatchCardBadge: icon, TouchlinePlayerAvailabilityBadge: icon, validation: { valid: true }, lineupConfirmed: false, hasUnsavedChanges: false,
    marketOpen: true, marketStatusLabel: "Market open", marketAccessLabel: "View only", marketAccessCopy: getTouchlineFantasyMarketAccessCopy(String(input.locale ?? "en-GB"), draftLocalesEnabled), marketMetricsCopy: getTouchlineFantasyMarketMetricsCopy(String(input.locale ?? "en-GB"), draftLocalesEnabled),
    getTouchlineFantasyMarketWorkflowCopy: getCopy, getTouchlineBetaEnrollmentCopy: () => ({ review: "Beta review" }), touchlineMarketPositionBucketLabel, localizedPositionLabel,
    statusCopy: touchlineFantasyStatusCopy,
    lineupErrorCopy: touchlineFantasyLineupErrorCopy,
    TOUCHLINE_ENGLAND_CLUBS_BY_RANK: [{ teamId: "club-1", name: "Canonical Club", shortCode: "CAN", logoUrl: null }], TOUCHLINE_FANTASY_BROWSE_POSITIONS: [],
    touchlineMarketPositionBucket,
    Link: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children), Image: icon,
    TouchlineGameweekCard: icon, FantasyCoachZoom: icon, FantasyBudgetNotice: icon, TouchlineBetaEnrollment: icon, CompactClubIdentity: icon, TouchlineClubPerimeterTrace: icon, MarketWindowClock: icon, TouchlinePitchSurface: child,
    canBrowseMarketClub: () => true, marketPolicy: undefined, marketPlanLockCopy: "Plan locked", selectedPlayerClubLocked: false, findTouchLineClub, marketBudgetEur: 900,
    playerExceedsBudget: () => false,
    Search: icon, touchlineCardTierPalette: () => ({ accent: "#fff" }),
    scrollToLineupSection: (value: string) => calls.push(["scroll", value]),
    setCollectionMarketPlayer: (value: unknown) => calls.push(["setCollectionMarketPlayer", value]),
    newIdempotencyKey: (action: string) => `fixed-key:${action}`,
    fetch: async (url: string, options: unknown) => { calls.push(["fetch", { url, options }]); return { ok: true, json: async () => ({ ok: true }) }; },
    loadPersistedLineup: async (fingerprint: string, state: string) => { calls.push(["verify", { fingerprint, state }]); return true; },
    ...input,
  };
  for (const name of ["setArenaOpen", "setSelections", "setActiveSlotId", "setBrowsePosition", "setVisibleStep", "setSquadView", "setQuery", "setSelectedCoachId", "setCoachClubTeamId", "setPlayerClubTeamId", "setFormationCode", "setFeedback", "setSaving"]) {
    context[name] = (value: unknown) => calls.push([name, typeof value === "function" ? value(name === "setArenaOpen" ? context.arenaOpen : context.selections) : value]);
  }
  const functions = ["lineupFingerprint", "horizontalMyClubPitchPosition", "CompactClubSelector", "changeFormation", "addPlayer", "removePlayer", "save", "marketSlotAccepts", "slotAccepts", "canonicalRosterRole", "changeMarketQuery"].map(name => declarations.get(name)).join("\n");
  let js = compiledConsumers.get(standaloneMode);
  if (!js) {
    js = ts.transpileModule(`(() => { ${getter} ${lockedReasonGetter} ${targetSlotGetter} ${functions} return { render: () => ${standaloneMode ? standalone : embedded}, save, addPlayer, removePlayer, changeFormation, CompactClubSelector }; })()`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    compiledConsumers.set(standaloneMode, js);
  }
  const api = runInNewContext(js, context);
  return { api, calls, html: () => renderToStaticMarkup(api.render()) };
}

type Element = React.ReactElement<Record<string, unknown>>;
test("standalone real JSX renders all five steps in eight gated locales", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  assert.ok(standalone);
  for (const { code: locale } of TOUCHLINE_APPROVED_LOCALES) {
    for (const visibleStep of ["coach", "formation", "players", "review", "locked"]) {
      const copy = getTouchlineFantasyStandaloneBuilderCopy(locale, true);
      const view = actual({ locale, visibleStep, selectedCoach: null, filteredCoaches: [], squadView: "squad", validation: { valid: true, issues: [] } }, getCopy, true, true);
      const html = view.html();
      const escaped = renderToStaticMarkup(React.createElement("span", null, copy.heroTitle)).slice(6, -7);
      assert.ok(html.includes(escaped), `${locale}/${visibleStep}`);
      assert.ok(html.includes('data-fantasy-context="standalone"'));
      assert.equal(view.calls.length, 0, "render cannot mutate the lineup");
    }
  }
});
test("selected XI availability stays separate from match cards in both ClubOwner modes and eight locales", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  const badge = { asset: "/touchlineArena/status-badges/injury-cross.png", width: 48, height: 48, reason: "injury", estimatedReturnDate: null };
  const entry = { playerId: card.id, fixtureId: "101", badge };
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    for (const arenaOpen of [false, true]) {
      const rendered = actual({ locale, arenaOpen, selections: [{ playerId: card.id, slotId: slot.id }], currentAvailability: [entry],
        currentMatchCards: [{ playerId: card.id, fixtureId: "101", eventId: "201", kind: "yellow" }] }, getCopy, true);
      const nodes = elements(rendered.api.render());
      const badges = nodes.filter(node => node.props.badge === badge);
      assert.equal(badges.length, 1); assert.equal(badges[0].props.locale, locale);
      assert.equal(nodes.filter(node => node.props.playerName === card.name && node.props.kind === "yellow").length, 1);
      assert.deepEqual(rendered.calls, []);
    }
  }
  for (const currentAvailability of [[], [entry, entry], [{ ...entry, playerId: "other" }]]) {
    const rendered = actual({ selections: [{ playerId: card.id, slotId: slot.id }], currentAvailability }, getCopy);
    assert.equal(elements(rendered.api.render()).filter(node => node.props.badge).length, 0);
  }
});
test("persisted match cards appear in ClubOwner XI and its Arena, never in the market catalogue", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  for (const marketPage of [false, true]) for (const arenaOpen of [false, true]) {
    for (const kind of ["yellow", "red"]) {
      const currentMatchCards = [{ playerId: card.id, fixtureId: "101", eventId: "201", kind },
        { playerId: "other-player", fixtureId: "101", eventId: "202", kind: "red" }];
      const rendered = actual({ marketPage, arenaOpen, currentMatchCards, selections: [{ playerId: card.id, slotId: slot.id }] }, getCopy);
      const nodes = elements(rendered.api.render());
      const badges = nodes.filter(node => node.props.playerName === card.name && node.props.kind);
      assert.equal(badges.length, 1, `marketPage=${marketPage} arena=${arenaOpen} kind=${kind}`);
      assert.equal(badges[0].props.kind, kind);
      const pitch = nodes.find(node => node.props.className === "myClubTacticalPitch");
      assert.ok(pitch && elements(pitch).includes(badges[0]), "badge belongs to selected XI, not catalogue inventory");
      assert.deepEqual(rendered.calls, []);
    }
  }
  const cleared = actual({ currentMatchCards: [], selections: [{ playerId: card.id, slotId: slot.id }] }, getCopy);
  assert.ok(!elements(cleared.api.render()).some(node => node.props.kind && node.props.playerName), "no stale badge after events are cleared");
});
test("Arena round points reuse the persisted live total, never draft or coach points", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    for (const score of [0, 12.5, 98.25]) {
      const rendered = actual({ arenaOpen: true, locale, live: { gameweekScore: score, seasonScore: 999 }, hasUnsavedChanges: true, selectedCoach: { ...coach, points: 999 }, selections: [] }, getCopy, true);
      const output = elements(rendered.api.render()).find(node => node.props["data-arena-round-points"] === "true");
      assert.ok(output);
      const pitch = elements(rendered.api.render()).find(node => node.props.className === "myClubTacticalPitch");
      assert.ok(pitch && elements(pitch).some(node => node.props["data-arena-round-points"] === "true"), "points follow the pitch boundary, not the coach position");
      assert.equal(output.props["aria-live"], "polite");
      const html = renderToStaticMarkup(output);
      assert.ok(html.includes(getTouchlineFantasyMarketMetricsCopy(locale, true).roundPoints));
      assert.ok(html.includes(score.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
      assert.ok(!html.includes("999"));
      assert.deepEqual(rendered.calls, [], "displaying points never saves or fetches separately");
    }
  }
  const initial = actual({ arenaOpen: true }, getCopy);
  assert.ok(renderToStaticMarkup(elements(initial.api.render()).find(node => node.props["data-arena-round-points"] === "true")!).includes("0.00"));
  const closed = actual({ arenaOpen: false }, getCopy);
  assert.ok(!elements(closed.api.render()).some(node => node.props["data-arena-round-points"] === "true"));
});
test("Arena opens and closes with incomplete or locked XI without changing or saving players", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  for (const arenaOpen of [false, true]) for (const marketOpen of [false, true]) {
    const rendered = actual({ arenaOpen, marketOpen, editable: marketOpen, selections: [] }, getCopy);
    const label = arenaOpen ? "Close Arena" : "Arena mode";
    const action = elements(rendered.api.render()).find(node => node.type === "button" && node.props.children === label);
    assert.ok(action, label);
    assert.ok(!action.props.disabled, "viewing the field does not require an open market or complete XI");
    (action.props.onClick as () => void)();
    assert.deepEqual(rendered.calls, [["setArenaOpen", !arenaOpen]]);
  }
});

test("Arena overlay anchors coach outside the pitch and offers only canonical formations without a locked-market mutation", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  const css = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");
  assert.match(css, /\.arenaCoach \{[^}]*top: -8px; left: 50%; transform: translate\(-50%, -100%\)/);
  assert.match(css, /\.arenaFormationControl, \.arenaHudRight \{[^}]*bottom: calc\(100% \+ 10px\)/);
  const alternate = { ...geometry, code: "3-5-2" };
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    for (const editable of [true, false]) {
      const rendered = actual({ locale, arenaOpen: true, editable, marketOpen: editable,
        marketStatusLabel: editable ? "Market open" : "Market closed",
        snapshot: { config: { budgetEur: 900, maxPlayersPerClub: 11 }, formationRegistry: { "4-3-3": geometry, "3-5-2": alternate }, coaches: [coach], gameweekScore: 0, seasonScore: 0 },
      }, getCopy, true);
      const pitch = elements(rendered.api.render()).find((node) => node.props.className === "myClubTacticalPitch");
      assert.ok(pitch);
      const nodes = elements(pitch);
      const formation = nodes.find((node) => node.props["data-arena-formation"] === "true");
      const right = nodes.find((node) => node.props.className === "arenaHudRight");
      const coachNode = nodes.find((node) => node.props.className === "arenaCoach");
      const points = elements(right).find((node) => node.props["data-arena-round-points"] === "true");
      const close = elements(right).find((node) => node.type === "button" && node.props.children === getCopy(locale, true).closeArena);
      assert.ok(formation && right && coachNode && points && close, `${locale}/${editable}`);
      const choices = elements(formation).find((node) => node.props.className === "formationChoices");
      assert.ok(choices);
      const buttons = elements(choices).filter((node) => node.type === "button");
      assert.equal(buttons.length, 2);
      assert.equal(buttons[0].props["aria-pressed"], true);
      assert.ok(buttons.every((button) => button.props.disabled === !editable));
      assert.deepEqual(buttons.map((button) => elements(button).find(node => node.type === "b")?.props.children), ["4-3-3", "3-5-2"]);
      assert.ok(renderToStaticMarkup(formation).includes(getCopy(locale, true).chooseFormation));
      (buttons[1].props.onClick as () => void)();
      assert.equal(rendered.calls.some(([name]) => name === "setFormationCode"), editable);
      assert.ok(!rendered.calls.some(([name]) => name === "fetch"));
    }
  }
});

test("pitch zoom keeps locked actions visible with truthful market notice and never mutates closed XI", async () => {
  const mod = await load();
  for (const editable of [true, false]) for (const saving of [true, false]) {
    const rendered = actual({ selections: [{ playerId: card.id, slotId: slot.id }], editable, saving, marketOpen: editable, activeGameweek: { id: "round-7", number: 7, state: editable ? "MARKET_OPEN" : "LIVE" } }, mod.getTouchlineFantasyMarketWorkflowCopy);
    const zoom = elements(rendered.api.render()).find((element) => element.props.card === card && element.props.compact);
    assert.ok(zoom);
    const action = zoom.props.replacementAction as { disabled: boolean; onSelect: () => void } | undefined;
    const removal = zoom.props.removalAction as { disabled: boolean; onSelect: () => void } | undefined;
    assert.ok(action && removal);
    assert.equal(action.disabled, !editable || saving);
    assert.equal(removal.disabled, !editable || saving);
    assert.equal(zoom.props.lockedReason, editable ? undefined : `${getTouchlineFantasyMarketAccessCopy("en-GB").closed}. ${getTouchlineFantasyMarketAccessCopy("en-GB").windowRule}`);
    action.onSelect();
    if (!editable || saving) removal.onSelect();
    assert.equal(rendered.calls.some(([name]) => name === "setActiveSlotId"), editable && !saving);
    assert.ok(!rendered.calls.some(([name]) => name === "setSelections" || name === "fetch"));
  }
});

test("opening the existing replacement selector preserves the occupied slot and draft", async () => {
  const mod = await load();
  const selections = [{ playerId: card.id, slotId: slot.id }];
  const rendered = actual({ selections, squadView: "squad" }, mod.getTouchlineFantasyMarketWorkflowCopy);
  const action = elements(rendered.api.render()).find((element) => element.props.replacementAction)?.props.replacementAction as { onSelect: () => void } | undefined;
  assert.ok(action);
  action.onSelect();
  assert.ok(rendered.calls.some(([name, value]) => name === "setActiveSlotId" && value === slot.id));
  assert.ok(rendered.calls.some(([name, value]) => name === "scroll" && value === "my-club-player-selection"));
  assert.ok(!rendered.calls.some(([name]) => name === "setSelections" || name === "fetch"));
  assert.deepEqual(selections, [{ playerId: card.id, slotId: slot.id }]);
});

test("ClubOwner keeps closed empty XI visible and disabled; legacy view retains its window rule", async () => {
  const mod = await load();
  for (const marketPage of [false, true]) for (const squadView of ["tactical", "squad"]) {
    for (const marketOpen of [false, true]) {
      const rendered = actual({ marketPage, squadView, marketOpen, editable: marketOpen }, mod.getTouchlineFantasyMarketWorkflowCopy);
      const empty = elements(rendered.api.render()).filter((element) =>
        element.props.className === "emptyPosition" || element.props.className === "myClubEmptyCard");
      assert.equal(empty.length, marketPage || marketOpen ? 1 : 0, `${marketPage}/${squadView}/${marketOpen}`);
      assert.equal(rendered.calls.length, 0, "rendering does not change the lineup");
      if (empty.length) {
        assert.equal(empty[0].props.disabled, !marketOpen);
        (empty[0].props.onClick as () => void)();
        assert.equal(rendered.calls.some(([name]) => name === "setActiveSlotId"), marketOpen);
      }
    }
  }
});

function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children as React.ReactNode)];
}

test("count summary is a complete neutral phrase for 0, 1, 2 and 11 in every catalogue", async () => {
  const mod = await load();
  const labels = {
    "en-GB": "Cards in this position", "pt-BR": "Cards nesta posição", "es-ES": "Cartas en esta posición",
    "it-IT": "Carte in questa posizione", "fr-FR": "Cartes à ce poste", "ar-SA": "البطاقات في هذا المركز",
    "tr-TR": "Bu pozisyondaki kartlar", "de-DE": "Karten auf dieser Position",
  };
  for (const [locale, label] of Object.entries(labels)) {
    const copy = mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES[locale as keyof typeof mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES];
    assert.equal(copy.cardsInPosition, `${label}: {count}`);
    for (const count of [0, 1, 2, 11]) {
      // Inject draft copy only at the getter boundary; public gates are tested separately.
      const html = actual({ locale, browseCards: Array.from({ length: count }, (_, index) => ({ ...card, id: `card-${index}`, canonicalPlayerId: `card-${index}` })) }, () => copy).html();
      assert.ok(html.includes(`Canonical Club · ${label}: ${count}</p>`), `${locale}/${count}`);
      assert.doesNotMatch(html, /\{count\}/);
    }
  }
});

test("real search filter retains catalogue while unmatched query renders a neutral empty result", async () => {
  const mod = await load();
  assert.ok(browseInitializer);
  const club = findTouchLineClub("Arsenal"); assert.ok(club);
  const publishedCard = { ...card, clubName: club.name, position: "Centre Forward", role: "forward" };
  const catalogue = [publishedCard];
  const functions = ["canonicalRosterRole", "slotAccepts", "marketSlotAccepts"].map(name => declarations.get(name)).join("\n");
  const script = ts.transpileModule(`(() => { ${functions} return ${browseInitializer}; })()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { ...domain, findTouchLineClub, canBrowseMarketClub: () => true, marketPolicy: undefined,
    touchlineMarketPositionBucket, snapshot: { catalogue }, marketPage: true, collectionEnabled: false,
    activeSlot: { ...slot, allowedPositions: ["centre-forward"] }, selectedPlayerClub: club, browsingPosition: "centre-forward" };
  const matched = runInNewContext(script, { ...context, normalizedQuery: "canonical" });
  assert.equal(matched.length, 1);
  const unmatched = runInNewContext(script, { ...context, normalizedQuery: "no-such-player" });
  assert.equal(unmatched.length, 0); assert.equal(catalogue.length, 1); assert.equal(catalogue[0], publishedCard);
  const emptyMessages = {
    "en-GB": "No cards match this selection or search. Clear the search or try another position or club.",
    "pt-BR": "Nenhum card corresponde a esta seleção ou busca. Limpe a busca ou experimente outra posição ou clube.",
    "es-ES": "Ninguna carta coincide con esta selección o búsqueda. Borra la búsqueda o prueba otra posición o club.",
    "it-IT": "Nessuna carta corrisponde a questa selezione o ricerca. Cancella la ricerca o prova un’altra posizione o un altro club.",
    "fr-FR": "Aucune carte ne correspond à cette sélection ou recherche. Effacez la recherche ou essayez un autre poste ou club.",
    "ar-SA": "لا توجد بطاقات تطابق هذا الاختيار أو البحث. امسح البحث أو جرّب مركزًا أو ناديًا آخر.",
    "tr-TR": "Bu seçim veya aramayla eşleşen kart yok. Aramayı temizle veya başka bir pozisyon ya da kulüp dene.",
    "de-DE": "Keine Karte entspricht dieser Auswahl oder Suche. Lösche die Suche oder versuche eine andere Position oder einen anderen Verein.",
  };
  for (const [locale, expected] of Object.entries(emptyMessages)) {
    const copy = mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES[locale as keyof typeof mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES];
    assert.equal(copy.noCards, expected);
    const html = actual({ locale, pt: locale === "pt-BR", query: "no-such-player", browseCards: unmatched }, () => copy).html();
    assert.ok(html.includes(expected), locale);
    assert.doesNotMatch(html, /No published card|Nenhum card publicado/);
  }
});

test("ClubOwner selects its canonical coach inside the single existing market", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  for (const marketPage of [true, false]) {
    const rendered = actual({ marketPage, selectedCoach: null, formationCode: null }, getCopy);
    const nodes = elements(rendered.api.render());
    const markets = nodes.filter(node => node.props.id === "my-club-player-selection");
    const selectors = nodes.filter(node => marketPage ? node.props["data-market-results"] === "coach" : node.props["data-my-club-setup"] === "coach");
    assert.equal(markets.length, 1);
    assert.equal(selectors.length, 1, "coach selection is not duplicated");
    assert.equal(elements(markets[0]).includes(selectors[0]), marketPage);
    assert.ok(elements(selectors[0]).some(node => node.props.entry === coach), "reuse original coach zoom with its original entry");
    assert.deepEqual(rendered.calls, [], "rendering cannot contract or save a coach");
  }
  const configured = actual({}, getCopy);
  assert.ok(!elements(configured.api.render()).some(node => node.props["data-my-club-setup"] === "coach"));
});

test("embedded coach selection cannot mutate while locked or saving", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  for (const editable of [true, false]) for (const saving of [true, false]) {
    const rendered = actual({ selectedCoach: null, formationCode: null, editable, saving }, getCopy);
    const button = elements(rendered.api.render()).find(node => node.type === "button" && node.props.children === getCopy("en-GB").chooseCoach);
    assert.ok(button);
    assert.equal(button.props.disabled, !editable || saving);
    (button.props.onClick as () => void)();
    assert.equal(rendered.calls.length, editable && !saving ? 5 : 0);
    assert.ok(!rendered.calls.some(([name]) => name === "fetch"));
  }
});

test("actual JSX events retain coach, club, search, slot and navigation actions with localized labels", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  for (const locale of ["en-GB", "pt-BR"]) {
    const copy = getCopy(locale), base = { locale, pt: locale === "pt-BR" };
    const setup = actual({ ...base, selectedCoach: null, formationCode: null }, getCopy);
    const coachButton = elements(setup.api.render()).find(node => node.type === "button" && node.props.children === copy.chooseCoach);
    assert.ok(coachButton); (coachButton.props.onClick as () => void)();
    assert.deepEqual(setup.calls, [["setSelectedCoachId", "coach-1"], ["setQuery", ""], ["setVisibleStep", "formation"], ["setFeedback", copy.coachChosen], ["scroll", "my-club-xi-pitch"]]);
    const selected: unknown[] = [];
    const selector = setup.api.CompactClubSelector({ locale, selectedTeamId: "club-1", onSelect: (club: unknown) => selected.push(club) });
    assert.equal(selector.props["aria-label"], copy.chooseClub);
    const clubButton = elements(selector).find(node => node.type === "button"); assert.ok(clubButton);
    assert.equal(clubButton.props["aria-label"], "Canonical Club"); assert.equal(clubButton.props["aria-pressed"], true);
    (clubButton.props.onClick as () => void)(); assert.equal((selected[0] as { teamId: string }).teamId, "club-1");
    const view = actual(base, getCopy); const nodes = elements(view.api.render());
    const search = nodes.find(node => node.type === "input"); assert.ok(search); assert.equal(search.props.placeholder, copy.searchPlayer);
    (search.props.onChange as (event: unknown) => void)({ target: { value: "Canonical" } });
    assert.deepEqual(view.calls.slice(-2), [["setCollectionMarketPlayer", null], ["setQuery", "Canonical"]]);
    const choose = nodes.find(node => node.type === "button" && node.props["aria-label"] === `${copy.choosePlayer} · ST`); assert.ok(choose);
    (choose.props.onClick as () => void)();
    assert.deepEqual(view.calls.slice(-6), [["setActiveSlotId", "ST"], ["setBrowsePosition", null], ["setVisibleStep", "players"], ["setSquadView", "tactical"], ["setQuery", ""], ["scroll", "my-club-player-selection"]]);
    const back = nodes.find(node => node.type === "button" && node.props.children === copy.backToPitch); assert.ok(back);
    (back.props.onClick as () => void)(); assert.deepEqual(view.calls.at(-1), ["scroll", "my-club-xi-pitch"]);
  }
});

test("all six draft locales stay English in the actual embedded workflow, including labels and templates", async () => {
  const mod = await load();
  for (const locale of mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_DRAFT_LOCALES) {
    const html = actual({ locale, pt: false }, mod.getTouchlineFantasyMarketWorkflowCopy).html();
    for (const value of ["STARTING XI", "Search player", "XI slot: ST", "Confirm XI", "Technical area"]) assert.ok(html.includes(value), `${locale}: ${value}`);
    assert.ok(!html.includes("MY XI"), "the redundant configured-XI heading was removed");
    assert.doesNotMatch(html, /\{slot\}/);
  }
});

test("explicit opt-in reaches actual embedded setup, empty states, feedback and composed card props in six draft locales", async () => {
  const mod = await load();
  const text = (value: string) => renderToStaticMarkup(React.createElement("span", null, value)).slice(6, -7);
  const gameweekCard = () => null;
  const coachZoom = () => null;
  for (const locale of mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_DRAFT_LOCALES) {
    const copy = mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES[locale];
    const base = { locale, TouchlineGameweekCard: gameweekCard, FantasyCoachZoom: coachZoom };
    const setup = actual({ ...base, selectedCoach: null, formationCode: null }, mod.getTouchlineFantasyMarketWorkflowCopy, true);
    for (const label of [copy.chooseYourCoach, copy.coachInstruction, copy.chooseCoach]) {
      assert.ok(setup.html().includes(text(label)), `${locale}: setup ${label}`);
    }
    assert.equal(elements(setup.api.render()).find(node => node.type === "input")?.props.placeholder, copy.chooseCoach);
    const chooseCoach = elements(setup.api.render()).find(node => node.type === "button" && node.props.children === copy.chooseCoach);
    assert.ok(chooseCoach);
    (chooseCoach.props.onClick as () => void)();
    assert.deepEqual(setup.calls, [["setSelectedCoachId", "coach-1"], ["setQuery", ""], ["setVisibleStep", "formation"], ["setFeedback", copy.coachChosen], ["scroll", "my-club-xi-pitch"]]);
    const formation = actual({ ...base, marketPage: false, formationCode: null }, mod.getTouchlineFantasyMarketWorkflowCopy, true);
    for (const label of [copy.step2, copy.chooseFormation, copy.formationInstruction]) {
      assert.ok(formation.html().includes(text(label)), `${locale}: formation ${label}`);
    }
    const empty = actual({ ...base, selectedCoach: null, filteredCoaches: [], browseCards: [] }, mod.getTouchlineFantasyMarketWorkflowCopy, true);
    assert.ok(empty.html().includes(text(copy.noCoach)), `${locale}: empty coach market`);
    assert.ok(actual({ ...base, browseCards: [] }, mod.getTouchlineFantasyMarketWorkflowCopy, true).html().includes(text(copy.noCards)), `${locale}: empty player market`);
    formation.api.changeFormation("4-3-3");
    assert.ok(formation.calls.some(([key, value]) => key === "setFeedback" && value === copy.formationUpdated));
    const view = actual(base, mod.getTouchlineFantasyMarketWorkflowCopy, true);
    await view.api.save("confirm");
    assert.ok(view.calls.some(([key, value]) => key === "setFeedback" && value === copy.confirmVerified));
    const composed = [...elements(setup.api.render()), ...elements(view.api.render())];
    for (const component of [gameweekCard, coachZoom]) {
      const children = composed.filter(node => node.type === component);
      assert.ok(children.length > 0, `${locale}: composed child present`);
      for (const child of children) {
        assert.equal(child.props.locale, locale);
        assert.equal(child.props.draftLocalesEnabled, true);
      }
    }
    assert.equal(isTouchLineLocaleComplete(locale), false);
    assert.equal(mod.getTouchlineFantasyMarketWorkflowCopy(locale), mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES["en-GB"]);
  }
});

test("Spanish Fantasy Market workflow copy covers visible setup, feedback, selector and empty states without opening its gate", async () => {
  const mod = await load();
  const spanish = mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES["es-ES"];
  assert.deepEqual(Object.keys(spanish), Object.keys(mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES["en-GB"]));
  for (const value of Object.values(spanish)) {
    assert.ok(value.trim());
    assert.doesNotMatch(value, /TODO|FIXME|\[(?:translate|missing)\]|£29|subscription|assinatura/i);
  }
  assert.deepEqual(spanish.cardsInPosition.match(/\{\w+\}/g), ["{count}"]);
  assert.deepEqual(spanish.xiSlot.match(/\{\w+\}/g), ["{slot}"]);
  for (const [key, expected] of Object.entries({
    formationUpdated: "Formación actualizada. Vuelve a guardar para conservar el cambio.",
    cardNotEligible: "Esta carta no es elegible para esta jornada.",
    saveUnconfirmed: "El servidor recibió el guardado, pero aún no ha devuelto la verificación. Actualiza la página antes de realizar otro cambio.",
    chooseYourCoach: "Elige a tu entrenador",
    noCoach: "No hay ningún entrenador canónico disponible para este club.",
    market: "Mercado",
    searchPlayer: "Buscar jugador",
    noCards: "Ninguna carta coincide con esta selección o búsqueda. Borra la búsqueda o prueba otra posición o club.",
    confirmXI: "Confirmar XI",
  })) assert.equal(spanish[key as keyof typeof spanish], expected, key);
  assert.match(spanish.metadataDescription, /TouchLine/); assert.match(spanish.metadataDescription, /XI/);
  assert.match(spanish.confirmVerified, /TouchLine/); assert.match(spanish.draftVerified, /TouchLine/);

  const html = actual({ locale: "es-ES", pt: false, selectedCoach: null, formationCode: null, filteredCoaches: [] }, () => spanish).html();
  for (const value of [spanish.chooseYourCoach, spanish.noCoach, spanish.chooseCoach, spanish.confirmXI]) assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /Choose your coach|No canonical coach|Search player|Confirm XI/);
  assert.doesNotMatch(html, /\{count\}|\{slot\}/);
  assert.equal(isTouchLineLocaleComplete("es-ES"), false);
  assert.equal(mod.getTouchlineFantasyMarketWorkflowCopy("es-ES"), mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES["en-GB"]);
});

test("all workflow catalogue keys are consumed by actual branches, events or feedback handlers", async () => {
  const mod = await load(); const copy = mod.getTouchlineFantasyMarketWorkflowCopy("en-GB"); const used = new Set<string>();
  const tracked = new Proxy(copy, { get: (target, key) => { used.add(String(key)); return Reflect.get(target, key); } });
  const getCopy = () => tracked;
  const scenarios = [
    {}, { marketPage: false }, { marketPage: false, selectedCoach: null, formationCode: null }, { marketPage: false, formationCode: null }, { selectedCoach: null, formationCode: null }, { selectedCoach: null, filteredCoaches: [] },
    { formationCode: null }, { arenaOpen: true }, { editable: false }, { browseSlot: null, activeSlot: null },
    { selections: [{ playerId: card.id, slotId: "ST" }], squadView: "squad" },
    { selections: [{ playerId: card.id, slotId: "ST" }] }, { selectedCoach: null }, { hasUnsavedChanges: true },
    { selections: [{ playerId: "other-player", slotId: "ST" }] }, { browseCards: [] }, { lineupConfirmed: true },
  ];
  for (const input of scenarios) actual(input, getCopy).html();
  const setup = actual({ selectedCoach: null }, getCopy);
  const button = elements(setup.api.render()).find(node => node.type === "button" && node.props.children === copy.chooseCoach); assert.ok(button);
  (button.props.onClick as () => void)();
  const changed = actual({ formationCode: null }, getCopy); changed.api.changeFormation("4-3-3");
  await actual({ selections: [{ playerId: card.id, slotId: "ST" }] }, getCopy).api.removePlayer(card.id);
  for (const input of [
    { eligiblePlayers: [] }, { eligiblePlayers: [{ ...player, positionBucket: "goalkeeper" }] },
    { activeSlot: null, geometry: { slots: [] } }, { selections: [{ playerId: player.playerId, slotId: "ST2" }] },
    { eligiblePlayers: [{ ...player, marketValueEur: 9999 }] },
  ]) await actual(input, getCopy).api.addPlayer(card);
  await actual({}, getCopy).api.save("draft"); await actual({}, getCopy).api.save("confirm");
  for (const input of [{ validation: { valid: false } }, { loadPersistedLineup: async () => false }, { fetch: async () => { throw Error("offline"); } }]) await actual(input, getCopy).api.save("confirm");
  const route = ts.createSourceFile("page.tsx", readFileSync(new URL("../app/clubowner/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const metadataFunctions = route.statements.filter(node => ts.isFunctionDeclaration(node) && ["marketLocale", "generateMetadata", "generateClubOwnerMetadata"].includes(node.name?.text ?? ""));
  assert.equal(metadataFunctions.length, 3);
  const metadataExports: { generateMetadata?: (input: unknown) => Promise<{ description: string }> } = {};
  runInNewContext(ts.transpileModule(metadataFunctions.map(node => node.getText(route)).join("\n"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: metadataExports, isTouchLineSiteLocalesEnabled: releasePolicy.isTouchLineSiteLocalesEnabled, resolveTouchlineCatalogueLocale, draftLocalesEnabled: false, getTouchlineFantasyMarketWorkflowCopy: getCopy });
  assert.ok(metadataExports.generateMetadata);
  const metadata = await metadataExports.generateMetadata({ searchParams: Promise.resolve({ lang: "en-GB" }) });
  assert.equal(metadata.description, "Manage your TouchLine XI by position.");
  assert.ok(used.has("metadataDescription"), "actual metadata consumes its workflow key");
  // Retained catalogue entries for retired grid/technical-sidebar copy. Removal
  // is active again in the player zoom and must remain covered by this oracle.
  const legacyGridKeys = ["viewTactical", "viewCards", "removeFromXI", "openSlot", "choose", "formation", "market", "readOnlyInstruction"];
  assert.deepEqual([...used].filter(key => key !== "then").sort(), Object.keys(copy).filter(key => !legacyGridKeys.includes(key)).sort());
});

test("actual PT setup/footer use Etapa and Rodada rather than untranslated STEP/GAMEWEEK", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  const html = actual({ locale: "pt-BR", pt: true, marketPage: false, selectedCoach: null, formationCode: null }, getCopy).html();
  assert.ok(html.includes("Etapa 1")); assert.doesNotMatch(html, />GAMEWEEK<|>STEP 1</);
});

test("actual embedded consumer obtains presentation from workflow getter, including dynamic branches", () => {
  const read: string[] = [];
  const copy = new Proxy({}, { get: (_, key) => `copy:${String(key)}` });
  const main = actual({ locale: "pt-BR", pt: true }, locale => { read.push(locale); return copy; });
  const html = main.html();
  assert.ok(read.length > 0); assert.ok(read.every(locale => locale === "pt-BR"));
  for (const key of ["playAria", "startingXI", "arenaMode", "browsePosition", "openShort", "technicalArea", "coach", "positionSelectionAria", "backToPitch", "searchPlayer", "playerSelection", "cardsInPosition", "xiSlot", "chooseSlot", "readyConfirm", "squadSynced", "confirmXI"]) assert.ok(html.includes(`copy:${key}`), key);
  for (const key of ["myXI", "editInstruction", "formation", "market"]) assert.ok(!html.includes(`copy:${key}<`), `${key} is absent from the configured Market header`);
  assert.match(html, /Canonical Player/); assert.match(html, /Canonical Club/); assert.match(html, /4-3-3/); assert.match(html, />ST</);
  assert.doesNotMatch(html, />7</, "the redundant round-number box is removed");
});

test("catalogue has eight complete key sets, protected tokens and unchanged public gates", async () => {
  const mod = await load(); const catalogues = mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES;
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(mod.getTouchlineFantasyMarketWorkflowCopy(locale), baseline[locale]);
  const codes = TOUCHLINE_APPROVED_LOCALES.map(value => value.code);
  assert.deepEqual(Object.keys(catalogues), codes);
  assert.deepEqual(mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_DRAFT_LOCALES, codes.slice(2));
  assert.equal(mod.TOUCHLINE_FANTASY_MARKET_WORKFLOW_DRAFT_STATUS, "draft");
  for (const locale of codes) {
    const copy = catalogues[locale]; assert.deepEqual(Object.keys(copy), Object.keys(catalogues["en-GB"]));
    for (const value of Object.values(copy)) { assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME|https?:|£29|subscription|assinatura/i); }
    assert.match(copy.playAria, /TouchLine/); assert.match(copy.confirmVerified, /TouchLine/); assert.match(copy.draftVerified, /TouchLine/); assert.match(copy.myXI, /XI/);
    assert.match(copy.metadataDescription, /TouchLine/); assert.match(copy.metadataDescription, /XI/);
    assert.match(copy.xiSlot, /\{slot\}/);
    if (locale !== "en-GB" && locale !== "pt-BR") { assert.equal(isTouchLineLocaleComplete(locale), false); assert.equal(mod.getTouchlineFantasyMarketWorkflowCopy(locale), catalogues["en-GB"]); }
  }
  for (const locale of [null, undefined, "", "constructor", "__proto__"]) assert.equal(mod.getTouchlineFantasyMarketWorkflowCopy(locale), catalogues["en-GB"]);
  assert.equal(catalogues["pt-BR"].step1, "Etapa 1"); assert.equal(catalogues["pt-BR"].step2, "Etapa 2"); assert.equal(catalogues["pt-BR"].round, "Rodada"); assert.equal(catalogues["en-GB"].round, "Round");
});

test("real rendered setup, card/list, selection and footer retain EN/PT baseline and control guards", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  for (const locale of ["en-GB", "pt-BR"]) {
    const pt = locale === "pt-BR"; const base = { locale, pt };
    let html = actual({ ...base, selectedCoach: null, formationCode: null, filteredCoaches: [] }, getCopy).html();
    assert.ok(html.includes(pt ? "Escolha seu treinador" : "Choose your coach")); assert.ok(html.includes(pt ? "Nenhum treinador canônico disponível para este clube." : "No canonical coach is available for this club."));
    html = actual({ ...base, marketPage: false, formationCode: null }, getCopy).html();
    assert.ok(html.includes(pt ? "Etapa 2" : "STEP 2")); assert.ok(html.includes(pt ? "11 vagas" : "11 slots"));
    html = actual({ ...base, squadView: "squad", selections: [{ playerId: card.id, slotId: slot.id }], hasUnsavedChanges: true }, getCopy).html();
    for (const value of pt ? ["Modo Arena", "No seu XI", "Alterações não salvas"] : ["Arena mode", "In your XI", "Unsaved changes"]) assert.ok(html.includes(value), value);
    html = actual({ ...base, browseCards: [], editable: false, validation: { valid: false } }, getCopy).html();
    assert.ok(html.includes(pt ? "Nenhum card corresponde a esta seleção ou busca." : "No cards match this selection or search."));
    assert.match(html, /<button type="button" disabled="">(?:Confirmar XI|Confirm XI)<\/button>/);
    assert.doesNotMatch(html, /aria-label="(?:Retirar do XI|Remove from XI)/);
    html = actual({ ...base, lineupConfirmed: true }, getCopy).html(); assert.ok(html.includes(pt ? "XI confirmado" : "XI confirmed"));
  }
});

test("actual save handler keeps request, verification and uncertain/error outcomes intact in both locales", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  for (const locale of ["en-GB", "pt-BR"]) {
    const pt = locale === "pt-BR";
    for (const action of ["draft", "confirm"]) {
      const view = actual({ locale, pt }, getCopy); await view.api.save(action);
      const request = view.calls.find(([key]) => key === "fetch")?.[1] as { url: string; options: { method: string; body: string } };
      assert.equal(request.url, "/api/touchline-fantasy/lineup"); assert.equal(request.options.method, "POST");
      assert.deepEqual(JSON.parse(request.options.body), { gameweekId: "round-7", selectedCoachId: "coach-1", formationCode: "4-3-3", selections: [], action, idempotencyKey: `fixed-key:${action}` });
      assert.deepEqual(view.calls.filter(([key]) => key === "setSaving"), [["setSaving", true], ["setSaving", false]]);
      assert.ok(view.calls.some(([key, value]) => key === "setFeedback" && value === getCopy(locale)[action === "confirm" ? "confirmVerified" : "draftVerified"]));
      assert.equal(view.calls.some(([key, value]) => key === "setVisibleStep" && value === "locked"), action === "confirm");
    }
    for (const [input, expected] of [
      [{ loadPersistedLineup: async () => false }, "saveUnconfirmed"],
      [{ fetch: async () => { throw Error("offline"); } }, "saveConnectionFailed"],
      [{ validation: { valid: false } }, "fixXI"],
    ] as const) {
      const view = actual({ locale, pt, ...input }, getCopy); await view.api.save("confirm");
      assert.ok(view.calls.some(([key, value]) => key === "setFeedback" && value === getCopy(locale)[expected]));
      assert.equal(view.calls.some(([key]) => key === "setVisibleStep"), false);
    }
    for (const input of [{ editable: false }, { activeGameweek: null }, { selectedCoachId: null }, { formationCode: null }]) {
      const view = actual({ locale, pt, ...input }, getCopy); await view.api.save("confirm"); assert.deepEqual(view.calls, []);
    }
    const rejected = actual({ locale, pt, fetch: async () => ({ ok: false, json: async () => ({ error: "private-unknown-detail" }) }) }, getCopy);
    await rejected.api.save("confirm");
    assert.ok(rejected.calls.some(([key, value]) => key === "setFeedback" && value === touchlineFantasyLineupErrorCopy("private-unknown-detail", locale)));
    assert.equal(rejected.calls.some(([key]) => key === "verify" || key === "setVisibleStep"), false);
  }
});

test("real add/remove/formation handlers keep canonical eligibility and identifiers independent of labels", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  for (const locale of ["en-GB", "pt-BR"]) {
    const base = { locale, pt: locale === "pt-BR" };
    for (const [input, expected] of [
      [{ eligiblePlayers: [] }, "cardNotEligible"],
      [{ eligiblePlayers: [{ ...player, positionBucket: "goalkeeper" }] }, "slotNotEligible"],
      [{ activeSlot: null, geometry: { slots: [] } }, "noCompatibleSlot"],
      [{ selections: [{ playerId: player.playerId, slotId: "ST2" }] }, "alreadySelected"],
      [{ eligiblePlayers: [{ ...player, marketValueEur: 9999 }] }, "budgetExceeded"],
    ] as const) {
      const view = actual({ ...base, ...input }, getCopy); assert.equal(await view.api.addPlayer(card), false);
      assert.ok(view.calls.some(([key, value]) => key === "setFeedback" && value === getCopy(locale)[expected]));
      assert.equal(view.calls.some(([key]) => key === "setSelections"), false);
    }
    const added = actual(base, getCopy); assert.equal(await added.api.addPlayer(card), true);
    assert.equal(JSON.stringify(added.calls.find(([key]) => key === "setSelections")?.[1]), JSON.stringify([{ playerId: player.playerId, slotId: "ST" }]));
    const removed = actual({ ...base, selections: [{ playerId: player.playerId, slotId: "ST" }] }, getCopy); await removed.api.removePlayer(player.playerId);
    assert.equal(JSON.stringify(removed.calls.find(([key]) => key === "setSelections")?.[1]), "[]");
    assert.ok(removed.calls.some(([key, value]) => key === "setFeedback" && value === getCopy(locale).changeNotSaved));
    const unchanged = actual(base, getCopy); unchanged.api.changeFormation("4-3-3");
    assert.deepEqual(unchanged.calls, [], "current formation must preserve every existing slot");
    const changed = actual({ ...base, formationCode: null }, getCopy); changed.api.changeFormation("4-3-3");
    assert.ok(changed.calls.some(([key, value]) => key === "setFormationCode" && value === "4-3-3"));
    assert.ok(changed.calls.some(([key, value]) => key === "setFeedback" && value === getCopy(locale).formationUpdated));
  }
});

test("actual add handler rejects a skipped empty slot and advances in guided formation order", async () => {
  const { getTouchlineFantasyMarketWorkflowCopy: getCopy } = await load();
  const shape = TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"];
  const keeper = { playerId: "keeper", slotId: "GK" };
  const common = { geometry: shape, selections: [keeper] };
  const skipped = actual({ ...common, activeSlot: shape.slots.find(entry => entry.id === "RB"),
    eligiblePlayers: [{ ...player, positionBucket: "right-back" }] }, getCopy);
  assert.equal(await skipped.api.addPlayer(card), false);
  assert.deepEqual(skipped.calls, [], "skipped slot cannot change the draft or issue I/O");
  const allowed = actual({ ...common, activeSlot: shape.slots.find(entry => entry.id === "RCB"),
    eligiblePlayers: [{ ...player, positionBucket: "centre-back" }] }, getCopy);
  assert.equal(await allowed.api.addPlayer(card), true);
  assert.equal(JSON.stringify(allowed.calls.find(([name]) => name === "setSelections")?.[1]),
    JSON.stringify([keeper, { playerId: player.playerId, slotId: "RCB" }]));
  assert.deepEqual(allowed.calls.find(([name]) => name === "setActiveSlotId"), ["setActiveSlotId", "LCB"]);
  assert.ok(!allowed.calls.some(([name]) => name === "fetch"));
});

test("all eight removal labels describe lineup removal, not a market refund", async () => {
  const { TOUCHLINE_FANTASY_MARKET_WORKFLOW_CATALOGUES: catalogues } = await load();
  const expected = { "en-GB": "Remove from line-up", "pt-BR": "Retirar da escalação",
    "es-ES": "Retirar de la alineación", "it-IT": "Rimuovi dalla formazione",
    "fr-FR": "Retirer de la composition", "ar-SA": "إخراج من التشكيلة",
    "tr-TR": "İlk 11’den çıkar", "de-DE": "Aus der Aufstellung nehmen" };
  for (const [locale, label] of Object.entries(expected)) {
    assert.equal(catalogues[locale as keyof typeof catalogues].remove, label);
  }
});
