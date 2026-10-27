import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

// Execute the real frame JSX and player fallback in isolation. This proves the
// SSR candidate contract; browser currentSrc selection and sharpness are separate.
const playerSource = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");
const playerFile = ts.createSourceFile("player.tsx", playerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const constants = new Set(["CARD_W", "CARD_H", "DEFAULT_CLUB_TEMPLATE_URL", "CARD_TEMPLATE_ASSET_VERSION", "LIVE_COMPACT_CLUB_TEMPLATE_ROOT", "ZOOM_CLUB_TEMPLATE_ROOT"]);
const functions = new Set(["touchlineLiveCompactFrameUrl", "touchlineZoomFrameUrl", "cardFrameImage"]);
const declarations: string[] = [];
function visitPlayer(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && constants.has(node.name.getText(playerFile))) declarations.push(`const ${node.getText(playerFile)};`);
  if (ts.isFunctionDeclaration(node) && node.name && functions.has(node.name.text)) declarations.push(node.getText(playerFile));
  ts.forEachChild(node, visitPlayer);
}
visitPlayer(playerFile);
assert.equal(declarations.length, constants.size + functions.size);
const playerCode = ts.transpileModule(`${declarations.join("\n")}\nexports.render = cardFrameImage;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

type Frame = { props: { src: string; srcSet?: string; sizes?: string; style: { width: number; height: number }; onError?: (event: { currentTarget: ImageStub }) => void } };
type ImageStub = { src: string; currentSrc: string; srcset: string };
function execute(code: string, values: Record<string, unknown>): Frame {
  const exports = {} as { render: () => Frame };
  runInNewContext(code, { exports, ...values, require(name: string) { assert.equal(name, "react/jsx-runtime"); return jsx; } });
  return exports.render();
}
function playerFrame(compact: boolean, source = "/touchlineArena/cards/templates/clubs/Arsenal%20FC/market-tiers/ruby-red.png?v=fixture") {
  return execute(playerCode, { versionedCardTemplateUrl: source, optimizeForLiveCompact: compact, imageLoading: "eager" });
}

test("player frame offers native density candidates without viewport-derived sizing or changing canvas", () => {
  const compact = playerFrame(true).props;
  const zoom = playerFrame(false).props;
  assert.match(compact.src, /\/live-compact\/clubs\/Arsenal%20FC\/market-tiers\/ruby-red\.webp\?v=/);
  assert.match(zoom.src, /\/zoom\/clubs\/Arsenal%20FC\/market-tiers\/ruby-red\.webp\?v=/);
  assert.equal(compact.srcSet, `${compact.src} 1x, ${zoom.src} ${430 / 119}x`);
  assert.equal(430 / Number(compact.srcSet.split(", ")[1].split(" ").at(-1)!.slice(0, -1)), 119);
  assert.equal(zoom.srcSet, undefined);
  for (const frame of [compact, zoom]) {
    assert.equal(frame.sizes, undefined);
    assert.equal(frame.style.width, 430); assert.equal(frame.style.height, 691);
  }
  assert.equal(playerFrame(true, "/custom/approved.png").props.srcSet, undefined, "do not invent higher-density variants for custom assets");
});

test("player fallback recovers when failed currentSrc is the dense candidate while src already names the fallback", () => {
  const frame = playerFrame(true, "/touchlineArena/cards/templates/clubs/Manchester%20City/market-tiers/diamond-gold.png").props;
  const dense = frame.srcSet!.split(", ")[1].split(" ")[0];
  let assignments = 0;
  const image = { currentSrc: `https://fixture.invalid${dense}`, srcset: frame.srcSet!,
    get src() { return `https://fixture.invalid${frame.src}`; }, set src(value: string) { assert.equal(value, frame.src); assignments++; } };
  frame.onError!({ currentTarget: image });
  assert.equal(assignments, 1); assert.equal(image.srcset, "");
  image.currentSrc = `https://fixture.invalid${frame.src}`;
  frame.onError!({ currentTarget: image });
  assert.equal(assignments, 1, "failed fallback must not loop");
});

const coachSource = readFileSync(new URL("../components/touchline/cards/TouchlineCoachCard.tsx", import.meta.url), "utf8");
const coachFile = ts.createSourceFile("coach.tsx", coachSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const frames: ts.JsxSelfClosingElement[] = [];
function visitCoach(node: ts.Node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(coachFile) === "img" && node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(coachFile) === "data-touchline-card-frame")) frames.push(node);
  ts.forEachChild(node, visitCoach);
}
visitCoach(coachFile); assert.equal(frames.length, 1);
const coachCode = ts.transpileModule(`exports.render = () => (${frames[0].getText(coachFile)});`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
test("coach compact offers the existing 810px derivative at its true 3.375 density; zoom keeps the high source", () => {
  for (const compact of [true, false]) {
    const frame = execute(coachCode, { frameRef: { current: null }, styles: { frame: "frame" }, optimizeForLiveCompact: compact,
      compactCardTemplateUrl: "/compact-coach.webp", zoomCardTemplateUrl: "/zoom-coach.webp",
      frameDisplayWidth: undefined, frameLoading: undefined, frameDecoding: undefined, frameFetchPriority: undefined }).props;
    assert.equal(frame.src, compact ? "/compact-coach.webp" : "/zoom-coach.webp");
    assert.equal(frame.srcSet, compact ? "/compact-coach.webp 1x, /zoom-coach.webp 3.375x" : undefined);
    assert.equal(frame.sizes, undefined);
  }
});


test("coach dense-candidate failure recovers the same tier once and cannot loop on failed compact", () => {
  const compactUrl = "/touchlineArena/cards/templates/live-compact/coaches/01_blue_coach.webp?v=fixture";
  const zoomUrl = "/touchlineArena/cards/templates/zoom/coaches/01_blue_coach.webp?v=fixture";
  const values = { frameRef: { current: null }, styles: { frame: "frame" }, optimizeForLiveCompact: true,
    compactCardTemplateUrl: compactUrl, zoomCardTemplateUrl: zoomUrl,
    frameDisplayWidth: undefined, frameLoading: undefined, frameDecoding: undefined, frameFetchPriority: undefined };
  const frame = execute(coachCode, values).props;
  let assignments = 0;
  const image: ImageStub = { currentSrc: `https://fixture.invalid${zoomUrl}`, srcset: frame.srcSet!,
    get src() { return `https://fixture.invalid${compactUrl}`; },
    set src(value: string) { assert.equal(value, compactUrl, "never substitute a different tier"); assignments++; } };
  assert.equal(typeof frame.onError, "function");
  frame.onError!({ currentTarget: image });
  assert.equal(image.srcset, ""); assert.equal(assignments, 1);
  image.currentSrc = `https://fixture.invalid${compactUrl}`;
  frame.onError!({ currentTarget: image });
  assert.equal(assignments, 1, "a failed compact fallback must not loop");
  image.currentSrc = "";
  frame.onError!({ currentTarget: image });
  assert.equal(assignments, 1, "src guards the compact failure when currentSrc is unavailable");
  assert.equal(execute(coachCode, { ...values, optimizeForLiveCompact: false }).props.onError, undefined,
    "standalone zoom retains its existing delivery policy");
});


test("coach known layout width declares real w candidates without changing zoom or unknown containers", () => {
  const values = { frameRef: { current: null }, styles: { frame: "frame" }, optimizeForLiveCompact: true,
    compactCardTemplateUrl: "/compact-coach.webp", zoomCardTemplateUrl: "/zoom-coach.webp",
    frameLoading: undefined, frameDecoding: undefined, frameFetchPriority: undefined };
  for (const width of [52, 119, 240]) {
    const frame = execute(coachCode, { ...values, frameDisplayWidth: width }).props;
    assert.equal(frame.srcSet, "/compact-coach.webp 240w, /zoom-coach.webp 810w");
    assert.equal(frame.sizes, `${width}px`);
    const zoom = execute(coachCode, { ...values, optimizeForLiveCompact: false, frameDisplayWidth: width }).props;
    assert.equal(zoom.src, "/zoom-coach.webp"); assert.equal(zoom.srcSet, undefined); assert.equal(zoom.sizes, undefined);
  }
  for (const width of [undefined, NaN, Infinity, 0, -52]) {
    const frame = execute(coachCode, { ...values, frameDisplayWidth: width }).props;
    assert.equal(frame.srcSet, "/compact-coach.webp 1x, /zoom-coach.webp 3.375x"); assert.equal(frame.sizes, undefined);
  }
});

test("coach responsive sizes use width candidates, numeric width wins, and expanded frames ignore both", () => {
  const values = { frameRef: { current: null }, styles: { frame: "frame" }, optimizeForLiveCompact: true,
    compactCardTemplateUrl: "/compact-coach.webp", zoomCardTemplateUrl: "/zoom-coach.webp",
    frameDisplayWidth: undefined, frameLoading: undefined, frameDecoding: undefined, frameFetchPriority: undefined };
  const sizes = "(max-width: 760px) 50vw, 206px";
  const responsive = execute(coachCode, { ...values, frameDisplaySizes: sizes }).props;
  assert.equal(responsive.srcSet, "/compact-coach.webp 240w, /zoom-coach.webp 810w");
  assert.equal(responsive.sizes, sizes);
  assert.equal(execute(coachCode, { ...values, frameDisplayWidth: 52, frameDisplaySizes: sizes }).props.sizes, "52px");
  for (const invalidWidth of [NaN, Infinity, 0, -1]) {
    assert.equal(execute(coachCode, { ...values, frameDisplayWidth: invalidWidth, frameDisplaySizes: sizes }).props.sizes, sizes);
  }
  for (const empty of [undefined, "", "   "]) {
    const frame = execute(coachCode, { ...values, frameDisplaySizes: empty }).props;
    assert.equal(frame.srcSet, "/compact-coach.webp 1x, /zoom-coach.webp 3.375x");
    assert.equal(frame.sizes, undefined);
  }
  const expanded = execute(coachCode, { ...values, optimizeForLiveCompact: false, frameDisplayWidth: 52, frameDisplaySizes: sizes }).props;
  assert.equal(expanded.src, "/zoom-coach.webp"); assert.equal(expanded.srcSet, undefined); assert.equal(expanded.sizes, undefined);
});

test("gallery owns conservative responsive hints while the zoom forwards them only to its trigger", () => {
  const gallerySource = readFileSync(new URL("../components/touchline/TouchlineCoachCategoryShowcase.tsx", import.meta.url), "utf8");
  const gallery = ts.createSourceFile("gallery.tsx", gallerySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const zoomSource = readFileSync(new URL("../components/touchline/cards/TouchlineCoachCardZoom.tsx", import.meta.url), "utf8");
  const zoom = ts.createSourceFile("zoom.tsx", zoomSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const elements = (file: ts.SourceFile, tag: string) => {
    const found: ts.JsxSelfClosingElement[] = [];
    const visit = (node: ts.Node) => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === tag) found.push(node); ts.forEachChild(node, visit); };
    visit(file); return found;
  };
  const attribute = (node: ts.JsxSelfClosingElement, name: string) => node.attributes.properties.find(
    (item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText() === name);
  const galleryCards = elements(gallery, "TouchlineCoachCardZoom"); assert.equal(galleryCards.length, 1);
  const hint = attribute(galleryCards[0], "frameDisplaySizes")?.initializer;
  assert.ok(hint && ts.isStringLiteral(hint));
  assert.equal(hint.text, "(max-width: 410px) max(112px, 50vw), (max-width: 760px) 50vw, (max-width: 1180px) 25vw, 206px");
  assert.equal(attribute(galleryCards[0], "compact"), undefined, "keep the default compact typography and layout");
  assert.equal(attribute(galleryCards[0], "frameDisplayWidth"), undefined, "the gallery must not claim an exact measured width");
  const css = readFileSync(new URL("../components/touchline/TouchlineCoachCategoryShowcase.module.css", import.meta.url), "utf8");
  assert.match(css, /max-width:\s*1440px/);
  assert.match(css, /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/);
  for (const [breakpoint, columns] of [[1180, 4], [760, 2]]) {
    assert.match(css, new RegExp(`@media \\(max-width: ${breakpoint}px\\)[\\s\\S]*?grid-template-columns: repeat\\(${columns}, minmax\\(0, 1fr\\)\\)`));
  }
  assert.match(css, /@media \(max-width: 410px\)[\s\S]*?grid-template-columns: minmax\(112px, \.74fr\) 1fr/);
  assert.ok(206 >= 1440 / 7, "desktop hint covers the capped host before gutters");
  const cards = elements(zoom, "TouchlineCoachCard"); assert.equal(cards.length, 2);
  assert.equal(attribute(cards[0], "frameDisplaySizes")?.initializer?.getText(zoom), "{frameDisplaySizes}");
  assert.equal(attribute(cards[1], "frameDisplaySizes"), undefined, "expanded content owns its sizing");
});
