import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { normalizePlayerSocialSubject, requestPlayerSocial } from "../lib/touchlineArena/player-social-client.ts";
import type { PlayerSocialSummary } from "../lib/touchlineArena/player-social-contract.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": { interactionsWith: "Interactions with {playerName}", follow: "Follow", following: "Following", like: "Like", liked: "Liked", loading: "Loading interactions…", saving: "Saving…", error: "Interactions unavailable. No confirmation received.", signedOut: "Sign in with TouchLine access to interact.", saved: "Interactions saved to your account.", checkAgain: "Check again", signIn: "Sign in to TouchLine", contractPlayer: "Contract player" },
  "pt-BR": { interactionsWith: "Interações com {playerName}", follow: "Seguir", following: "Seguindo", like: "Curtir", liked: "Curtiu", loading: "Carregando interações…", saving: "Salvando…", error: "Interações indisponíveis. Nenhuma confirmação recebida.", signedOut: "Entre em uma conta com acesso à TouchLine para interagir.", saved: "Interações salvas na sua conta.", checkAgain: "Consultar novamente", signIn: "Entrar na TouchLine", contractPlayer: "Contratar jogador" },
};
const draftContractPlayerLabels = {
  "es-ES": "Contratar jugador", "it-IT": "Ingaggia giocatore", "fr-FR": "Recruter le joueur",
  "ar-SA": "التعاقد مع اللاعب", "tr-TR": "Oyuncuyu kadroya kat", "de-DE": "Spieler verpflichten",
} as const;
type Phase = "loading" | "ready" | "saving" | "error" | "signed-out";
type CopyModule = typeof import("../lib/touchlineArena/player-social-i18n.ts");
const source = readFileSync(new URL("../components/touchline/social/TouchlinePlayerSocialActions.tsx", import.meta.url), "utf8");

// Actual component/JSX and request client. React state snapshots, browser
// effects, artwork and HTTP are controlled boundaries; not browser proof.
function render(input: { locale?: string; phase?: Phase; summary?: PlayerSocialSummary | null; canReact?: boolean; providerId?: string; purchaseHref?: string; purchaseLabel?: string; copy?: Partial<CopyModule>; fetcher?: typeof fetch } = {}) {
  const values: unknown[] = [input.summary ?? null, input.canReact ?? false, input.phase ?? "loading", 0];
  const setters: { index: number; value: unknown }[] = [];
  const buttons: Record<string, unknown>[] = [];
  const requests: { providerId: string; mutation: unknown }[] = [];
  const publications: string[] = [];
  let stateIndex = 0; let refIndex = 0;
  const capture = (factory: typeof jsxRuntime.jsx) => (type: unknown, props: Record<string, unknown>, key?: string) => {
    if (type === "button") buttons.push(props);
    return factory(type as React.ElementType, props, key);
  };
  const modules: Record<string, unknown> = {
    react: { ...React, useEffect: () => {}, useRef: (current: unknown) => ({ current: ++refIndex === 4 ? true : current }), useState: () => { const index = stateIndex++; return [values[index], (value: unknown) => setters.push({ index, value })]; } },
    "react/jsx-runtime": { ...jsxRuntime, jsx: capture(jsxRuntime.jsx), jsxs: capture(jsxRuntime.jsxs) },
    "lucide-react": { Heart: () => null, UserPlus: () => null },
    "@/lib/touchlineArena/player-social-client": { normalizePlayerSocialSubject, requestPlayerSocial: (providerId: string, options: Parameters<typeof requestPlayerSocial>[1]) => {
      requests.push({ providerId, mutation: options.mutation });
      return requestPlayerSocial(providerId, { ...options, fetcher: input.fetcher ?? (async () => { throw new Error("Unexpected HTTP"); }) });
    } },
    "@/lib/touchlineArena/player-social-invalidation": { playerSocialInvalidation: { publish: (id: string) => publications.push(id) } },
    "@/lib/touchlineArena/player-social-i18n": input.copy,
    "./TouchlineSocial.module.css": { default: { profileActions: "profileActions" } },
    "./TouchlinePlayerSocialActions.module.css": { default: { toolbar: "toolbar", actions: "actions", status: "status", retry: "retry" } },
  };
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Error, AbortController, Intl, setTimeout, clearTimeout,
    require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
  });
  const html = renderToStaticMarkup(React.createElement(exports.default!, { providerId: input.providerId ?? "123", playerName: "Player <&> $&", locale: input.locale ?? "en-GB", purchaseHref: input.purchaseHref, purchaseLabel: input.purchaseLabel }));
  return { html, buttons, requests, setters, publications };
}

test("consumer forwards complete locale to all presentation helpers instead of keeping inline text", () => {
  const seen: string[] = [];
  const output = render({ locale: "ar-SA", copy: {
    getTouchlinePlayerSocialCopy: (locale) => { seen.push(`copy:${locale}`); return { ...baseline["en-GB"], follow: "FOLLOW_SENTINEL", like: "LIKE_SENTINEL", loading: "LOADING_SENTINEL" }; },
    formatTouchlinePlayerSocialAria: (name, locale) => { seen.push(`aria:${locale}`); assert.equal(name, "Player <&> $&"); return "ARIA_SENTINEL"; },
    formatTouchlinePlayerSocialCount: (value, locale) => { seen.push(`count:${locale}`); assert.equal(value, undefined); return "COUNT_SENTINEL"; },
  } });
  for (const value of ["FOLLOW_SENTINEL", "LIKE_SENTINEL", "LOADING_SENTINEL", "ARIA_SENTINEL", "COUNT_SENTINEL"]) assert.ok(output.html.includes(value), value);
  assert.deepEqual(seen, ["copy:ar-SA", "aria:ar-SA", "count:ar-SA", "count:ar-SA"]);
  assert.deepEqual(output.requests, []);
});

test("thirteen labels preserve EN/PT, protected product, eight catalogues and six closed draft gates", async () => {
  const copy = await import("../lib/touchlineArena/player-social-i18n.ts");
  const all = copy.TOUCHLINE_PLAYER_SOCIAL_CATALOGUES;
  assert.deepEqual(Object.keys(all), locales);
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(all[locale], baseline[locale]);
  for (const locale of locales) {
    assert.deepEqual(Object.keys(all[locale]).sort(), Object.keys(baseline["en-GB"]).sort());
    assert.ok(Object.values(all[locale]).every((value) => value.trim().length > 0));
    assert.equal(all[locale].interactionsWith.split("{playerName}").length, 2);
    assert.match(all[locale].signIn, /TouchLine/); assert.match(all[locale].signedOut, /TouchLine/);
    assert.doesNotMatch(JSON.stringify(all[locale]), /Arena/);
  }
  assert.deepEqual(copy.TOUCHLINE_PLAYER_SOCIAL_DRAFT_LOCALES, locales.slice(2));
  assert.equal(copy.TOUCHLINE_PLAYER_SOCIAL_DRAFT_STATUS, "draft");
  for (const locale of [...locales.slice(2), "bad", "pt", "", null, undefined]) assert.equal(copy.getTouchlinePlayerSocialCopy(locale), all["en-GB"]);
  assert.equal(copy.getTouchlinePlayerSocialCopy("pt-BR"), all["pt-BR"]);
  assert.equal(copy.formatTouchlinePlayerSocialAria("A $& <&>", "pt-BR"), "Interações com A $& <&>");
});

test("counter keeps unavailable distinct from zero and exact EN/PT compact formatting", async () => {
  const copy = await import("../lib/touchlineArena/player-social-i18n.ts");
  for (const locale of locales) {
    assert.equal(copy.formatTouchlinePlayerSocialCount(undefined, locale), "—");
    assert.equal(copy.formatTouchlinePlayerSocialCount(0, locale), "0");
    for (const value of [1, 1234, 1000000, Number.MAX_SAFE_INTEGER]) assert.equal(copy.formatTouchlinePlayerSocialCount(value, locale), new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value));
  }
});

test("actual rendered states preserve ARIA, unknown counts, exact totals, pressed flags and login link", async () => {
  const copy = await import("../lib/touchlineArena/player-social-i18n.ts");
  const phaseKey = { loading: "loading", ready: "saved", saving: "saving", error: "error", "signed-out": "signedOut" } as const;
  for (const locale of ["en-GB", "pt-BR"] as const) for (const phase of Object.keys(phaseKey) as Phase[]) for (const active of [false, true]) {
    const summary = phase === "error" || phase === "loading" ? null : { followerCount: 0, likeCount: 1234, following: active, liked: active };
    const output = render({ copy, locale, phase, summary, canReact: phase === "ready" });
    const text = baseline[locale];
    assert.ok(output.html.includes(text[phaseKey[phase]]));
    assert.ok(output.html.includes(`>${active && summary ? text.following : text.follow}<`));
    assert.ok(output.html.includes(`>${active && summary ? text.liked : text.like}<`));
    assert.match(output.html, /role="status"/);
    assert.match(output.html, /Player &lt;&amp;&gt; \$&amp;/);
    assert.equal(output.buttons[0].disabled, phase !== "ready");
    assert.equal(output.buttons[1]["aria-pressed"], Boolean(active && summary));
    assert.ok(output.html.includes(`aria-busy="${phase === "loading" || phase === "saving"}"`));
    if (summary) { assert.match(output.html, /title="0">0</); assert.match(output.html, /title="1234"/); }
    else assert.equal((output.html.match(/<strong>—<\/strong>/g) ?? []).length, 2);
    if (phase === "signed-out") assert.ok(output.html.includes(`/login?lang=${locale}`));
    if (phase === "error") { assert.ok(output.html.includes(text.checkAgain)); assert.ok(!output.html.includes(text.saved)); }
    assert.deepEqual(output.requests, []);
  }
});

test("all draft copy can reach real JSX through catalogue seam without opening public gate", async () => {
  const actual = await import("../lib/touchlineArena/player-social-i18n.ts");
  for (const locale of locales) {
    const catalogue = actual.TOUCHLINE_PLAYER_SOCIAL_CATALOGUES[locale];
    const copy = { ...actual, getTouchlinePlayerSocialCopy: () => catalogue, formatTouchlinePlayerSocialAria: (name: string) => catalogue.interactionsWith.replace("{playerName}", () => name) };
    for (const phase of ["loading", "ready", "saving", "error", "signed-out"] as const) {
      const output = render({ copy, locale, phase, purchaseHref: "/clubowner?fixture=preserved" });
      assert.match(output.html, /role="status"/);
      for (const text of [catalogue.follow, catalogue.like, phase === "ready" ? catalogue.saved : phase === "signed-out" ? catalogue.signedOut : catalogue[phase]]) assert.ok(output.html.includes(text), `${locale}/${phase}/${text}`);
      if (locale in draftContractPlayerLabels) assert.equal(catalogue.contractPlayer, draftContractPlayerLabels[locale as keyof typeof draftContractPlayerLabels]);
      assert.ok(output.html.includes(catalogue.contractPlayer), `${locale}/contractPlayer`);
    }
  }
});

test("actual click handlers retain canonical mutations, confirmed publication and uncertain-response failure", async () => {
  const copy = await import("../lib/touchlineArena/player-social-i18n.ts");
  for (const locale of ["en-GB", "pt-BR"]) for (const kind of ["follow", "like"] as const) for (const acknowledged of [true, false]) {
    const summary = { followerCount: 0, likeCount: 0, following: false, liked: false };
    const output = render({ copy, locale, phase: "ready", summary, canReact: true, fetcher: async (_url, init) => {
      assert.equal(init?.method, "PUT"); assert.deepEqual(JSON.parse(String(init.body)), { kind, active: true });
      return Response.json(acknowledged ? { ok: true, data: { ...summary, following: kind === "follow", liked: kind === "like" }, canReact: true } : { ok: false });
    } });
    (output.buttons[kind === "follow" ? 0 : 1].onClick as () => void)();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(output.requests.length, 1); assert.equal(output.requests[0].providerId, "123");
    assert.deepEqual(output.publications, acknowledged ? ["123"] : []);
    assert.equal(output.setters.filter(({ index }) => index === 2).at(-1)?.value, acknowledged ? "ready" : "error");
    if (!acknowledged) assert.ok(output.setters.some(({ index, value }) => index === 0 && value === null));
  }
});

test("unavailable and saving states never mutate; retry and commercial fallbacks remain unchanged", async () => {
  const copy = await import("../lib/touchlineArena/player-social-i18n.ts");
  for (const phase of ["loading", "saving", "error", "signed-out"] as const) {
    const output = render({ copy, phase });
    (output.buttons[0].onClick as () => void)();
    assert.deepEqual(output.requests, []);
    if (phase === "error") { (output.buttons[2].onClick as () => void)(); assert.ok(output.setters.some(({ index, value }) => index === 2 && value === "loading")); assert.ok(output.setters.some(({ index, value }) => index === 3 && typeof value === "function")); }
  }
  assert.equal(render({ copy, providerId: "bad" }).html, "");
  for (const providerId of ["bad", "123"]) for (const locale of ["en-GB", "pt-BR"]) {
    const output = render({ copy, providerId, locale, purchaseHref: "/unchanged?ref=%26" });
    assert.ok(output.html.includes(locale === "pt-BR" ? "Contratar jogador" : "Contract player"));
    assert.ok(output.html.includes('href="/unchanged?ref=%26"'));
    assert.ok(render({ copy, providerId, locale, purchaseHref: "/unchanged", purchaseLabel: "OWNER LABEL" }).html.includes("OWNER LABEL"));
  }
});
