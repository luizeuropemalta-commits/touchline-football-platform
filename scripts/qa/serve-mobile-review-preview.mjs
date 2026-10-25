import http from "node:http";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";

// Isolated visual harness only: real product components/styles, synthetic data,
// no credentials, no remote reads, no auth, and no application write endpoints.
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const publicRoot = realpathSync(join(root, "public"));
export const REVIEW_LOCALES = Object.freeze(["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]);
const logoPaths = Object.freeze([
  "/touchlineArena/shared/club-logos/2026-27/arsenal.png",
  "/touchlineArena/shared/club-logos/2026-27/leeds-united.png",
]);
const assets = new Set(logoPaths);
const arenaAssetTypes = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const stylesheets = ["components/touchline/TouchlineGlobalNavigation.module.css", "components/touchline/ClubHubFixtureStrip.module.css", "components/touchline/TouchlineSiteFooter.module.css"];
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX };
const cssModule = { default: new Proxy({}, { get: (_target, key) => String(key) }) };

function resolveLocalModule(file) {
  if (/\.(?:ts|tsx|css)$/.test(file)) return file;
  const candidates = [file + ".ts", file + ".tsx"].filter(candidate => existsSync(candidate));
  if (candidates.length !== 1) throw new Error("Missing or ambiguous isolated preview module");
  return candidates[0];
}

function localModule(file, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: options }).outputText, {
    exports, URL,
    require(id) {
      if (id.endsWith(".css")) return cssModule;
      if (!id.startsWith(".") && !id.startsWith("@/")) return require(id);
      const path = id.startsWith("@/") ? join(root, id.slice(2)) : resolve(dirname(file), id);
      return localModule(resolveLocalModule(path), cache);
    },
  }, { filename: file });
  return exports;
}

function carouselBundle() {
  const react = dirname(require.resolve("react"));
  const dom = dirname(require.resolve("react-dom/client"));
  const scheduler = dirname(createRequire(require.resolve("react-dom/client")).resolve("scheduler"));
  const modules = {
    react: readFileSync(join(react, "cjs/react.development.js"), "utf8"),
    "react/jsx-runtime": readFileSync(join(react, "cjs/react-jsx-runtime.development.js"), "utf8"),
    "react-dom": readFileSync(join(dom, "cjs/react-dom.development.js"), "utf8"),
    "react-dom/client": readFileSync(join(dom, "cjs/react-dom-client.development.js"), "utf8"),
    scheduler: readFileSync(join(scheduler, "cjs/scheduler.development.js"), "utf8"),
  };
  function bundle(file) {
    if (Object.hasOwn(modules, file)) return file;
    if (file.endsWith(".css")) {
      modules[file] = "exports.default=new Proxy({},{get:(_,key)=>String(key)});";
      return file;
    }
    modules[file] = "";
    modules[file] = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: options }).outputText
      .replace(/require\("([^"]+)"\)/g, (match, id) => {
        if (!id.startsWith(".") && !id.startsWith("@/")) {
          if (!Object.hasOwn(modules, id)) throw new Error(`Unexpected external module: ${id}`);
          return match;
        }
        const target = id.startsWith("@/") ? join(root, id.slice(2)) : resolve(dirname(file), id);
        return `require(${JSON.stringify(bundle(resolveLocalModule(target)))})`;
      });
    return file;
  }
  const entry = bundle(join(root, "components/touchline/ClubHubFixtureStrip.tsx"));
  return { entry, definitions: Object.entries(modules).map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(",") };
}

const bundleCache = carouselBundle();
const Footer = localModule(join(root, "components/touchline/TouchlineSiteFooter.tsx")).default;
const Carousel = localModule(join(root, "components/touchline/ClubHubFixtureStrip.tsx")).default;
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

export function buildMobileReviewHtml(locale = "en-GB") {
  if (!REVIEW_LOCALES.includes(locale)) throw new Error("Unsupported preview locale");
  const fixtures = Array.from({ length: 10 }, (_item, index) => ({
    id: `synthetic-${index}`, providerId: `synthetic-${index}`, status: index % 2 ? "Not Started" : "FullTime",
    startsAt: "2030-10-09T18:00:00Z", homeScore: index % 2 ? undefined : 2, awayScore: index % 2 ? undefined : 1,
    homeTeam: { id: "synthetic-home", providerId: "synthetic-home", name: "Arsenal", logoUrl: logoPaths[0] },
    awayTeam: { id: "synthetic-away", providerId: "synthetic-away", name: "Leeds United", logoUrl: logoPaths[1] },
  }));
  const footer = renderToStaticMarkup(React.createElement(Footer, { locale, draftLocalesEnabled: true,
    instagramUrl: "https://www.instagram.com/touchline_preview_fixture/" }));
  const carouselProps = { locale, draftLocalesEnabled: true, initialFixtures: fixtures, initialNow: Date.now(),
    initialTimeZone: "Europe/Malta", initialMetadata: { state: "partial-persisted-schedule", degraded: true } };
  const carousel = renderToStaticMarkup(React.createElement(Carousel, carouselProps));
  const css = stylesheets.map(path => readFileSync(join(root, path), "utf8")).join("\n");
  const links = REVIEW_LOCALES.map(value => `<a href="/?lang=${value}" lang="${value}">${value}</a>`).join(" ");
  return `<!doctype html><html lang="${locale}" dir="${locale === "ar-SA" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>TouchLine · isolated mobile review</title><style>
  ${css}
  body{margin:0;background:#030c08;color:#eaf3e4;font-family:system-ui,sans-serif} main{padding:24px max(24px,env(safe-area-inset-left)) 36px;min-height:45vh} nav{display:flex;flex-wrap:wrap;gap:12px} nav a{color:#aaff3e;padding:10px} .reviewNotice{border:1px solid #8caf6c;padding:12px;font-size:14px} h1{font-size:24px} #reviewAction{min-height:1.5em;color:#aaff3e}
  </style></head><body><main><h1>TouchLine · prévia isolada</h1><p class="reviewNotice">Dados sintéticos para revisão visual. Não é o site publicado. Instagram demonstrativo; links externos e requisições de dados estão desativados.</p><nav aria-label="Preview language">${links}</nav><h2>Live · carrossel contínuo</h2><div id="reviewCarousel">${carousel}</div><p id="reviewAction" role="status"></p></main>${footer}<script>
  // The actual shared transport may request a snapshot; this harness never
  // performs that request. The actual component retains its synthetic SSR seed.
  window.fetch=async()=>({ok:false,status:503,json:async()=>({ok:false})});
  document.addEventListener('click',event=>{const link=event.target.closest('a');if(link&&!link.getAttribute('href').startsWith('/?lang=')){event.preventDefault();document.getElementById('reviewAction').textContent='Navegação desativada nesta prévia isolada.';}});
  const process={env:{NODE_ENV:'development'}},modules={${bundleCache.definitions}},cache={};
  function require(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;if(!modules[id])throw Error('Unknown preview module');modules[id](module,module.exports,require);return module.exports;}
  const React=require('react');require('react-dom/client').hydrateRoot(document.getElementById('reviewCarousel'),React.createElement(require(${JSON.stringify(bundleCache.entry)}).default,${JSON.stringify(carouselProps)}));
  </script></body></html>`;
}

export async function mobileReviewResponse(target, method = "GET") {
  if (!["GET", "HEAD"].includes(method)) return { status: 405, type: "text/plain", body: "Read-only preview" };
  let url;
  try { url = new URL(target, "http://127.0.0.1"); } catch { return { status: 400, type: "text/plain", body: "Invalid URL" }; }
  if (url.origin !== "http://127.0.0.1") return { status: 400, type: "text/plain", body: "Local paths only" };
  if (["/", "/arena", "/live-review"].includes(url.pathname)) {
    if ([...url.searchParams.keys()].some(key => key !== "lang") || url.searchParams.getAll("lang").length > 1) return { status: 400, type: "text/plain", body: "Invalid preview query" };
    const locale = url.searchParams.get("lang") ?? "en-GB";
    if (!REVIEW_LOCALES.includes(locale)) return { status: 400, type: "text/plain", body: "Unsupported preview locale" };
    if (method === "HEAD") return { status: 200, type: "text/html; charset=utf-8", body: "" };
    const html = url.pathname === "/live-review"
      ? (await import("./match-centre-mobile-review-fixture.mjs")).createMatchCentreMobileReviewHtml({ locale })
      : url.pathname === "/arena"
      ? (await import("./arena-mobile-review-fixture.mjs")).createArenaMobileReviewHtml({ baseUrl: "http://127.0.0.1/", locale }).replace(/<base href="[^"]*">/, "")
      : buildMobileReviewHtml(locale);
    return { status: 200, type: "text/html; charset=utf-8", body: html };
  }
  let assetPath;
  try { assetPath = decodeURIComponent(url.pathname); }
  catch { return { status: 400, type: "text/plain", body: "Invalid asset path" }; }
  // Arena publishes its exact synthetic-fixture asset manifest; do not expose
  // arbitrary files, even inside the wider public artwork namespace.
  const arenaAssets = assetPath.startsWith("/touchlineArena/")
    ? (await import("./arena-mobile-review-fixture.mjs")).ARENA_REVIEW_ASSET_PATHS : [];
  const matchAssets = assetPath.startsWith("/touchlineArena/")
    ? (await import("./match-centre-mobile-review-fixture.mjs")).MATCH_CENTRE_REVIEW_ASSET_PATHS : [];
  const type = assets.has(assetPath) ? "image/png"
    : arenaAssets.includes(assetPath) || matchAssets.includes(assetPath) ? arenaAssetTypes[extname(assetPath)] : undefined;
  const versions = url.searchParams.getAll("v");
  const versionQueryAllowed = !url.search || ([...url.searchParams.keys()].every(key => key === "v")
    && versions.length === 1 && /^\d{4}-\d{2}-\d{2}(?:-\d{1,4})?$/.test(versions[0]));
  if (!type || !versionQueryAllowed) return { status: 404, type: "text/plain", body: "Not found" };
  let path;
  try { path = realpathSync(join(publicRoot, assetPath)); }
  catch { return { status: 404, type: "text/plain", body: "Not found" }; }
  if (!path.startsWith(publicRoot + sep)) return { status: 404, type: "text/plain", body: "Not found" };
  return { status: 200, type, body: method === "HEAD" ? "" : readFileSync(path) };
}

export function startMobileReviewServer(port = 3350) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid loopback port");
  return http.createServer(async (request, response) => {
    try {
      const result = await mobileReviewResponse(request.url ?? "/", request.method);
      response.writeHead(result.status, { "Content-Type": result.type, "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
      response.end(result.body);
    } catch { response.writeHead(500); response.end("Preview unavailable"); }
  }).listen(port, "127.0.0.1");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.argv[2] ?? 3350);
  startMobileReviewServer(port).once("listening", () => console.log(`Isolated mobile review: http://127.0.0.1:${port}/?lang=pt-BR`));
}
