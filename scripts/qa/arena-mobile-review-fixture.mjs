import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "../..");
const native = createRequire(import.meta.url);
const postcss = createRequire(native.resolve("next"))("postcss");

export const ARENA_REVIEW_ASSET_PATHS = Object.freeze([
  "/touchlineArena/brand/tl-shield-lime.svg",
  "/touchlineArena/shared/country-flags-4x3/gb-eng.svg",
  "/touchlineArena/shared/club-logos/2026-27/live-160/arsenal.webp",
  "/touchlineArena/cards/leadership/touchline-player-leader-crown.png",
  "/touchlineArena/cards/templates/live-compact/clubs/Arsenal FC/market-tiers/radiant-gold.webp",
  "/touchlineArena/cards/templates/zoom/clubs/Arsenal FC/market-tiers/radiant-gold.webp",
  "/touchlineArena/cards/templates/live-compact/clubs/Manchester City/market-tiers/diamond-gold.webp",
  "/touchlineArena/cards/templates/zoom/clubs/Manchester City/market-tiers/diamond-gold.webp",
  "/touchlineArena/cards/templates/zoom/coaches/07_golddiamond_coach.webp",
]);

// Layout review only: real CSS, pitch, player/coach art, geometry and extracted
// toolbar JSX. Authentication, collection persistence, the real Arena entry
// component and provider publication are intentionally not reproduced here.
export function createArenaMobileReviewHtml({ baseUrl = "http://127.0.0.1:3348/", locale = "pt-BR" } = {}) {
  const base = new URL(baseUrl);
  assert.ok(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "review assets must remain loopback-only");
  const safeLocale = ["pt-BR", "en-GB", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"].includes(locale) ? locale : "en-GB";
  const modules = {};
  let css = readFileSync(resolve(root, "app/globals.css"), "utf8").match(/:root\s*\{[\s\S]*?\}/)?.[0] ?? "";
  for (const [id, file] of [["react", "react.development.js"], ["react/jsx-runtime", "react-jsx-runtime.development.js"], ["react-dom", "react-dom.development.js"], ["react-dom/client", "react-dom-client.development.js"], ["scheduler", "scheduler.development.js"]]) {
    const pkg = id.startsWith("react-dom") ? "react-dom" : id.startsWith("react") ? "react" : "scheduler";
    const lookup = pkg === "scheduler" ? createRequire(native.resolve("react-dom/client")) : native;
    modules[id] = readFileSync(join(dirname(lookup.resolve(pkg)), "cjs", file), "utf8");
  }
  modules["lucide-react"] = readFileSync(native.resolve("lucide-react"), "utf8");
  modules["next/navigation"] = 'exports.usePathname=()=>"/isolated-arena-review";';
  const stubs = {
    "components/touchline/cards/TouchlineCardLeadershipProvider.tsx": "exports.useTouchlineCardLeadershipAuthority=()=>null;",
    "lib/touchlineArena/card-ranking-client.ts": "exports.useTouchlineActiveRanking=()=>null;",
    "lib/touchlineArena/golden-boot-client.ts": "exports.useTouchlineGoldenBootPlayers=()=>[];",
  };
  for (const [file, code] of Object.entries(stubs)) modules[resolve(root, file)] = code;
  function add(file) {
    if (Object.hasOwn(modules, file)) return file;
    if (file.endsWith(".json")) { modules[file] = `exports.default=${readFileSync(file, "utf8")};`; return file; }
    if (file.endsWith(".css")) {
      const prefix = `arena${Object.keys(modules).length}_`;
      const sheet = postcss.parse(readFileSync(file, "utf8"));
      sheet.walkRules(rule => {
        const globals = [];
        rule.selector = rule.selector.replace(/:global\(([^)]+)\)/g, (_, value) => `ARENA_GLOBAL_${globals.push(value) - 1}`)
          .replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => `.${prefix}${name}`)
          .replace(/ARENA_GLOBAL_(\d+)/g, (_, index) => globals[Number(index)]);
      });
      css += sheet.toString();
      modules[file] = `exports.default=new Proxy({},{get:(_,key)=>${JSON.stringify(prefix)}+String(key)});`;
      return file;
    }
    modules[file] = "";
    const tree = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const ordered = ts.factory.updateSourceFile(tree, [...tree.statements.filter(ts.isImportDeclaration), ...tree.statements.filter(node => !ts.isImportDeclaration(node))]);
    let output = ts.transpileModule(ts.createPrinter().printFile(ordered), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    output = output.replace(/require\("([^"]+)"\)/g, (whole, id) => {
      if (Object.hasOwn(modules, id)) return whole;
      assert.ok(id.startsWith(".") || id.startsWith("@/"), `Unsupported isolated dependency: ${id}`);
      const candidate = id.startsWith("@/") ? resolve(root, id.slice(2)) : resolve(dirname(file), id);
      const found = [candidate, `${candidate}.ts`, `${candidate}.tsx`].find(existsSync);
      assert.ok(found, `missing fixture dependency: ${candidate}`);
      return `require(${JSON.stringify(add(found))})`;
    });
    modules[file] = output;
    return file;
  }
  const addLocal = path => add(resolve(root, path));
  const ids = {
    styles: addLocal("app/fantasy/fantasy.module.css"),
    pitch: addLocal("components/touchline/pitch/TouchlinePitchSurface.tsx"),
    card: addLocal("components/touchline/fantasy/TouchlineGameweekCard.tsx"),
    coach: addLocal("components/touchline/cards/TouchlineCoachCard.tsx"),
    coachSlot: addLocal("lib/touchlineArena/coach-card.ts"),
    coachLayout: addLocal("lib/touchlineArena/coach-card-layout.ts"),
    geometry: addLocal("lib/touchlineArena/formation-geometry.ts"),
    sizes: addLocal("lib/touchlineFantasy/market-browser.ts"),
    copy: addLocal("lib/touchlineFantasy/market-workflow-i18n.ts"),
    metrics: addLocal("lib/touchlineFantasy/market-metrics-i18n.ts"),
  };
  const client = ts.createSourceFile("client.tsx", readFileSync(resolve(root, "app/fantasy/FantasyGameweekClient.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let toolbar;
  const position = client.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "horizontalMyClubPitchPosition");
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(client) === "data-arena-toolbar")) toolbar = node.getText(client);
    ts.forEachChild(node, visit);
  }
  visit(client);
  assert.ok(toolbar && position, "real Arena toolbar/geometry source changed; review fixture extraction");
  const app = `
    const React=require('react'),styles=require(${JSON.stringify(ids.styles)}).default;
    const TouchlinePitchSurface=require(${JSON.stringify(ids.pitch)}).default,Card=require(${JSON.stringify(ids.card)}).default,Coach=require(${JSON.stringify(ids.coach)}).default;
    const geometryModule=require(${JSON.stringify(ids.geometry)}),sizeCard=require(${JSON.stringify(ids.sizes)}).touchlineFantasyPitchCardWidth;
    const locale=${JSON.stringify(safeLocale)},draftLocalesEnabled=true,workflowCopy=require(${JSON.stringify(ids.copy)}).getTouchlineFantasyMarketWorkflowCopy(locale,true),marketMetricsCopy=require(${JSON.stringify(ids.metrics)}).getTouchlineFantasyMarketMetricsCopy(locale,true);
    const layout=require(${JSON.stringify(ids.coachLayout)}).TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT;
    const fakeCoach={id:'fixture-coach',providerId:'fixture-coach',provider:'sportmonks',name:'Fixture Coach',displayName:'Fixture Coach',teamId:'fixture',source:{provider:'sportmonks',providerId:'fixture-coach',raw:{fixture:true}}};
    const coachSlot=require(${JSON.stringify(ids.coachSlot)}).createTouchlineArenaCoachSlot(fakeCoach,1);
    const selectedCoach={coach:fakeCoach};
    // Extracted toolbar receives no real contract action in this layout-only fixture.
    const coachReleaseAction=null;
    const live=null,snapshot={gameweekScore:0};
    const resolveTouchlineCatalogueLocale=()=>locale;
    function FantasyCoachZoom({releaseAction=null}){if(releaseAction!==null)throw new Error('Isolated Arena cannot expose contract actions');return <Coach coach={fakeCoach} slot={coachSlot} clubName="Arsenal FC" clubLogoUrl="/touchlineArena/shared/club-logos/2026-27/live-160/arsenal.webp" countryCode3="ENG" locale={locale} draftLocalesEnabled layoutOverride={layout} showLeadershipCrown assetLoading="eager" frameLoading="eager" enableInteractiveNeon={false}/>;}
    ${position.getText(client)}
    function App(){
      const [arenaOpen,setArenaOpen]=React.useState(true),[formation,setFormation]=React.useState('4-3-3'),[pitchCardWidth,setWidth]=React.useState(48),ref=React.useRef(null);
      const geometry=geometryModule.resolveTouchlineFormationGeometry(formation);
      React.useLayoutEffect(()=>{if(!arenaOpen||!ref.current)return;const el=ref.current;const fit=()=>setWidth(sizeCard(geometry.slots,el.offsetWidth,el.offsetHeight,{labelHeight:18,gap:6}));fit();const observer=new ResizeObserver(fit);observer.observe(el);return()=>observer.disconnect();},[arenaOpen,formation]);
      const formationPicker=<details className={styles.formationPicker}><summary>{workflowCopy.chooseFormation ?? 'Formação'} <strong>{formation}</strong></summary><div className={styles.formationSelectionPanel}><div className={styles.formationCoachPreview}><FantasyCoachZoom/></div><div className={styles.formationChoices}>{geometryModule.TOUCHLINE_CALIBRATED_FORMATION_CODES.map(code=><button key={code} type="button" aria-pressed={formation===code} onClick={()=>setFormation(code)}>{code}</button>)}</div></div></details>;
      if(!arenaOpen)return <main><p>Prévia isolada: fechamento e reabertura, sem elenco real.</p><button id="review-open-arena" onClick={()=>setArenaOpen(true)}>Abrir Arena</button></main>;
      return <div className={styles.myClubCommand+' '+styles.arenaOverlay} data-fantasy-context="market" data-review-fixture="isolated-layout"><section className={styles.myClubSquad}><div className={styles.arenaBody}><div className={styles.myClubPitchViewport}>
        <p data-review-notice="true">PRÉVIA DE LAYOUT · dados fictícios · não valida conta, reservas ou sincronização</p>
        ${toolbar}
        <div ref={ref} className="review-field-measure"><TouchlinePitchSurface className={styles.myClubTacticalPitch} ariaLabel="Campo fictício de revisão" orientation="horizontal" surfaceVariant="smoked-glass">{geometry.slots.map((slot,index)=>{const card={id:'fixture-'+index,canonicalPlayerId:'fixture-'+index,name:'Fixture '+slot.id,shortName:slot.id,clubName:'Arsenal FC',role:slot.role,position:slot.allowedPositions[0],shirtNumber:index+1,countryCode3:'ENG',touchlinePoints:0,seasonTotalRating:0,marketValue:'',marketValueState:'verified',editorialCard:{tierKey:'radiant-gold',marketValueEur:1000000,cardPrice:{amountMinor:0,currency:'GBP'},lastReviewedAt:'2026-10-23T00:00:00Z'}};return <div key={slot.id} className={styles.myClubTacticalSlot} data-arena-slot={slot.id} style={{...horizontalMyClubPitchPosition(slot),width:Math.max(44,pitchCardWidth)}}><span style={{width:pitchCardWidth,'--touchline-card-static-scale':pitchCardWidth/430}}><Card card={card} locale={locale} draftLocalesEnabled compact displayWidth={pitchCardWidth}/></span><b>{slot.id}</b></div>;})}</TouchlinePitchSurface></div>
      </div></div></section></div>;
    }
    window.__arenaFixture={kind:'isolated-layout',realAuthentication:false,realCollection:false,realReservations:false};
    require('react-dom/client').createRoot(document.getElementById('root')).render(<App/>);
  `;
  const compiledApp = ts.transpileModule(app, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const definitions = Object.entries(modules).map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(",");
  const script = `const process={env:{NODE_ENV:'development'}},modules={${definitions}},cache={};function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}\n${compiledApp}`.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html lang="${safeLocale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><base href="${base.href}"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial;background:#030c08;color:#fff}button{cursor:pointer}.review-field-measure{width:100%;max-width:1400px;aspect-ratio:105/68}[data-review-notice]{margin:4px;font-size:11px;color:#ffd87a}${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`;
}
