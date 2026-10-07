import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  getTouchlineClubHubLikeCopy,
  TOUCHLINE_CLUB_HUB_LIKE_CATALOGUES,
  TOUCHLINE_CLUB_HUB_LIKE_DRAFT_LOCALES,
  TOUCHLINE_CLUB_HUB_LIKE_DRAFT_STATUS,
} from "../lib/touchlineArena/club-hub-like-i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const expected = {
  "en-GB": { like: "Like post", unlike: "Unlike post", liked: "Liked" },
  "pt-BR": { like: "Curtir publicação", unlike: "Descurtir publicação", liked: "Curtido" },
  "es-ES": { like: "Me gusta", unlike: "Ya no me gusta", liked: "Te gusta" },
  "it-IT": { like: "Mi piace", unlike: "Non mi piace più", liked: "Ti piace" },
  "fr-FR": { like: "J’aime", unlike: "Je n’aime plus", liked: "Aimé" },
  "ar-SA": { like: "أعجبني", unlike: "إزالة الإعجاب", liked: "أعجبك" },
  "tr-TR": { like: "Beğen", unlike: "Beğenmekten vazgeç", liked: "Beğenildi" },
  "de-DE": { like: "Gefällt mir", unlike: "Gefällt mir nicht mehr", liked: "Gefällt dir" },
} as const;

test("ClubHub like catalogue has exact eight-by-three labels while drafts remain gated", () => {
  assert.deepEqual(TOUCHLINE_CLUB_HUB_LIKE_CATALOGUES, expected);
  assert.deepEqual(TOUCHLINE_CLUB_HUB_LIKE_DRAFT_LOCALES, locales.slice(2));
  assert.equal(TOUCHLINE_CLUB_HUB_LIKE_DRAFT_STATUS, "draft");
  for (const locale of locales.slice(2)) {
    assert.equal(isTouchLineLocaleComplete(locale), false);
    assert.deepEqual(getTouchlineClubHubLikeCopy(locale), expected["en-GB"]);
  }
  assert.deepEqual(getTouchlineClubHubLikeCopy("pt-BR"), expected["pt-BR"]);
  assert.deepEqual(getTouchlineClubHubLikeCopy("invalid"), expected["en-GB"]);
});

function compileButton({ locale, liked, future = false }: { locale: string; liked: boolean; future?: boolean }) {
  const source = readFileSync(new URL("../components/touchline/club-hub/ClubHubLikeButton.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, unknown> = {};
  const stateChanges: boolean[] = [];
  runInNewContext(output, {
    exports,
    require(name: string) {
      if (name === "react/jsx-runtime") return jsx;
      if (name === "react") return { useState: () => [liked, (next: boolean | ((current: boolean) => boolean)) => stateChanges.push(typeof next === "function" ? next(liked) : next)] };
      if (name === "lucide-react") return { Heart: (props: Record<string, unknown>) => jsx.jsx("svg", props) };
      if (name === "@/lib/touchlineArena/club-hub-like-i18n") return { getTouchlineClubHubLikeCopy: (input: string) => future ? expected[input as keyof typeof expected] : getTouchlineClubHubLikeCopy(input) };
      if (name === "./ClubHubPremiumPrototype.module.css") return { default: { likeButton: "likeButton", likedButton: "likedButton" } };
      return assert.fail(`Unexpected dependency: ${name}`);
    },
  });
  return { Component: exports.default as (props: { locale?: string }) => ReturnType<typeof jsx.jsx>, stateChanges };
}

test("real button keeps EN/PT while a future isolated seam renders the exact like states", () => {
  for (const locale of locales) for (const liked of [false, true]) {
    const real = compileButton({ locale, liked });
    const realHtml = renderToStaticMarkup(real.Component({ locale }));
    const effective = locale === "pt-BR" ? "pt-BR" : "en-GB";
    assert.ok(realHtml.includes(liked ? expected[effective].liked : expected[effective].like));
    assert.ok(realHtml.includes(`aria-label="${liked ? expected[effective].unlike : expected[effective].like}"`));
    assert.ok(realHtml.includes(`aria-pressed="${liked}"`));

    const future = compileButton({ locale, liked, future: true });
    const futureHtml = renderToStaticMarkup(future.Component({ locale }));
    assert.ok(futureHtml.includes(liked ? expected[locale].liked : expected[locale].like));
    assert.ok(futureHtml.includes(`aria-label="${liked ? expected[locale].unlike : expected[locale].like}"`));
  }
});

test("copy binding preserves the local toggle, aria-pressed and Heart fill semantics", () => {
  for (const liked of [false, true]) {
    const fixture = compileButton({ locale: "pt-BR", liked });
    const tree = fixture.Component({ locale: "pt-BR" });
    const props = tree.props as { "aria-pressed": boolean; onClick: () => void; children: [ReturnType<typeof jsx.jsx>, string] };
    assert.equal(props["aria-pressed"], liked);
    assert.equal(props.children[0].props.fill, liked ? "currentColor" : "none");
    assert.equal(props.children[1], liked ? expected["pt-BR"].liked : expected["pt-BR"].like);
    props.onClick();
    assert.deepEqual(fixture.stateChanges, [!liked]);
  }
});
