import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { matchCardLabel } from "../lib/touchlineFantasy/match-card-i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];

test("ordinary match cards have distinct yellow/red copy in every public locale", () => {
  for (const locale of locales) {
    const yellow = matchCardLabel("yellow", locale, true);
    const red = matchCardLabel("red", locale, true);
    assert.ok(yellow.length > 8, locale);
    assert.ok(red.length > 8, locale);
    assert.notEqual(yellow, red, locale);
    assert.equal(/5x|10x|suspens/i.test(`${yellow} ${red}`), false, locale);
  }
  assert.equal(matchCardLabel("yellow", "de-DE", false), matchCardLabel("yellow", "en-GB", false));
});

test("ClubOwner field alone receives the confirmed-match badge with tooltip affordances", () => {
  const client = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  const badge = readFileSync(new URL("../components/touchline/cards/TouchlineMatchCardBadge.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/touchline/cards/TouchlineMatchCardBadge.module.css", import.meta.url), "utf8");
  assert.match(client, /const matchCard = selection \? currentMatchCards/,
    "ClubOwner also uses marketPage; selected XI events must not be hidden by its layout mode");
  assert.match(client, /const currentMatchCards = live\?\.matchCardIndicators \?\? \[\];/,
    "failed live reads must not resurrect stale card events from the initial snapshot");
  assert.match(client, /<TouchlineMatchCardBadge kind=\{matchCard\.kind\}/);
  assert.match(badge, /aria-label=\{label\}/);
  assert.match(badge, /aria-expanded=\{open\}/);
  assert.match(badge, /onBlur=/);
  assert.match(badge, /aria-describedby=\{open \? tooltipId : undefined\}/);
  assert.match(badge, /role="tooltip"/);
  assert.match(css, /pointer-events:auto/);
  assert.match(badge, /createPortal/);
  assert.match(css, /\.anchor\[data-match-card=red\] \.card/);
});
