import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { chromium, webkit, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY } from "../lib/touchlineArena/formation-geometry.ts";
import { findTouchLineClub, type ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import { createTouchlineArenaCoachSlot } from "../lib/touchlineArena/coach-card.ts";
import { validateTouchlineFantasyLineup } from "../lib/touchlineFantasy/domain.ts";
import { touchlineMarketPositionBucket, type TouchlineRosterRole } from "../lib/touchlineArena/position-eligibility.ts";
import type { TouchlineCoach } from "../lib/football-data/types.ts";
import type { TouchlineFantasySnapshot } from "../lib/touchlineFantasy/server.ts";

// Finite, opt-in DOM proof only. No server, credentials, real account, provider,
// DB, Next build or remote assets. All requests are fulfilled/aborted locally.
// The complete product component/children/CSS/domain are used, not copied handlers.
const enabled = process.env.TOUCHLINE_RUN_XI_BROWSER_TESTS === "1";
function parseXiKeyboardMode(value: string | undefined): "normal" | "diagnostic" | "all" {
  if (value === undefined || value === "0") return "normal";
  if (value === "1") return "diagnostic";
  assert.equal(value, "all", "Unrecognized TOUCHLINE_DIAGNOSE_XI_KEYBOARD");
  return "all";
}
const keyboardMode = parseXiKeyboardMode(process.env.TOUCHLINE_DIAGNOSE_XI_KEYBOARD);
function parseXiScope(value: string | undefined): "full" | "webkit-en-focus" {
  if (value === undefined || value === "full") return "full";
  assert.equal(value, "webkit-en-focus", "Unrecognized TOUCHLINE_XI_BROWSER_SCOPE");
  return "webkit-en-focus";
}
const browserScope = parseXiScope(process.env.TOUCHLINE_XI_BROWSER_SCOPE);
function validateXiKeyboardScope(mode: ReturnType<typeof parseXiKeyboardMode>, scope: ReturnType<typeof parseXiScope>) {
  assert.ok(mode === "normal" || scope === "full", "Keyboard diagnostic cannot be combined with a partial scenario scope");
}
validateXiKeyboardScope(keyboardMode, browserScope);
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const origin = "https://xi.test";
const geometry = TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY["4-3-3"];
const club = findTouchLineClub("Arsenal")!;
const targetSlot = geometry.slots.find(slot => slot.allowedPositions.includes("centre-forward"))!;
const positionNames = {
  goalkeeper: "Goalkeeper", "centre-back": "Centre Back", "right-back": "Right Back", "left-back": "Left Back",
  "defensive-midfield": "Defensive Midfield", midfield: "Central Midfield", attacker: "Winger", "centre-forward": "Centre Forward",
} as const;

function fixtureSnapshot(locked = false): TouchlineFantasySnapshot {
  assert.ok(club); assert.ok(targetSlot);
  const now = Date.now();
  const round = { id: "xi-fixture-round", number: 7, state: locked ? "LOCKED" as const : "MARKET_OPEN" as const,
    marketOpensAt: new Date(now - 3_600_000).toISOString(), locksAt: new Date(now + 3_600_000).toISOString(),
    firstFixtureAt: new Date(now + 3_600_000).toISOString(), lastFixtureAt: new Date(now + 7_200_000).toISOString() };
  const coach: TouchlineCoach = { id: "xi-coach", providerId: "xi-coach", provider: "sportmonks",
    name: "Synthetic XI Coach", displayName: "Synthetic XI Coach", teamId: club.teamId, nationality: "England",
    source: { provider: "sportmonks", providerId: "synthetic-xi-coach", lastSyncedAt: new Date(now).toISOString() } };
  // Explicitly synthetic football/card data, confined to this intercepted page.
  const catalogue: ClubOwnerSquadCard[] = geometry.slots.map((slot, index) => ({
    id: `xi-player-${index}`, canonicalPlayerId: `xi-player-${index}`, name: `Synthetic ${slot.id} Player`, shortName: `Fixture ${slot.id}`,
    role: slot.role, position: positionNames[slot.allowedPositions[0]], clubName: club.name, shirtNumber: index + 1,
    countryCode3: "ENG", marketValue: "", marketValueState: "verified", touchlinePoints: 0, seasonTotalRating: null,
    editorialCard: { tierKey: "radiant-gold", marketValueEur: 1_000_000, marketValueState: "verified",
      cardPrice: { amountMinor: 0, currency: "GBP" }, lastReviewedAt: "2026-10-03T00:00:00Z" },
  }));
  const original = catalogue[geometry.slots.indexOf(targetSlot)];
  catalogue.push({ ...original, id: "xi-replacement", canonicalPlayerId: "xi-replacement", name: "Synthetic Replacement", shortName: "Replacement" });
  const selections = geometry.slots.map((slot, index) => ({ slotId: slot.id, playerId: `xi-player-${index}` }));
  const valid = validateTouchlineFantasyLineup({ selections, geometry,
    players: catalogue.map(card => ({ playerId: card.id, clubId: card.clubName, marketValueEur: 1_000_000,
      positionBucket: touchlineMarketPositionBucket(card.position, card.role as TouchlineRosterRole) as Exclude<ReturnType<typeof touchlineMarketPositionBucket>, "outfield"> })),
    budgetEur: 900_000_000, maxPlayersPerClub: 11, requireComplete: true });
  assert.equal(valid.valid, true, "synthetic fixture must satisfy the real eligibility validator before mounting");
  return { userId: "synthetic-local-owner", entitlementActive: true, subscription: { amountMinor: 2990, currency: "GBP" },
    config: { budgetEur: 900_000_000, maxPlayersPerClub: 11, lockOffsetMinutes: 0 }, gameweeks: [round], activeGameweek: round,
    userGameweek: { id: "xi-fixture-lineup", formationCode: "4-3-3", state: "DRAFT", totalMarketValueEur: 11_000_000, carriedFromPrevious: false, selectedCoachId: coach.id },
    selections, catalogue, coaches: [{ id: coach.id, coach, slot: createTouchlineArenaCoachSlot(coach, null, "radiant-gold"),
      clubId: club.teamId, clubName: club.name, clubLogoUrl: null, countryCode3: "ENG", competition: null }],
    formationRegistry: TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY, lineupAlerts: [], gameweekScore: 0, seasonScore: 0,
    matchHistory: [], gameweekRanking: [], seasonRanking: [] };
}

type Bundle = { script: string; css: string; sources: string[] };
function transpileFixtureModule(source: string, fileName: string) {
  return ts.transpileModule(source, { fileName, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }, transformers: { before: [context => sourceFile => {
    // ESM evaluates static dependencies before the module body, even when an
    // import is written last. CommonJS lowering otherwise leaves its require at
    // that textual position. Hoist AST declarations, not generated JS strings;
    // retain dependency order, live bindings and leading directives.
    const directives: ts.Statement[] = [], dependencies: ts.Statement[] = [], body: ts.Statement[] = [];
    let prologue = true;
    for (const statement of sourceFile.statements) {
      if (prologue && ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
        directives.push(statement); continue;
      }
      prologue = false;
      if (ts.isImportDeclaration(statement) || (ts.isExportDeclaration(statement) && statement.moduleSpecifier)) dependencies.push(statement);
      else body.push(statement);
    }
    return context.factory.updateSourceFile(sourceFile, [...directives, ...dependencies, ...body]);
  }] } }).outputText;
}

test("fixture module lowering initializes ESM dependencies before body in source order", async () => {
  const execute = (source: string, fileName: string, dependencies: Record<string, unknown>) => {
    const fixtureModule = { exports: {} as Record<string, unknown> };
    runInNewContext(transpileFixtureModule(source, fileName), { module: fixtureModule, exports: fixtureModule.exports, require(name: string) {
      assert.ok(Object.hasOwn(dependencies, name), `Unmapped regression dependency: ${name}`);
      return dependencies[name];
    } }, { timeout: 1_000 });
    return fixtureModule.exports;
  };
  // The real source intentionally has an import after a top-level initializer.
  // Native ESM is the control; no product source is rearranged for this fixture.
  const native = await import("../lib/touchlineArena/country-flags.ts");
  const countryPath = path.join(root, "lib/touchlineArena/country-flags.ts");
  const country = execute(readFileSync(countryPath, "utf8"), countryPath, {
    "./iso-alpha3-to-alpha2.generated.ts": await import("../lib/touchlineArena/iso-alpha3-to-alpha2.generated.ts"),
  }) as typeof native;
  assert.equal(native.normalizeTouchlineCountryCode3("ZA"), "ZAF");
  assert.equal(country.normalizeTouchlineCountryCode3("ZA"), "ZAF");
  assert.equal(country.touchlineCountryFlagUrl("ENG"), "/touchlineArena/shared/country-flags-4x3/gb-eng.svg");
  assert.equal(country.touchlineCountryFlagUrl("ZAF"), "/touchlineArena/shared/country-flags-4x3/za.svg");

  const order: string[] = [];
  const dependency = { value: 7 };
  const fixtureModule = { exports: {} as { initial?: number; read?: () => number; forwarded?: number } };
  const lowered = transpileFixtureModule(`"use client";
    record('body'); export const initial=value; export function read(){return value;}
    import './side-effect'; import {value} from './value'; export {forwarded} from './forwarded';
  `, "dependency-order.ts");
  assert.ok(lowered.indexOf('"use client"') < lowered.indexOf('require("./side-effect")'));
  runInNewContext(lowered, { module: fixtureModule, exports: fixtureModule.exports, record: (value: string) => order.push(value), require(name: string) {
    order.push(name);
    if (name === "./side-effect") return {};
    if (name === "./value") return dependency;
    assert.equal(name, "./forwarded"); return { forwarded: 9 };
  } }, { timeout: 1_000 });
  assert.deepEqual(order, ["./side-effect", "./value", "./forwarded", "body"]);
  assert.equal(fixtureModule.exports.initial, 7); assert.equal(fixtureModule.exports.forwarded, 9);
  dependency.value = 11; assert.equal(fixtureModule.exports.read?.(), 11, "named import must remain a live property read");
});

function bundleProduct(): Bundle {
  const modules = new Map<string, { source: string; imports: Record<string, string> }>();
  const css: string[] = [];
  const sources = new Set<string>();
  const nextRequire = createRequire(require.resolve("next/package.json"));
  // Reuse Next's installed CSS Modules processors; never flatten module scopes.
  const postcss = nextRequire("postcss");
  const localByDefault = require("next/dist/compiled/postcss-modules-local-by-default");
  const scope = require("next/dist/compiled/postcss-modules-scope");
  const boundaries: Record<string, string> = {
    "next/image": `const React=require('react'); module.exports=React.forwardRef(function Image(p,ref){const {unoptimized,priority,fill,quality,loader,placeholder,blurDataURL,onLoadingComplete,...rest}=p;return React.createElement('img',{...rest,ref});});`,
    "next/link": `const React=require('react'); module.exports=React.forwardRef(function Link(p,ref){const {prefetch,replace,scroll,shallow,locale,legacyBehavior,passHref,...rest}=p;return React.createElement('a',{...rest,ref});});`,
    "next/navigation": `exports.usePathname=()=>location.pathname;exports.useRouter=()=>({refresh(){throw Error('Unexpected Next refresh');},push(){throw Error('Unexpected Next navigation');},replace(){throw Error('Unexpected Next navigation');}});`,
  };
  const allowedPackages = new Set(["react", "react-dom", "scheduler", "lucide-react"]);
  function resolve(specifier: string, parent: string): string {
    if (Object.hasOwn(boundaries, specifier)) return `boundary:${specifier}`;
    if (specifier.startsWith("@/") || specifier.startsWith(".")) {
      const base = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(parent), specifier);
      const file = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.js")]
        .find(candidate => existsSync(candidate) && statSync(candidate).isFile());
      assert.ok(file, `Missing fixture module: ${specifier}`);
      assert.ok(file.startsWith(root), "fixture module escaped repository");
      return file;
    }
    assert.ok(allowedPackages.has(specifier.split("/")[0]), `Unapproved browser dependency: ${specifier}`);
    // Keep a single root React instance; resolve transitive dependencies from
    // their actual importer, as pnpm does not expose scheduler at the root.
    return specifier === "react" || specifier.startsWith("react/")
      ? require.resolve(specifier)
      : createRequire(parent).resolve(specifier);
  }
  function add(id: string): void {
    if (modules.has(id)) return;
    const compiledModule = { source: "", imports: {} as Record<string, string> };
    modules.set(id, compiledModule);
    const isBoundary = id.startsWith("boundary:");
    let source = isBoundary ? boundaries[id.slice("boundary:".length)] : readFileSync(id, "utf8");
    if (!isBoundary && !id.includes("/node_modules/")) sources.add(path.relative(root, id));
    if (id.endsWith(".css")) {
      const suffix = createHash("sha256").update(path.relative(root, id)).digest("hex").slice(0, 10);
      const result = postcss([localByDefault({ mode: "local" }), scope({ generateScopedName: (name: string) => `xi_${suffix}_${name}` })])
        .process(source, { from: id }).sync();
      const exported: Record<string, string> = {};
      result.root.walkRules(":export", (rule: { walkDecls(fn: (decl: { prop: string; value: string }) => void): void; remove(): void }) => {
        rule.walkDecls(decl => { exported[decl.prop] = decl.value; }); rule.remove();
      });
      assert.ok(Object.keys(exported).length, `CSS Module has no exported classes: ${id}`);
      css.push(result.root.toString());
      compiledModule.source = `module.exports=${JSON.stringify(exported)};`; return;
    }
    if (id.endsWith(".json")) { compiledModule.source = `module.exports=${JSON.stringify(JSON.parse(source))};`; return; }
    if (/\.tsx?$/.test(id)) source = transpileFixtureModule(source, id);
    compiledModule.source = source;
    const ast = ts.createSourceFile(id, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
        assert.equal(node.arguments.length, 1); assert.ok(ts.isStringLiteral(node.arguments[0]), `Dynamic require refused: ${id}`);
        const name = node.arguments[0].text, child = resolve(name, isBoundary ? path.join(root, "fixture.js") : id);
        compiledModule.imports[name] = child; add(child);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  const entry = path.join(root, "app/fantasy/FantasyGameweekClient.tsx");
  const react = require.resolve("react"), client = require.resolve("react-dom/client"), dom = require.resolve("react-dom");
  for (const id of [entry, react, client, dom]) add(id);
  for (const required of ["app/fantasy/FantasyGameweekClient.tsx", "app/fantasy/fantasy.module.css",
    "lib/touchlineFantasy/domain.ts", "components/touchline/fantasy/TouchlineGameweekCard.tsx",
    "components/touchline/cards/TouchlineCardZoom.tsx", "components/touchline/cards/TouchlineEliteExactCard.tsx",
    "components/touchline/pitch/TouchlinePitchSurface.tsx"]) assert.ok(sources.has(required), required);
  const definitions = [...modules].map(([id, mod]) => `${JSON.stringify(id)}:[function(module,exports,require){${mod.source}\n},${JSON.stringify(mod.imports)}]`).join(",");
  return { sources: [...sources].sort(), css: css.join("\n"), script: `
    const process={env:{NODE_ENV:'development'}};const modules={${definitions}},cache={};
    function load(id){if(cache[id])return cache[id].exports;const definition=modules[id];if(!definition)throw Error('Missing bundled module');const module={exports:{}};cache[id]=module;definition[0](module,module.exports,name=>{if(!Object.hasOwn(definition[1],name))throw Error('Unmapped import '+name);return load(definition[1][name]);});return module.exports;}
    window.fixtureMountPhase='module-load';
    const React=load(${JSON.stringify(react)}),root=load(${JSON.stringify(client)}).createRoot(document.getElementById('root'));
    const flushSync=load(${JSON.stringify(dom)}).flushSync,Fantasy=load(${JSON.stringify(entry)}).default;
    window.fixtureScrolls=[];const nativeScroll=Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView=function(options){window.fixtureScrolls.push({id:this.id,behavior:options?.behavior});return nativeScroll.call(this,options);};
    window.unmountFixture=()=>flushSync(()=>root.unmount());
    window.fixtureMountPhase='render-start';
    flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Fantasy,window.fixtureProps))));
    window.fixtureMountPhase='render-returned';
  ` };
}

type Mode = { locale: "en-GB" | "pt-BR"; touch: boolean; reduced: boolean };
const modes: Mode[] = [{ locale: "en-GB", touch: false, reduced: false }, { locale: "pt-BR", touch: true, reduced: true }];
type SaveRequest = { gameweekId: string; selectedCoachId: string; formationCode: string; selections: Array<{ playerId: string; slotId: string }>; action: string; idempotencyKey: string };
async function openFixture(browser: Browser, bundle: Bundle, mode: Mode, options: { locked?: boolean; divergent?: boolean } = {}) {
  const snapshot = fixtureSnapshot(options.locked), initialSelections = JSON.stringify(snapshot.selections);
  const context = await browser.newContext({ viewport: mode.touch ? { width: 844, height: 390 } : { width: 1280, height: 900 },
    hasTouch: mode.touch, reducedMotion: mode.reduced ? "reduce" : "no-preference", serviceWorkers: "block" });
  let page: Page | undefined;
  const errors: string[] = [], consoleErrors: string[] = [], unexpected: string[] = [];
  let pageErrorCount = 0, consoleErrorCount = 0;
  const capture = (messages: string[], message: string) => { if (messages.length < 6) messages.push(message.slice(0, 1_000)); };
  const heldSaves = new Set<() => void>();
  try {
    page = await context.newPage(); page.setDefaultTimeout(5_000); page.setDefaultNavigationTimeout(10_000);
    const mountedPage = page;
    const writes: SaveRequest[] = [];
    page.on("pageerror", error => { pageErrorCount++; capture(errors, error.stack ?? error.message); });
    page.on("console", message => { if (message.type() === "error") { consoleErrorCount++; capture(consoleErrors, message.text()); } });
    let releaseSave: (() => void) | undefined, committed: SaveRequest | undefined, readsAfterSave = 0;
    const publicRoot = realpathSync(path.join(root, "public"));
    const props = { initialSnapshot: snapshot, locale: mode.locale, embedded: true, marketPage: true, initialPlayerClubTeamId: club.teamId };
    const safeScript = (value: string) => value.replace(/<\/script/gi, "<\\/script");
    const html = `<!doctype html><html lang="${mode.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      *{box-sizing:border-box}body{margin:0;background:#020907;color:#f8fafc;font-family:Arial,sans-serif}button,input,select{font:inherit}#root{max-width:1440px;margin:auto;padding:16px}
      ${bundle.css}</style></head><body><div id="root"></div><script>window.fixtureMountPhase='script-start';window.fixtureProps=${safeScript(JSON.stringify(props))};</script><script>${safeScript(bundle.script)}</script></body></html>`;
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      if (url.origin !== origin) { unexpected.push(`${method} external:${url.hostname}`); await route.abort("blockedbyclient"); return; }
      if (url.pathname === "/fixture" && method === "GET") { await route.fulfill({ contentType: "text/html", body: html }); return; }
      if (url.pathname === "/api/touchline-fantasy/lineup" && method === "POST") {
        const body = request.postDataJSON() as SaveRequest; writes.push(body);
        await new Promise<void>(resolve => {
          const release = () => { heldSaves.delete(release); resolve(); };
          heldSaves.add(release); releaseSave = release;
        });
        committed = body;
        await route.fulfill({ json: { ok: true } }).catch(() => {}); return;
      }
      if (url.pathname === "/api/touchline-fantasy/state" && method === "GET") {
        if (committed) readsAfterSave++;
        await route.fulfill({ json: { ok: true, ...snapshot, ...(committed && !options.divergent ? {
          selections: committed.selections, userGameweek: { ...snapshot.userGameweek, selectedCoachId: committed.selectedCoachId,
            formationCode: committed.formationCode, state: committed.action === "confirm" ? "CONFIRMED" : "DRAFT" },
        } : {}) } }); return;
      }
      // Real read-only hooks remain mounted; no award/ranking authority is fabricated.
      if (method === "GET" && ["/api/touchline-awards/golden-boot", "/api/touchline-arena/card-ranking/active"].includes(url.pathname)) {
        await route.fulfill({ status: 503, json: { ok: false } }); return;
      }
      if (method === "GET" && /\.(?:png|webp|svg|jpg|jpeg|woff2?|json)$/i.test(url.pathname)) {
        const file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
        if (file.startsWith(`${publicRoot}${path.sep}`) && existsSync(file) && statSync(file).isFile() && realpathSync(file).startsWith(`${publicRoot}${path.sep}`)) {
          const contentType = ({ ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff": "font/woff", ".woff2": "font/woff2", ".json": "application/json" } as Record<string, string>)[path.extname(file).toLowerCase()];
          await route.fulfill({ contentType, body: readFileSync(file) }); return;
        }
      }
      unexpected.push(`${method} ${url.pathname}`); await route.abort("blockedbyclient");
    });
    const original = snapshot.catalogue[geometry.slots.indexOf(targetSlot)];
    const removeName = `${mode.locale === "pt-BR" ? "Retirar do XI" : "Remove from XI"}: ${original.name} · ${targetSlot.id}`;
    const pitch = page.locator("#my-club-xi-pitch"), list = page.locator("#my-club-player-selection");
    const confirm = page.getByRole("button", { name: mode.locale === "pt-BR" ? "Confirmar XI" : "Confirm XI", exact: true });
    await page.goto(`${origin}/fixture`, { waitUntil: "load" });
    await expect(pitch).toBeVisible();
    await expect(pitch.locator("[data-touchline-pitch-surface]")).toHaveCount(1);
    return { page, snapshot, writes, errors, unexpected, pitch, list, confirm, removeName,
      get readsAfterSave() { return readsAfterSave; },
      release() { assert.ok(releaseSave, "POST receipt must be held"); releaseSave(); releaseSave = undefined; },
      async assertClean() { assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); assert.equal(JSON.stringify(snapshot.selections), initialSelections); },
      async close() { for (const release of heldSaves) release(); await mountedPage.evaluate("window.unmountFixture()").catch(() => {}); await context.close(); },
    };
  } catch (error) {
    // This page contains only synthetic fixture data and blocked/intercepted HTTP.
    // Capture bounded evidence BEFORE closing the context; never dump the bundle,
    // full HTML, console arguments, cookies, headers or browser storage.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dom: unknown = { unavailable: true };
    try {
      if (page && !page.isClosed()) dom = await Promise.race([
        page.evaluate(() => ({
          readyState: document.readyState,
          phase: String((window as Window & { fixtureMountPhase?: string }).fixtureMountPhase ?? "not-started").slice(0, 80),
          rootChildren: document.getElementById("root")?.childElementCount ?? null,
          pitchCount: document.querySelectorAll("#my-club-xi-pitch").length,
          pitchRect: (() => { const rect = document.getElementById("my-club-xi-pitch")?.getBoundingClientRect(); return rect ? { width: rect.width, height: rect.height } : null; })(),
          text: (document.getElementById("root")?.innerText ?? document.body?.innerText ?? "").slice(0, 2_000),
        })).catch(() => ({ unavailable: true })),
        new Promise(resolve => { timer = setTimeout(() => resolve({ timedOut: true }), 1_000); }),
      ]);
    } finally {
      clearTimeout(timer);
      for (const release of heldSaves) release();
      await context.close();
    }
    throw new Error(`XI_FIXTURE_MOUNT_FAILED ${JSON.stringify({
      engine: browser.browserType().name(), mode, locked: Boolean(options.locked), divergent: Boolean(options.divergent),
      failure: (error instanceof Error ? error.message : String(error)).slice(0, 1_500),
      pageErrorCount, pageErrors: errors, consoleErrorCount, consoleErrors,
      unexpected: unexpected.slice(0, 8).map(value => value.slice(0, 200)), dom,
    })}`);
  }
}

async function activate(locator: Locator, mode: Mode) {
  if (mode.touch) await locator.tap();
  else { await locator.focus(); await expect(locator).toBeFocused(); await locator.press("Enter"); }
}

async function recordKeyboardProbe(page: Page, key: "Tab" | "Alt+Tab", expected?: Locator) {
  const before = await page.evaluate(() => {
    const describe = (node: EventTarget | null) => node instanceof HTMLElement ? {
      tag: node.tagName, id: node.id.slice(0, 100), text: (node.textContent ?? "").trim().slice(0, 120),
      tabIndex: node.tabIndex, disabled: "disabled" in node ? Boolean(node.disabled) : false,
    } : null;
    // Read defaultPrevented after dispatch has finished, not in a capture-phase
    // microtask that might run before the product's delegated event listeners.
    const records: Array<() => object> = [];
    const listener = (event: Event) => {
      if (records.length >= 12) return;
      const target = describe(event.target);
      records.push(() => ({ type: event.type, target, defaultPrevented: event.defaultPrevented,
        key: event instanceof KeyboardEvent ? event.key : null,
        altKey: event instanceof KeyboardEvent ? event.altKey : null }));
    };
    const events = ["keydown", "keyup", "focusin"];
    for (const event of events) window.addEventListener(event, listener, true);
    const host = window as Window & { fixtureKeyboardProbe?: { read: () => object; stop: () => void } };
    host.fixtureKeyboardProbe = {
      read: () => ({ activeElement: describe(document.activeElement), documentFocused: document.hasFocus(), events: records.map(read => read()) }),
      stop: () => { for (const event of events) window.removeEventListener(event, listener, true); delete host.fixtureKeyboardProbe; },
    };
    return { activeElement: describe(document.activeElement), documentFocused: document.hasFocus() };
  });
  let failure: unknown;
  try {
    await page.keyboard.press(key);
    if (expected) await expect(expected).toBeFocused();
  } catch (error) { failure = error; }
  const after = await page.evaluate(() => {
    const probe = (window as Window & { fixtureKeyboardProbe?: { read: () => object; stop: () => void } }).fixtureKeyboardProbe;
    try { return probe?.read() ?? { unavailable: true }; } finally { probe?.stop(); }
  }).catch(error => { failure ??= error; return { unavailable: true }; });
  return { evidence: { key, before, after }, failure };
}

type KeyboardKey = "Tab" | "Alt+Tab";
type KeyboardObservation = {
  documentFocused: boolean;
  activeElement: { tag: string; id: string } | null;
  events: Array<{ type: string; key: string | null; defaultPrevented: boolean }>;
};
type NativeObservation = { key: KeyboardKey; beforeFocused: boolean; after: KeyboardObservation };
function assertKeyboardObservation(observation: NativeObservation) {
  assert.equal(observation.beforeFocused, true, "Document must be focused before keyboard navigation");
  assert.equal(observation.after.documentFocused, true, "Document lost focus during keyboard navigation");
  assert.ok(Array.isArray(observation.after.events), "Keyboard event evidence missing");
  assert.ok(observation.after.events.some(event => event.type === "keydown" && event.key === "Tab"), "Tab keydown missing");
  assert.ok(observation.after.events.some(event => event.type === "keyup" && event.key === "Tab"), "Tab keyup missing");
  assert.ok(observation.after.events.every(event => event.defaultPrevented === false), "Keyboard navigation was cancelled");
}
function checkedKeyboardProbe(probe: Awaited<ReturnType<typeof recordKeyboardProbe>>): NativeObservation {
  if (probe.failure) throw probe.failure;
  const after = probe.evidence.after as KeyboardObservation;
  const observation = { key: probe.evidence.key, beforeFocused: probe.evidence.before.documentFocused, after };
  assertKeyboardObservation(observation);
  return { ...observation, after: { ...after,
    activeElement: after.activeElement ? { tag: after.activeElement.tag, id: after.activeElement.id } : null } };
}
function selectNativeKeyboardKey(engine: string, tab: NativeObservation, alternate?: NativeObservation): KeyboardKey {
  assert.ok(engine === "chromium" || engine === "webkit", "Uncalibrated engine");
  assert.equal(tab.key, "Tab"); assertKeyboardObservation(tab);
  const target = tab.after.activeElement;
  if (target?.tag === "BUTTON" && target.id === "native-button") return "Tab";
  assert.equal(engine, "webkit", "Chromium must reach a native button using Tab");
  assert.deepEqual(target, { tag: "INPUT", id: "native-input" }, "WebKit native Tab has an unexpected target");
  assert.ok(alternate, "WebKit alternate-key control required");
  assert.equal(alternate.key, "Alt+Tab"); assertKeyboardObservation(alternate);
  assert.deepEqual(alternate.after.activeElement, { tag: "BUTTON", id: "native-button" }, "WebKit Alt+Tab must reach the native button");
  return "Alt+Tab";
}

test("native keyboard oracle is calibrated independently and fails closed; browser scope is explicit", () => {
  const observation = (key: KeyboardKey, tag: string, id: string): NativeObservation => ({ key, beforeFocused: true,
    after: { documentFocused: true, activeElement: { tag, id }, events: [
      { type: "keydown", key: "Tab", defaultPrevented: false }, { type: "keyup", key: "Tab", defaultPrevented: false },
    ] } });
  const button = observation("Tab", "BUTTON", "native-button"), input = observation("Tab", "INPUT", "native-input");
  const alternate = observation("Alt+Tab", "BUTTON", "native-button");
  assert.equal(selectNativeKeyboardKey("chromium", button), "Tab");
  assert.equal(selectNativeKeyboardKey("webkit", button), "Tab");
  assert.equal(selectNativeKeyboardKey("webkit", input, alternate), "Alt+Tab");
  assert.throws(() => selectNativeKeyboardKey("chromium", input, alternate));
  assert.throws(() => selectNativeKeyboardKey("webkit", input));
  assert.throws(() => selectNativeKeyboardKey("webkit", observation("Tab", "DIV", "keeper"), alternate));
  assert.throws(() => selectNativeKeyboardKey("webkit", input, observation("Alt+Tab", "INPUT", "native-input")));
  assert.throws(() => selectNativeKeyboardKey("webkit", { ...input, beforeFocused: false }, alternate));
  assert.throws(() => selectNativeKeyboardKey("webkit", input, { ...alternate, after: { ...alternate.after, documentFocused: false } }));
  assert.throws(() => selectNativeKeyboardKey("chromium", { ...button, after: { ...button.after, events: [] } }));
  assert.throws(() => selectNativeKeyboardKey("chromium", { ...button, after: { ...button.after,
    events: button.after.events.map(event => ({ ...event, defaultPrevented: true })) } }));
  assert.equal(parseXiScope(undefined), "full"); assert.equal(parseXiScope("full"), "full");
  assert.equal(parseXiScope("webkit-en-focus"), "webkit-en-focus");
  for (const invalid of ["", "webkit", "all", "webkit-en-focus "]) assert.throws(() => parseXiScope(invalid));
  assert.equal(parseXiKeyboardMode(undefined), "normal");
  assert.equal(parseXiKeyboardMode("0"), "normal");
  assert.equal(parseXiKeyboardMode("1"), "diagnostic");
  assert.equal(parseXiKeyboardMode("all"), "all");
  for (const invalid of ["", "true", "ALL", "all ", "unknown"]) assert.throws(() => parseXiKeyboardMode(invalid));
  for (const mode of ["normal", "diagnostic", "all"] as const) assert.doesNotThrow(() => validateXiKeyboardScope(mode, "full"));
  assert.doesNotThrow(() => validateXiKeyboardScope("normal", "webkit-en-focus"));
  for (const mode of ["diagnostic", "all"] as const) assert.throws(() => validateXiKeyboardScope(mode, "webkit-en-focus"));
});

async function calibrateNativeKeyboard(browser: Browser): Promise<KeyboardKey> {
  const control = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  try {
    const unexpected: string[] = [];
    await control.route("**/*", async route => { unexpected.push(route.request().method()); await route.abort("blockedbyclient"); });
    const page = await control.newPage(); page.setDefaultTimeout(5_000);
    await page.setContent('<!doctype html><html lang="en"><body><section id="native-start" tabindex="-1"><button id="native-button" type="button">Native button</button><input id="native-input" aria-label="Native input"></section></body></html>');
    const start = page.locator("#native-start");
    await start.focus(); await expect(start).toBeFocused();
    const tabProbe = await recordKeyboardProbe(page, "Tab");
    const tab = checkedKeyboardProbe(tabProbe);
    let alternate: NativeObservation | undefined;
    let alternateProbe: Awaited<ReturnType<typeof recordKeyboardProbe>> | undefined;
    if (browser.browserType().name() === "webkit" && tab.after.activeElement?.tag === "INPUT" && tab.after.activeElement.id === "native-input") {
      await start.focus(); await expect(start).toBeFocused();
      alternateProbe = await recordKeyboardProbe(page, "Alt+Tab");
      alternate = checkedKeyboardProbe(alternateProbe);
    }
    const key = selectNativeKeyboardKey(browser.browserType().name(), tab, alternate);
    console.log(`XI_KEYBOARD_CALIBRATION ${JSON.stringify({ engine: browser.browserType().name(), platform: process.platform,
      scope: browserScope, selectedKey: key, tab: tabProbe.evidence, alternate: alternateProbe?.evidence ?? null })}`);
    assert.deepEqual(unexpected, []);
    return key;
  } finally { await control.close(); }
}

async function assertCalibratedKeyboardReachability(page: Page, pitch: Locator, target: Locator, key: KeyboardKey) {
  // The product already focused the pitch; do not focus the target or choose a
  // fallback in response to product behavior. Calibration predates its mount.
  const plain = await recordKeyboardProbe(page, "Tab");
  console.log(`XI_KEYBOARD_REACHABILITY ${JSON.stringify({ phase: "plain-Tab", selectedKey: key, scope: browserScope, evidence: plain.evidence })}`);
  checkedKeyboardProbe(plain);
  if (key === "Alt+Tab") {
    // Reset only the same section for the independently predetermined key.
    await pitch.focus(); await expect(pitch).toBeFocused();
    const selected = await recordKeyboardProbe(page, key, target);
    console.log(`XI_KEYBOARD_REACHABILITY ${JSON.stringify({ phase: "calibrated-key", selectedKey: key, scope: browserScope, evidence: selected.evidence })}`);
    checkedKeyboardProbe(selected);
  }
  await expect(target).toBeVisible(); await expect(target).toBeEnabled(); await expect(target).toBeFocused();
}

async function diagnoseRealTab(page: Page, pitch: Locator, target: Locator, selectedKey: KeyboardKey) {
  // Selection comes exclusively from the native control before product mount.
  // Retain both raw observations; never choose a fallback from product behavior.
  const tab = await recordKeyboardProbe(page, "Tab", selectedKey === "Tab" ? target : undefined);
  const targetFocusedAfterTab = await target.evaluate(node => document.activeElement === node);
  const targetState = await target.evaluate(node => {
    const button = node as HTMLButtonElement, rect = button.getBoundingClientRect(), style = getComputedStyle(button);
    return { tag: button.tagName, text: (button.textContent ?? "").slice(0, 120), tabIndex: button.tabIndex,
      disabled: button.disabled, inertAncestor: Boolean(button.closest("[inert]")),
      display: style.display, visibility: style.visibility, width: rect.width, height: rect.height };
  }).catch(() => ({ unavailable: true }));
  let alternate: unknown = { unavailable: true };
  let alternateProbe: Awaited<ReturnType<typeof recordKeyboardProbe>> | undefined;
  let alternateFailure: unknown;
  try {
    // Reset ONLY the starting section for the paired probe. Never focus the
    // target button, change tabindex, intercept Tab, or alter engine preferences.
    await pitch.focus(); await expect(pitch).toBeFocused();
    const probe = await recordKeyboardProbe(page, "Alt+Tab", selectedKey === "Alt+Tab" ? target : undefined);
    alternateProbe = probe;
    alternate = { ...probe.evidence, keyOrCollectionFailed: Boolean(probe.failure) };
  } catch (error) { alternateFailure = error; alternate = { unavailable: true }; }
  console.log(`XI_KEYBOARD_DIAGNOSTIC ${JSON.stringify({ surface: "real-xi", target: targetState, tab: tab.evidence,
    alternate, selectedKey, originalTabAssertion: targetFocusedAfterTab ? "passed" : "failed" })}`);
  checkedKeyboardProbe(tab);
  if (alternateFailure) throw alternateFailure;
  assert.ok(alternateProbe, "Paired alternate probe must be collected");
  checkedKeyboardProbe(alternateProbe);
  await expect(target).toBeVisible(); await expect(target).toBeEnabled();
}

async function replacePlayer(fixture: Awaited<ReturnType<typeof openFixture>>, mode: Mode, keyboardDiagnostic = false, keyboardKey?: KeyboardKey) {
  const { page, pitch, list } = fixture;
  await activate(page.getByRole("button", { name: fixture.removeName, exact: true }), mode);
  await expect(pitch.locator("header strong")).toHaveText("10/11");
  await expect(list).toBeFocused();
  await expect(list).toContainText(`${mode.locale === "pt-BR" ? "Vaga do XI" : "XI slot"}: ${targetSlot.id}`);
  const results = page.locator("#my-club-position-results");
  await expect(results.locator("article")).toHaveCount(4);
  assert.deepEqual(await results.locator("article > div > strong").allTextContents(), ["Synthetic RW Player", "Synthetic ST Player", "Synthetic LW Player", "Synthetic Replacement"]);
  await expect(results).not.toContainText("Synthetic GK Player");
  const replacement = results.locator("article").filter({ has: page.locator("strong", { hasText: /^Synthetic Replacement$/ }) });
  await expect(replacement).toHaveCount(1);
  await activate(replacement.getByRole("button", { name: `${mode.locale === "pt-BR" ? "Escolher" : "Choose"} · ${targetSlot.id}`, exact: true }), mode);
  await expect(pitch.locator("header strong")).toHaveText("11/11");
  await expect(pitch).toBeFocused();
  await expect(page.getByRole("button", { name: `${mode.locale === "pt-BR" ? "Retirar do XI" : "Remove from XI"}: Synthetic Replacement · ${targetSlot.id}`, exact: true })).toHaveCount(1);
  await expect.poll(() => pitch.evaluate(node => { const box = node.getBoundingClientRect(); return box.top < innerHeight && box.bottom > 0; })).toBe(true);
  const scrolls = await page.evaluate("window.fixtureScrolls") as Array<{ id: string; behavior: string }>;
  assert.deepEqual(scrolls.slice(-2), ["my-club-player-selection", "my-club-xi-pitch"].map(id => ({ id, behavior: mode.reduced ? "instant" : "smooth" })));
  if (!mode.touch) {
    const target = pitch.getByRole("button", { name: "View cards", exact: true });
    if (keyboardDiagnostic) {
      assert.ok(keyboardKey, "Native keyboard calibration must precede the diagnostic product scenario");
      await diagnoseRealTab(page, pitch, target, keyboardKey);
    }
    else {
      assert.ok(keyboardKey, "Native keyboard calibration must precede the product scenario");
      await assertCalibratedKeyboardReachability(page, pitch, target, keyboardKey);
    }
  }
  assert.equal(fixture.writes.length, 0, "local XI changes never save automatically");
}

test("diagnostic: WebKit EN native and real XI keyboard navigation", { skip: !enabled || keyboardMode === "normal", timeout: 45_000 }, async () => {
  const browser = await webkit.launch({ headless: true, timeout: 15_000 });
  try {
    let selectedKey: KeyboardKey;
    const control = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    try {
      // No server, URL fetch, app bundle, CSS or event handlers in the control.
      // Routing still blocks every request if the supposedly static page tries one.
      const unexpected: string[] = [];
      await control.route("**/*", async route => { unexpected.push(route.request().method()); await route.abort("blockedbyclient"); });
      const page = await control.newPage(); page.setDefaultTimeout(5_000);
      await page.setContent('<!doctype html><html lang="en"><body><section id="native-start" tabindex="-1"><button id="native-button" type="button">Native button</button><input id="native-input" aria-label="Native input"></section></body></html>');
      const start = page.locator("#native-start");
      const evidence = [];
      const observations: NativeObservation[] = [];
      for (const key of ["Tab", "Alt+Tab"] as const) {
        await start.focus(); await expect(start).toBeFocused();
        const probe = await recordKeyboardProbe(page, key);
        if (probe.failure) throw probe.failure;
        evidence.push(probe.evidence);
        observations.push(checkedKeyboardProbe(probe));
      }
      selectedKey = selectNativeKeyboardKey("webkit", observations[0], observations[1]);
      console.log(`XI_KEYBOARD_DIAGNOSTIC ${JSON.stringify({ surface: "native-control", engine: "webkit", platform: process.platform, selectedKey, evidence })}`);
      assert.deepEqual(unexpected, []);
    } finally { await control.close(); }
    const h = await openFixture(browser, bundleProduct(), modes[0]);
    try { await replacePlayer(h, modes[0], true, selectedKey); await h.assertClean(); }
    finally { await h.close(); }
  } finally { await browser.close(); }
});

test("real My Club XI DOM: replace, focus, explicit save and readback", { skip: !enabled || keyboardMode === "diagnostic", timeout: 180_000 }, async t => {
  const bundle = bundleProduct();
  let mountFailure: unknown;
  async function open(browser: Browser, mode: Mode, options: { locked?: boolean; divergent?: boolean } = {}) {
    try { return await openFixture(browser, bundle, mode, options); }
    catch (error) { mountFailure = error; throw error; }
  }
  async function scenario(name: string, options: { timeout: number }, run: () => Promise<void>) {
    await t.test(name, options, run);
    // node:test does not reject this await when a child test fails. Abort the
    // parent explicitly after a broken mount, so the same shared precondition
    // is not retried through all 14 scenarios/engines or reported as coverage.
    if (mountFailure) throw mountFailure;
  }
  const focusOnly = browserScope === "webkit-en-focus";
  console.log(`XI_BROWSER_SCOPE ${JSON.stringify({ scope: browserScope, productScenarios: focusOnly ? 2 : 14 })}`);
  for (const engine of focusOnly ? [webkit] : [chromium, webkit]) {
    const browser = await engine.launch({ headless: true, timeout: 15_000 });
    try {
      const keyboardKey = await calibrateNativeKeyboard(browser);
      for (const mode of focusOnly ? [modes[0]] : modes) {
        const prefix = `${engine.name()}/${mode.locale}/${mode.touch ? "touch-reduced" : "keyboard"}`;
        await scenario(`${prefix}: X → eligible slot → replacement → focus → one held save → matching readback`, { timeout: 30_000 }, async () => {
          const h = await open(browser, mode);
          try {
            await replacePlayer(h, mode, false, keyboardKey);
            await activate(h.confirm, mode);
            await expect.poll(() => h.writes.length).toBe(1);
            await expect(h.confirm).toBeDisabled();
            const removeButtons = h.pitch.locator('button[aria-label^="Remove from XI:"],button[aria-label^="Retirar do XI:"]');
            assert.equal(await removeButtons.count(), 11);
            for (const button of await removeButtons.all()) await expect(button).toBeDisabled();
            assert.equal(h.readsAfterSave, 0, "no verification before the POST receipt");
            const sent = h.writes[0];
            assert.deepEqual(Object.keys(sent).sort(), ["action", "formationCode", "gameweekId", "idempotencyKey", "selectedCoachId", "selections"]);
            assert.equal(sent.action, "confirm"); assert.equal(sent.gameweekId, h.snapshot.activeGameweek!.id);
            assert.equal(sent.selectedCoachId, "xi-coach"); assert.equal(sent.formationCode, "4-3-3");
            assert.match(sent.idempotencyKey, /^fantasy:confirm:[0-9a-f-]{36}$/);
            const expected = h.snapshot.selections.map(selection => selection.slotId === targetSlot.id ? { ...selection, playerId: "xi-replacement" } : selection);
            assert.deepEqual(sent.selections.toSorted((a, b) => a.slotId.localeCompare(b.slotId)), expected.toSorted((a, b) => a.slotId.localeCompare(b.slotId)));
            h.release();
            await expect(h.page.getByRole("status").filter({ hasText: mode.locale === "pt-BR" ? "XI confirmado, gravado e verificado no TouchLine." : "XI confirmed, persisted and verified in TouchLine." }).first()).toBeVisible();
            assert.equal(h.readsAfterSave, 1); assert.equal(h.writes.length, 1); await expect(h.confirm).toBeDisabled();
            await h.assertClean();
          } finally { await h.close(); }
        });
        // Do not even register the other 12 previously passing scenarios in
        // this bounded retry. The default full matrix remains unchanged.
        if (focusOnly) continue;
        await scenario(`${prefix}: unmatched search keeps catalogue and clearing restores eligible cards`, { timeout: 20_000 }, async () => {
          const h = await open(browser, mode);
          try {
            await activate(h.page.getByRole("button", { name: h.removeName, exact: true }), mode);
            const search = h.page.getByRole("textbox", { name: mode.locale === "pt-BR" ? "Pesquisar jogador" : "Search player" });
            await search.fill("not-a-fixture-player");
            await expect(h.page.locator("#my-club-position-results article")).toHaveCount(0);
            await expect(h.list).toContainText(mode.locale === "pt-BR" ? "Cards nesta posição: 0" : "Cards in this position: 0");
            await expect(h.list).toContainText(mode.locale === "pt-BR" ? "Nenhum card corresponde a esta seleção ou busca." : "No cards match this selection or search.");
            await expect(h.confirm).toBeDisabled();
            await search.fill(""); await expect(h.page.locator("#my-club-position-results article")).toHaveCount(4);
            await expect(h.pitch.locator("header strong")).toHaveText("10/11"); assert.equal(h.writes.length, 0); await h.assertClean();
          } finally { await h.close(); }
        });
        await scenario(`${prefix}: locked XI has no remove or select mutation`, { timeout: 20_000 }, async () => {
          const h = await open(browser, mode, { locked: true });
          try {
            await expect(h.pitch.locator("header strong")).toHaveText("11/11");
            await expect(h.page.getByRole("button", { name: h.removeName, exact: true })).toHaveCount(0);
            await expect(h.confirm).toBeDisabled();
            await expect(h.page.locator("#my-club-position-results article > div > button")).toHaveCount(0);
            assert.equal(h.writes.length, 0); await h.assertClean();
          } finally { await h.close(); }
        });
      }
      await scenario(`${engine.name()}: divergent readback never claims the XI was saved`, { timeout: 25_000 }, async () => {
        const mode = modes[0], h = await open(browser, mode, { divergent: true });
        try {
          await replacePlayer(h, mode, false, keyboardKey); await activate(h.confirm, mode);
          await expect.poll(() => h.writes.length).toBe(1); h.release();
          await expect(h.page.getByRole("status").filter({ hasText: "The server received the save, but verification has not returned yet." }).first()).toBeVisible();
          assert.equal(h.readsAfterSave, 3); assert.equal(h.writes.length, 1);
          await expect(h.page.getByText("XI confirmed, persisted and verified in TouchLine.", { exact: true })).toHaveCount(0);
          await expect(h.pitch.locator("header strong")).toHaveText("11/11"); await h.assertClean();
        } finally { await h.close(); }
      });
    } finally { await browser.close(); }
  }
});
