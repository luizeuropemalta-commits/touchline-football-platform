import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { touchlineAmbientAudioRoute } from "../lib/touchlineArena/ambient-audio-policy.ts";

test("only the four exact authentication entry routes can inherit opted-in audio", () => {
  for (const path of ["/login", "/register", "/forgot-password", "/reset-password"]) assert.equal(touchlineAmbientAudioRoute(path), "entry");
  for (const root of ["/arena", "/touchline-clubs", "/touchline-coaches", "/touchline-players", "/rankings", "/touchline-player-card-rankings", "/live", "/clubowner", "/my-club", "/intro"]) {
    for (const path of [root, `${root}/`, `${root}/detail`, `${root}/123`]) assert.equal(touchlineAmbientAudioRoute(path), "silent", path);
  }
  for (const root of ["/login", "/register", "/forgot-password", "/reset-password"]) {
    for (const path of [`${root}/`, `${root}/detail`, `${root}-unknown`]) assert.equal(touchlineAmbientAudioRoute(path), "silent", path);
  }
  for (const path of ["/touchline-tables", "/touchline-tables/detail", "/market-transfer", "/market-transfer/detail", "/rankings-unknown", "/clubowner-unknown"]) assert.equal(touchlineAmbientAudioRoute(path), "silent", path);
  for (const path of [null, "/admin", "/admin/login", "/visual-qa/touchline-card-studio", "/preview", "/arena-unknown", "/touchline-players-unknown", "/unavailable"]) assert.equal(touchlineAmbientAudioRoute(path), "silent");
});

type CopyModule = typeof import("../lib/touchlineArena/ambient-audio-i18n.ts");
type State = "off" | "starting" | "on" | "error";
const source = readFileSync(new URL("../components/auth-ambient-audio.tsx", import.meta.url), "utf8");
const nativeRequire = createRequire(import.meta.url);
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": { sound: "Sound", mute: "Mute ambient sound", enable: "Enable quiet ambient sound", unavailable: "Sound unavailable. Try again." },
  "pt-BR": { sound: "Som", mute: "Silenciar som ambiente", enable: "Ativar som ambiente suave", unavailable: "Som indisponível. Tente novamente." },
};

// The complete source component and real React context/hooks/JSX are loaded.
// Only media/browser boundaries and icon artwork are replaced; the provider
// is not mounted and no browser audio behavior is claimed by this fixture.
function fixture(copy?: Partial<CopyModule>) {
  const icon = (name: string) => function FixtureIcon(props: Record<string, unknown>) { return React.createElement("svg", { ...props, "data-icon": name }); };
  const forbidden = () => { throw new Error("copy render must not touch browser/media policy"); };
  const modules: Record<string, unknown> = {
    "react": React,
    "react/jsx-runtime": nativeRequire("react/jsx-runtime"),
    "lucide-react": { Volume2: icon("Volume2"), VolumeX: icon("VolumeX") },
    "next/navigation": { usePathname: forbidden },
    "@/lib/touchlineArena/arena-intro": {},
    "@/lib/touchlineArena/ambient-audio-policy": { touchlineAmbientAudioRoute },
    "@/lib/touchlineArena/quiet-audio": { createQuietAudio: forbidden },
    "@/lib/touchlineArena/arena-media-playback": { readTouchlineArenaMediaAvailability: forbidden, subscribeTouchlineArenaMediaAvailability: forbidden },
    "./touchline/social/TouchlineSocial.module.css": { __esModule: true, default: { profileActions: "profileActions" } },
  };
  const exports: Record<string, unknown> = {};
  const output = ts.transpileModule(`${source}\nexport { AmbientAudioContext };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  runInNewContext(output, { exports, require: (name: string) => {
    if (name === "@/lib/touchlineArena/ambient-audio-i18n") return copy ?? nativeRequire("../lib/touchlineArena/ambient-audio-i18n.ts");
    assert.ok(Object.hasOwn(modules, name), `unexpected dependency ${name}`);
    return modules[name];
  } });
  const Control = exports.AuthAmbientAudio as (props: { locale: string; className?: string; buttonClassName?: string; allowDraftLocale?: boolean }) => React.ReactElement<Record<string, unknown>> | null;
  const Context = exports.AmbientAudioContext as React.Context<unknown>;
  return (locale: string, state: State, available: boolean | null = true, props: { className?: string; buttonClassName?: string; allowDraftLocale?: boolean } = {}) => {
    let calls = 0;
    let tree: React.ReactElement<Record<string, unknown>> | null = null;
    function Capture() { tree = Control({ locale, ...props }); return tree; }
    const html = renderToStaticMarkup(React.createElement(Context.Provider, {
      value: available === null ? null : { state, available, toggle: async () => { calls++; }, claimIntro: forbidden, enable: forbidden },
    }, React.createElement(Capture)));
    return { html, calls: () => calls, click: () => {
      assert.ok(tree);
      const button = React.Children.toArray(tree.props.children as React.ReactNode)[0] as React.ReactElement<{ onClick: () => void }>;
      button.props.onClick();
    } };
  };
}

test("ambient copy has four exact EN/PT keys and eight catalogues without releasing six drafts", async () => {
  const copy = await import("../lib/touchlineArena/ambient-audio-i18n.ts");
  assert.deepEqual(Object.keys(copy.TOUCHLINE_AMBIENT_AUDIO_CATALOGUES), locales);
  assert.deepEqual(copy.TOUCHLINE_AMBIENT_AUDIO_DRAFT_LOCALES, locales.slice(2));
  assert.equal(copy.TOUCHLINE_AMBIENT_AUDIO_DRAFT_STATUS, "draft");
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(copy.TOUCHLINE_AMBIENT_AUDIO_CATALOGUES[locale], baseline[locale]);
  for (const locale of locales) {
    const row = copy.TOUCHLINE_AMBIENT_AUDIO_CATALOGUES[locale];
    assert.deepEqual(Object.keys(row).sort(), Object.keys(baseline["en-GB"]).sort());
    assert.ok(Object.values(row).every((value) => value.trim().length > 0));
  }
  for (const locale of locales.slice(2)) {
    assert.equal(isTouchLineLocaleComplete(locale), false);
    assert.equal(copy.getTouchlineAmbientAudioCopy(locale), copy.TOUCHLINE_AMBIENT_AUDIO_CATALOGUES["en-GB"]);
    assert.deepEqual(copy.getTouchlineAmbientAudioCopy(locale, true), copy.TOUCHLINE_AMBIENT_AUDIO_CATALOGUES[locale]);
  }
  for (const locale of [...locales.slice(2), "invalid", "pt", null, undefined]) assert.equal(copy.getTouchlineAmbientAudioCopy(locale), copy.TOUCHLINE_AMBIENT_AUDIO_CATALOGUES["en-GB"]);
});

test("real control preserves all four states, ARIA, icons, styles and explicit click-only toggle", () => {
  const render = fixture();
  for (const locale of locales) for (const state of ["off", "starting", "on", "error"] as const) {
    const copy = baseline[locale === "pt-BR" ? "pt-BR" : "en-GB"];
    const view = render(locale, state);
    assert.match(view.html, /class="profileActions"/);
    assert.match(view.html, /style="--social-accent:#b7ff46"/);
    assert.match(view.html, /type="button"/);
    assert.ok(view.html.includes(`aria-pressed="${state === "on"}"`));
    assert.ok(view.html.includes(`aria-label="${state === "on" || state === "starting" ? copy.mute : copy.enable}"`));
    assert.ok(view.html.includes(`data-icon="${state === "on" ? "Volume2" : "VolumeX"}"`));
    assert.match(view.html, /size="16" aria-hidden="true"/);
    assert.ok(view.html.includes(`${copy.sound}</button>`));
    assert.equal(view.html.includes('role="status"'), state === "error");
    assert.equal(view.html.includes(copy.unavailable), state === "error");
    if (state === "error") assert.match(view.html, /class="text-xs text-slate-300"/);
    assert.equal(view.calls(), 0);
    view.click(); assert.equal(view.calls(), 1);
  }
  const custom = render("pt-BR", "off", true, { className: "outer-custom", buttonClassName: "button-custom" });
  assert.match(custom.html, /class="outer-custom"/); assert.match(custom.html, /class="button-custom"/);
  assert.doesNotMatch(custom.html, /profileActions/);
});

test("auth login can display the six ambient-control draft translations without changing the default gate", async () => {
  const copy = await import("../lib/touchlineArena/ambient-audio-i18n.ts");
  const render = fixture();
  for (const locale of locales.slice(2)) {
    const expected = copy.TOUCHLINE_AMBIENT_AUDIO_CATALOGUES[locale];
    const view = render(locale, "off", true, { allowDraftLocale: true });
    assert.ok(view.html.includes(`${expected.sound}</button>`), locale);
    assert.ok(view.html.includes(`aria-label="${expected.enable}"`), locale);
  }
});

test("missing context and unavailable routes render no control and do not toggle", () => {
  const render = fixture();
  for (const available of [false, null]) for (const state of ["off", "starting", "on", "error"] as const) {
    const view = render("pt-BR", state, available);
    assert.equal(view.html, ""); assert.equal(view.calls(), 0);
  }
});

test("all four bindings receive the entire locale, never a PT/EN collapse", () => {
  const seen: unknown[] = [];
  const render = fixture({ getTouchlineAmbientAudioCopy: (locale) => {
    seen.push(locale);
    return { sound: "sound_SENTINEL", mute: "mute_SENTINEL", enable: "enable_SENTINEL", unavailable: "unavailable_SENTINEL" };
  } });
  const html = [render("ar-SA", "error"), render("es-ES", "starting")].map((view) => view.html).join("\n");
  assert.deepEqual(seen, ["ar-SA", "es-ES"]);
  for (const key of Object.keys(baseline["en-GB"])) assert.ok(html.includes(`${key}_SENTINEL`), key);
});

test("loop retirement preserves every unrelated provider lifecycle byte against the historical digest", () => {
  let provider = source.slice(source.indexOf("type AudioState"), source.indexOf("export function AuthAmbientAudio"));
  const current = "const source = TOUCHLINE_ARENA_ENTRY_VIDEO;";
  assert.equal(provider.split(current).length - 1, 1);
  assert.doesNotMatch(source, /TOUCHLINE_ARENA_LOOP_VIDEO|touchline-arena-loop-/);
  // Reverse only the owner-authorized source selection change. Consent, intro
  // claims, quiet-audio graph, suspension and cleanup retain the original hash.
  provider = provider.replace(current, 'const source = route === "entry" ? TOUCHLINE_ARENA_ENTRY_VIDEO : TOUCHLINE_ARENA_LOOP_VIDEO;');
  assert.equal(createHash("sha256").update(provider).digest("hex"), "6d368e51123fb213979c6a554f395674441b9773d3c912538249eb0e979a8f46");
});
