import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = resolve(import.meta.dirname, "../..");
const native = createRequire(import.meta.url);
const postcss = createRequire(native.resolve("next"))("postcss");
export const MATCH_CENTRE_REVIEW_ASSET_PATHS = Object.freeze([
  "/touchlineArena/shared/club-logos/2026-27/arsenal.png",
  "/touchlineArena/shared/club-logos/2026-27/leeds-united.png",
  // The real TeamMark resolver promotes the named Leeds fixture to ui-512.
  "/touchlineArena/shared/club-logos/2026-27/ui-512/leeds-united.png",
]);
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];

/** Reuse the existing real mounted Live harness, not reconstructed product JSX.
 * Only auth/audio/logo integration remains stubbed, as documented by that test.
 * MatchCentre, timeline, ratings, team sheets and their styles remain real. */
export function createMatchCentreMobileReviewHtml({ locale = "pt-BR" } = {}) {
  assert.ok(locales.includes(locale), "Unsupported preview locale");
  const path = resolve(root, "tests/touchline-live-interactions-browser.test.mts");
  const original = readFileSync(path, "utf8");
  const boundary = original.indexOf("\ntest('Live mounted interactions:");
  assert.ok(boundary > 0, "Live harness boundary changed");
  const sheets = [];
  const styles = new Map();
  function captureCss(file) {
    if (styles.has(file)) return styles.get(file);
    const prefix = `review${styles.size}_`;
    const sheet = postcss.parse(readFileSync(file, "utf8"));
    sheet.walkRules(rule => {
      const globals = [];
      rule.selector = rule.selector.replace(/:global\(([^)]+)\)/g, (_match, value) => `REVIEW_GLOBAL_${globals.push(value) - 1}`)
        .replace(/\.([a-zA-Z_][\w-]*)/g, (_match, name) => `.${prefix}${name}`)
        .replace(/REVIEW_GLOBAL_(\d+)/g, (_match, index) => globals[Number(index)]);
    });
    sheets.push(sheet.toString());
    const code = `exports.__esModule=true;exports.default=new Proxy({},{get:(_,key)=>${JSON.stringify(prefix)}+String(key)});`;
    styles.set(file, code);
    return code;
  }
  const source = original.slice(0, boundary)
    .replaceAll("import.meta.url", JSON.stringify(pathToFileURL(path).href))
    .replace("const require = createRequire(", "const harnessRequire = createRequire(")
    .replaceAll("require.resolve", "harnessRequire.resolve")
    .replace("modules['lucide-react'] = 'module.exports=new Proxy({}, {get:()=>()=>null});';", "modules['lucide-react'] = REAL_ICONS;")
    .replace("modules[file] = 'exports.__esModule=true;exports.default=new Proxy({}, {get:(_,key)=>String(key)});'; return file;", "modules[file] = captureCss(file); return file;")
    + "\nexport { fixtureHtml };";
  assert.ok(source.includes("captureCss(file)"), "Live CSS harness changed");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, { exports, require: createRequire(path), process: { env: {} }, captureCss, URL,
    REAL_ICONS: readFileSync(native.resolve("lucide-react"), "utf8") });
  const now = Date.now();
  const startsAt = new Date(now - 60 * 60_000).toISOString();
  const capturedAt = new Date(now).toISOString();
  const home = { id: "synthetic-home", providerId: "synthetic-home", name: "Arsenal Football Club", logoUrl: MATCH_CENTRE_REVIEW_ASSET_PATHS[0] };
  const away = { id: "synthetic-away", providerId: "synthetic-away", name: "Leeds United", logoUrl: MATCH_CENTRE_REVIEW_ASSET_PATHS[1] };
  const fixtures = Array.from({ length: 10 }, (_item, index) => ({ id: `synthetic-${index}`, providerId: `synthetic-${index}`, startsAt,
    status: "FullTime", name: `${home.name} vs ${away.name}`, homeTeam: home, awayTeam: away, homeScore: 2, awayScore: 2,
    roundId: "synthetic-round", roundName: "Review", verifiedAt: capturedAt }));
  const names = ["Kiernan Dewsbury-Hall", "Tyrique Aaron Delali Yusuff George", "Ainsley Maitland-Niles", "Konstantinos Tzolakis", "Jarrad Branthwaite", "Mohamed Belloumi"];
  const lineups = Array.from({ length: 29 }, (_item, index) => ({ id: `lineup-${index}`, fixtureId: fixtures[0].id,
    playerId: `player-${index}`, teamId: index % 2 ? away.id : home.id,
    playerName: `${names[index % names.length]} ${index + 1}`, jerseyNumber: index + 1,
    position: index < 2 ? "Goalkeeper" : "Midfielder", isStarter: index < 22, isSubstitute: index >= 22, statistics: [] }));
  const detail = { fixture: { ...fixtures[0] }, capturedAt, lineupAvailableAt: capturedAt, lineups,
    formations: [], sidelined: [], events: Array.from({ length: 14 }, (_item, index) => ({ id: `event-${index}`,
      fixtureId: fixtures[0].id, teamId: index % 2 ? away.id : home.id, type: index % 3 ? "Substitution" : "Goal",
      minute: 90 - index * 3, playerName: names[index % names.length], relatedPlayerName: names[(index + 1) % names.length] })),
    playerStatistics: lineups.map((member, index) => ({ playerId: member.playerId, teamId: member.teamId, playerName: member.playerName,
      appearanceStatus: index < 22 ? "started" : "substitute", minutes: index < 22 ? 90 : 14, rating: Number((8.95 - index * .09).toFixed(2)),
      touchlinePoints: Number((8.95 - index * .09).toFixed(2)), settlementStatus: "final", statistics: {}, contributions: [] })) };
  let html = exports.fixtureHtml({ initialFixtures: fixtures, initialFixtureId: fixtures[0].id, initialMatchDetail: detail,
    initialNow: now, initialTimeZone: "Europe/Malta", initialLocale: locale, initialSeasonName: "2026/27",
    liveUpdates: false, canReadMatchDetail: false, draftLocalesEnabled: true,
    accountLocaleContext: { mode: "guest" }, initialReadMetadata: { state: "persisted-live-snapshot", degraded: false, fetchedAt: capturedAt } });
  html = html.replace("<html>", `<html lang="${locale}">`).replace("</head>", `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;background:#020706}.review-notice{margin:0;padding:10px 18px;background:#233318;color:#eaffd8;font:14px system-ui}${sheets.join("\n")}</style></head>`)
    .replace('<body><div id="root">', '<body><p class="review-notice">PRÉVIA ISOLADA · dados e nomes sintéticos · sem conta, provider ou notificações reais</p><div id="root">')
    .replace("<script>", `<script>window.fetch=async()=>({ok:false,status:503,json:async()=>({ok:false,error:'PREVIEW_READ_ONLY'})});document.addEventListener('click',e=>{const a=e.target.closest('a');if(a&&!a.getAttribute('href').startsWith('#'))e.preventDefault();});`);
  return html;
}
