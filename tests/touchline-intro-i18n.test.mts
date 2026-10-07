import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as localePolicy from "../lib/touchlineArena/i18n.ts";
import * as ambient from "../lib/touchlineArena/ambient-audio-i18n.ts";
import * as arena from "../lib/touchlineArena/arena-intro.ts";

const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const introPath = "components/touchline/arena/TouchlineArenaIntro.tsx";
const entryPath = "components/touchline/arena/TouchlineGameEntry.tsx";
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const keys = ["introAria", "arenaEnableSound", "arenaMute", "skipIntro", "entryEnableSound", "entryMute", "goToMarket"] as const;
const expected = {
  "en-GB": ["Official TouchLine Arena introduction", "Enable Arena sound", "Mute Arena", "Skip intro", "Enable sound", "Mute", "Go to ClubOwner"],
  "pt-BR": ["Introdução oficial da TouchLine Arena", "Ativar som da Arena", "Silenciar Arena", "Pular intro", "Ativar som", "Silenciar", "Ir ao ClubOwner"],
  "es-ES": ["Introducción oficial de TouchLine Arena", "Activar el sonido de la Arena", "Silenciar el sonido de la Arena", "Saltar introducción", "Activar sonido", "Silenciar", "Ir a ClubOwner"],
  "it-IT": ["Introduzione ufficiale di TouchLine Arena", "Attiva l’audio dell’Arena", "Disattiva l’audio dell’Arena", "Salta introduzione", "Attiva l’audio", "Silenzia", "Vai a ClubOwner"],
  "fr-FR": ["Introduction officielle de TouchLine Arena", "Activer le son de l’Arena", "Couper le son de l’Arena", "Passer l’introduction", "Activer le son", "Couper le son", "Accéder à ClubOwner"],
  "ar-SA": ["المقدمة الرسمية لـ TouchLine Arena", "تفعيل صوت Arena", "كتم صوت Arena", "تخطي المقدمة", "تفعيل الصوت", "كتم الصوت", "الانتقال إلى ClubOwner"],
  "tr-TR": ["TouchLine Arena resmî tanıtımı", "Arena sesini aç", "Arena sesini kapat", "Tanıtımı atla", "Sesi aç", "Sesi kapat", "ClubOwner’a git"],
  "de-DE": ["Offizielle Einführung in TouchLine Arena", "Arena-Ton aktivieren", "Arena stummschalten", "Einführung überspringen", "Ton aktivieren", "Stummschalten", "Zu ClubOwner"],
};
type Copy = Record<typeof keys[number] | "sound", string>;
type CopyModule = { getTouchlineIntroCopy: (locale?: string | null, draftLocalesEnabled?: boolean) => Copy; TOUCHLINE_INTRO_CATALOGUES: Record<string, Omit<Copy, "sound">>; TOUCHLINE_INTRO_DRAFT_LOCALES: readonly string[]; TOUCHLINE_INTRO_DRAFT_STATUS: string };
function evaluate<T>(source: string, modules: Record<string, unknown>): T {
  const exports = {};
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  runInNewContext(output, { exports, require: (id: string) => { assert.ok(Object.hasOwn(modules, id), id); return modules[id]; } });
  return exports as T;
}
async function copyModule(): Promise<CopyModule> {
  return import("../lib/touchlineArena/intro-i18n.ts");
}
type Element = React.ReactElement<Record<string, unknown>>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children as React.ReactNode)];
}
// Actual components/JSX and callbacks. Hooks and media/browser leaves are
// controlled boundaries, not mounted effects, browser audio or focus evidence.
function fixture(path: string, copy: Pick<CopyModule, "getTouchlineIntroCopy">, states: unknown[] = []) {
  const seen = { effects: [] as unknown[], updates: [] as unknown[], routes: [] as string[], writes: [] as unknown[][], stops: 0, plays: 0 };
  let index = 0;
  const session = { stop: () => { seen.stops++; }, play: () => { seen.plays++; return Promise.resolve(true); } };
  const hooks = { ...React,
    useState: (initial: unknown) => { const i = index++; return [i in states ? states[i] : typeof initial === "function" ? initial() : initial, (value: unknown) => { seen.updates.push([i, value]); }]; },
    useRef: (current: unknown) => ({ current }), useEffect: (...args: unknown[]) => { seen.effects.push(args); },
    useCallback: (callback: unknown) => callback, useSyncExternalStore: () => true,
  };
  function Icon() { return React.createElement("svg"); }
  function Image(props: Record<string, unknown>) { const next = { ...props }; for (const key of ["fill", "priority", "unoptimized"]) delete next[key]; return React.createElement("img", next); }
  function IntroLeaf() { return null; }
  const modules = {
    react: hooks, "react/jsx-runtime": require("react/jsx-runtime"), "next/image": { __esModule: true, default: Image },
    "next/navigation": { useRouter: () => ({ replace: (href: string) => { seen.routes.push(href); } }) },
    "lucide-react": { FastForward: Icon, Volume2: Icon, VolumeX: Icon },
    "@/lib/touchlineArena/arena-intro": arena, "@/lib/touchlineArena/intro-i18n": copy,
    "@/lib/touchlineArena/browser-storage": { readBrowserStorage: () => { throw Error("no storage reads during render"); }, writeBrowserStorage: (...args: unknown[]) => seen.writes.push(args) },
    "@/lib/touchlineArena/arena-media-playback": { createTouchlineArenaMediaSession: () => session, readTouchlineArenaMediaAvailability: () => true, subscribeTouchlineArenaMediaAvailability: () => { throw Error("no subscription during controlled render"); } },
    "./TouchlineArenaIntro": { __esModule: true, default: IntroLeaf },
    "./TouchlineGameEntry.module.css": { __esModule: true, default: { root: "root", video: "video", controls: "controls" } },
    "./touchline-arena-intro.module.css": { __esModule: true, default: { root: "root", sequenceSkip: "sequenceSkip", slogan: "slogan" } },
  };
  const component = evaluate<{ default: (props: Record<string, unknown>) => React.ReactNode }>(read(path), modules).default;
  return { seen, render(props: Record<string, unknown>) { index = 0; const node = component(props); return { node, html: renderToStaticMarkup(node), nodes: elements(node) }; } };
}
test("seven exact texts and sound reuse across eight catalogues with six public gates closed", async () => {
  const c = await copyModule();
  assert.deepEqual(Object.keys(c.TOUCHLINE_INTRO_CATALOGUES), locales);
  assert.deepEqual(c.TOUCHLINE_INTRO_DRAFT_LOCALES, locales.slice(2)); assert.equal(c.TOUCHLINE_INTRO_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    assert.deepEqual(Object.keys(c.TOUCHLINE_INTRO_CATALOGUES[locale]), keys);
    assert.deepEqual(keys.map(key => c.TOUCHLINE_INTRO_CATALOGUES[locale][key]), expected[locale]);
    const active = locale === "pt-BR" ? "pt-BR" : "en-GB";
    assert.deepEqual(keys.map(key => c.getTouchlineIntroCopy(locale)[key]), expected[active]);
    assert.equal(c.getTouchlineIntroCopy(locale).sound, ambient.getTouchlineAmbientAudioCopy(locale).sound);
  }
  for (const locale of locales.slice(2)) assert.equal(localePolicy.isTouchLineLocaleComplete(locale), false);
  for (const value of [undefined, null, "pt", "constructor", "__proto__", "invalid"]) assert.equal(c.getTouchlineIntroCopy(value).skipIntro, "Skip intro");
});
test("real Arena intro renders public states, ARIA and unchanged explicit audio/skip callbacks", async () => {
  const c = await copyModule();
  for (const locale of locales) for (const muted of [true, false]) {
    let toggles = 0, skips = 0;
    const f = fixture(introPath, c, ["normal", "slogan"]);
    const view = f.render({ locale, mode: "first", audioMuted: muted, onToggleAudio: () => toggles++, onSkip: () => skips++, onComplete() {}, onReveal() {}, onSequenceStart() {} });
    const copy = c.getTouchlineIntroCopy(locale);
    assert.equal(view.nodes[0].props["aria-label"], copy.introAria);
    assert.match(view.html, /role="dialog" aria-modal="true" tabindex="-1"/);
    assert.match(view.html, /THIS IS NOT A FANTASY\./); assert.match(view.html, /THIS IS REALITY\./);
    const buttons = view.nodes.filter(node => node.type === "button");
    assert.equal(buttons.length, 2); assert.equal(buttons[0].props["aria-label"], muted ? copy.arenaEnableSound : copy.arenaMute);
    assert.ok(view.html.includes(copy.sound)); assert.ok(view.html.includes(copy.skipIntro));
    assert.equal(toggles, 0); assert.equal(skips, 0);
    (buttons[0].props.onClick as () => void)(); (buttons[1].props.onClick as () => void)();
    assert.equal(toggles, 1); assert.equal(skips, 1); assert.equal(f.seen.effects.length, 4);
  }
  for (const mode of ["hidden", "skip"]) assert.equal(fixture(introPath, c).render({ locale: "en-GB", mode }).node, null);
  const pending = fixture(introPath, c).render({ locale: "en-GB", mode: "pending", onSkip() {} });
  assert.equal(pending.nodes[0].props["data-phase"], "pending"); assert.equal(pending.nodes.filter(n => n.type === "button").length, 1);
});
test("real GameEntry controls preserve explicit gesture, finish once, route, storage and child contract", async () => {
  const c = await copyModule();
  for (const locale of locales) for (const muted of [true, false]) {
    const f = fixture(entryPath, c, ["hidden", true, false, muted]);
    const view = f.render({ locale }); const copy = c.getTouchlineIntroCopy(locale);
    const buttons = view.nodes.filter(n => n.type === "button");
    assert.equal(buttons[0].props.children, muted ? copy.entryEnableSound : copy.entryMute); assert.equal(buttons[1].props.children, copy.goToMarket);
    const video = view.nodes.find(n => n.type === "video")!; assert.equal(video.props.src, arena.TOUCHLINE_ARENA_ENTRY_VIDEO); assert.equal(video.props.muted, muted);
    const child = view.nodes.find(n => typeof n.type === "function")!; assert.equal(child.props.locale, locale); assert.equal(child.props.audioMuted, muted);
    assert.equal(f.seen.plays, 0); assert.equal(f.seen.stops, 0); assert.deepEqual(f.seen.writes, []); assert.deepEqual(f.seen.routes, []);
    (buttons[0].props.onClick as () => void)();
    const update = f.seen.updates[0] as [number, (v: boolean) => boolean]; assert.equal(update[0], 3); assert.equal(update[1](muted), !muted);
    (buttons[1].props.onClick as () => void)(); (video.props.onEnded as () => void)();
    assert.equal(f.seen.stops, 1); assert.deepEqual(f.seen.routes, [`/clubowner?lang=${encodeURIComponent(locale)}`]);
    assert.deepEqual(f.seen.writes, [["localStorage", arena.TOUCHLINE_ARENA_INTRO_STORAGE_KEY, "1"]]); assert.equal(f.seen.effects.length, 2);
  }
  assert.equal(fixture(entryPath, c).render({ locale: "en-GB" }).nodes.filter(n => n.type === "button").length, 0);
});
test("draft review seam exercises all copy while actual consumers forward full locale without enabling gates", async () => {
  const c = await copyModule();
  for (const locale of locales) {
    assert.deepEqual(keys.map(key => c.getTouchlineIntroCopy(locale, true)[key]), expected[locale]);
    assert.equal(c.getTouchlineIntroCopy(locale, true).sound, ambient.TOUCHLINE_AMBIENT_AUDIO_CATALOGUES[locale].sound);
    const calls: unknown[] = [];
    const sentinel = { getTouchlineIntroCopy: (value?: string | null) => { calls.push(value); return Object.fromEntries([...keys, "sound"].map(key => [key, `${locale}:${key}:<&>`])) as Copy; } };
    for (const muted of [true, false]) {
      const reviewedIntro = fixture(introPath, c, ["normal", "slogan"]).render({ locale, draftLocalesEnabled: true, mode: "first", audioMuted: muted, onToggleAudio() {}, onSkip() {} });
      const reviewedButtons = reviewedIntro.nodes.filter(node => node.type === "button");
      assert.equal(reviewedIntro.nodes[0].props["aria-label"], expected[locale][0]);
      assert.equal(reviewedButtons[0].props["aria-label"], expected[locale][muted ? 1 : 2]);
      assert.equal((reviewedButtons[0].props.children as unknown[])[1], ambient.TOUCHLINE_AMBIENT_AUDIO_CATALOGUES[locale].sound);
      assert.equal((reviewedButtons[1].props.children as unknown[])[0], expected[locale][3]);
      const reviewedEntry = fixture(entryPath, c, ["hidden", false, false, muted]).render({ locale, draftLocalesEnabled: true });
      assert.equal(reviewedEntry.nodes.find(n => typeof n.type === "function")!.props.draftLocalesEnabled, true);
      const entryButtons = reviewedEntry.nodes.filter(node => node.type === "button");
      assert.equal(entryButtons[0].props.children, expected[locale][muted ? 4 : 5]);
      assert.equal(entryButtons[1].props.children, expected[locale][6]);
      const intro = fixture(introPath, sentinel, ["normal", "slogan"]).render({ locale, mode: "first", audioMuted: muted, onToggleAudio() {}, onSkip() {} });
      for (const key of ["introAria", muted ? "arenaEnableSound" : "arenaMute", "skipIntro", "sound"]) assert.ok(intro.html.includes(`${locale}:${key}:&lt;&amp;&gt;`), key);
      const entry = fixture(entryPath, sentinel, ["hidden", false, false, muted]).render({ locale });
      for (const key of [muted ? "entryEnableSound" : "entryMute", "goToMarket"]) assert.ok(entry.html.includes(`${locale}:${key}:&lt;&amp;&gt;`), key);
    }
    assert.deepEqual(calls, [locale, locale, locale, locale]);
  }
});
test("all original effects, timers, media, storage, slogan, routes and geometry remain byte-identical outside copy bindings", () => {
  // The separately approved route rename is the only admitted navigation delta.
  // Keep the current destination asserted before reconstructing the old baseline.
  assert.ok(read(entryPath).includes('router.replace(`/clubowner?lang=${encodeURIComponent(locale)}`);'));
  assert.ok(!read(entryPath).includes("/market-transfer"));
  const intro = read(introPath).replace('import { getTouchlineIntroCopy } from "@/lib/touchlineArena/intro-i18n";\n', "")
    .replace("  draftLocalesEnabled?: boolean;\n", "").replace("  draftLocalesEnabled = false,\n", "")
    .replace("getTouchlineIntroCopy(locale, draftLocalesEnabled)", "getTouchlineIntroCopy(locale)")
    .replace("const copy = getTouchlineIntroCopy(locale);", 'const isPortuguese = locale === "pt-BR";')
    .replace("{copy.introAria}", '{isPortuguese ? "Introdução oficial da TouchLine Arena" : "Official TouchLine Arena introduction"}')
    .replace("{audioMuted ? copy.arenaEnableSound : copy.arenaMute}", '{isPortuguese ? audioMuted ? "Ativar som da Arena" : "Silenciar Arena" : audioMuted ? "Enable Arena sound" : "Mute Arena"}')
    .replace("{copy.sound}", '{isPortuguese ? "Som" : "Sound"}').replace("{copy.skipIntro}", '{isPortuguese ? "Pular intro" : "Skip intro"}');
  const entry = read(entryPath).replace('import { getTouchlineIntroCopy } from "@/lib/touchlineArena/intro-i18n";\n', "")
    .replace('router.replace(`/clubowner?lang=${encodeURIComponent(locale)}`);', 'router.replace(`/market-transfer?lang=${encodeURIComponent(locale)}`);')
    .replace(", draftLocalesEnabled = false", "").replace("  draftLocalesEnabled?: boolean;\n", "")
    .replace(" draftLocalesEnabled={draftLocalesEnabled}", "")
    .replace("getTouchlineIntroCopy(locale, draftLocalesEnabled)", "getTouchlineIntroCopy(locale)")
    .replace("  const copy = getTouchlineIntroCopy(locale);\n", "")
    .replace("{muted ? copy.entryEnableSound : copy.entryMute}", '{muted ? (locale === "pt-BR" ? "Ativar som" : "Enable sound") : (locale === "pt-BR" ? "Silenciar" : "Mute")}')
    .replace("{copy.goToMarket}", '{locale === "pt-BR" ? "Ir ao Mercado" : "Go to Market"}');
  assert.equal(createHash("sha256").update(intro).digest("hex"), "8cac2e83bcc90620ca0ab1e2626717781a6b40fca70d4380bb1a846586aaae73");
  assert.equal(createHash("sha256").update(entry).digest("hex"), "1f29e4cd9b35646a993ab85cc8dfb4d4e332a7a7185f652f8ab0132edc12780d");
});
