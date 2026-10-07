import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  getTouchlineClubHubShareCopy,
  TOUCHLINE_CLUB_HUB_SHARE_CATALOGUES,
  TOUCHLINE_CLUB_HUB_SHARE_DRAFT_LOCALES,
  TOUCHLINE_CLUB_HUB_SHARE_DRAFT_STATUS,
} from "../lib/touchlineArena/club-hub-share-i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const expected = {
  "en-GB": { shared: "Shared", copied: "Post copied", unavailable: "Sharing unavailable", idle: "Share post" },
  "pt-BR": { shared: "Compartilhado", copied: "Link copiado", unavailable: "Compartilhamento indisponível", idle: "Compartilhar" },
  "es-ES": { shared: "Compartido", copied: "Enlace copiado", unavailable: "La opción de compartir no está disponible.", idle: "Compartir publicación" },
  "it-IT": { shared: "Condiviso", copied: "Link copiato", unavailable: "Condivisione non disponibile", idle: "Condividi post" },
  "fr-FR": { shared: "Partagé", copied: "Lien copié", unavailable: "Partage indisponible", idle: "Partager la publication" },
  "ar-SA": { shared: "تمت المشاركة", copied: "تم نسخ الرابط", unavailable: "المشاركة غير متاحة", idle: "مشاركة المنشور" },
  "tr-TR": { shared: "Paylaşıldı", copied: "Bağlantı kopyalandı", unavailable: "Paylaşım kullanılamıyor", idle: "Gönderiyi paylaş" },
  "de-DE": { shared: "Geteilt", copied: "Link kopiert", unavailable: "Teilen nicht verfügbar", idle: "Beitrag teilen" },
} as const;
type State = keyof typeof expected["en-GB"];

test("ClubHub sharing catalogue has exact eight-by-four feedback labels while drafts remain gated", () => {
  assert.deepEqual(TOUCHLINE_CLUB_HUB_SHARE_CATALOGUES, expected);
  assert.deepEqual(TOUCHLINE_CLUB_HUB_SHARE_DRAFT_LOCALES, locales.slice(2));
  assert.equal(TOUCHLINE_CLUB_HUB_SHARE_DRAFT_STATUS, "draft");
  for (const locale of locales.slice(2)) {
    assert.equal(isTouchLineLocaleComplete(locale), false);
    assert.deepEqual(getTouchlineClubHubShareCopy(locale), expected["en-GB"]);
  }
  assert.deepEqual(getTouchlineClubHubShareCopy("pt-BR"), expected["pt-BR"]);
  assert.deepEqual(getTouchlineClubHubShareCopy("invalid"), expected["en-GB"]);
});

function compileButton({ locale, state = "idle", future = false, result = "shared" }: {
  locale: string; state?: State; future?: boolean; result?: "shared" | "copied" | "unavailable" | "cancelled";
}) {
  const source = readFileSync(new URL("../components/touchline/club-hub/ClubHubShareButton.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, unknown> = {};
  const shareCalls: unknown[] = [], stateChanges: string[] = [], timers: Array<{ callback: () => void; delay: number }> = [];
  runInNewContext(output, {
    exports,
    window: { location: { href: "https://touchline.test/touchline-clubs/arsenal" }, setTimeout: (callback: () => void, delay: number) => { timers.push({ callback, delay }); return timers.length; } },
    require(name: string) {
      if (name === "react/jsx-runtime") return jsx;
      if (name === "react") return { useState: () => [state, (next: string) => stateChanges.push(next)] };
      if (name === "lucide-react") return { Check: () => null, Share2: () => null };
      if (name === "@/lib/touchlineArena/club-hub-share-i18n") return { getTouchlineClubHubShareCopy: (input: string) => future ? expected[input as keyof typeof expected] : getTouchlineClubHubShareCopy(input) };
      if (name === "@/lib/touchlineArena/social-native-share") return { shareTouchlinePost: async (payload: unknown) => { shareCalls.push(payload); return result; } };
      if (name === "./ClubHubPremiumPrototype.module.css") return { default: { shareButton: "shareButton" } };
      return assert.fail(`Unexpected dependency: ${name}`);
    },
  });
  return { Component: exports.default as (props: { title: string; text: string; postId?: string; imageUrl?: string; locale: string }) => ReturnType<typeof jsx.jsx>, shareCalls, stateChanges, timers };
}

test("real button keeps EN/PT feedback and a future isolated seam renders every draft state", () => {
  for (const locale of locales) for (const state of Object.keys(expected["en-GB"]) as State[]) {
    const real = compileButton({ locale, state });
    const realHtml = renderToStaticMarkup(real.Component({ title: "Arsenal", text: "Full time", locale }));
    const effective = locale === "pt-BR" ? "pt-BR" : "en-GB";
    assert.ok(realHtml.includes(expected[effective][state]));
    assert.match(realHtml, /aria-live="polite"/);

    const future = compileButton({ locale, state, future: true });
    const futureHtml = renderToStaticMarkup(future.Component({ title: "Arsenal", text: "Full time", locale }));
    assert.ok(futureHtml.includes(expected[locale][state]));
  }
});

test("share interaction preserves payload, cancellation, state transition and the existing two-second reset", async () => {
  for (const result of ["shared", "copied", "unavailable", "cancelled"] as const) {
    const fixture = compileButton({ locale: "pt-BR", result });
    const tree = fixture.Component({ title: "Arsenal", text: "Full time", postId: "post-1", imageUrl: "https://images.test/post.png", locale: "pt-BR" });
    await (tree.props as { onClick: () => Promise<void> }).onClick();
    assert.deepEqual(JSON.parse(JSON.stringify(fixture.shareCalls)), [{ title: "Arsenal", text: "Full time", postId: "post-1", imageUrl: "https://images.test/post.png", pageUrl: "https://touchline.test/touchline-clubs/arsenal" }]);
    if (result === "cancelled") {
      assert.deepEqual(fixture.stateChanges, []);
      assert.deepEqual(fixture.timers, []);
    } else if (result === "unavailable") {
      assert.deepEqual(fixture.stateChanges, ["unavailable"]);
      assert.deepEqual(fixture.timers, []);
    } else {
      assert.deepEqual(fixture.stateChanges, [result]);
      assert.equal(fixture.timers.length, 1);
      assert.equal(fixture.timers[0]!.delay, 2_000);
      fixture.timers[0]!.callback();
      assert.deepEqual(fixture.stateChanges, [result, "idle"]);
    }
  }
});
