import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localizedPositionLabel } from "../lib/touchlineArena/position-labels.ts";
import { buildTouchlinePlayerCardZoomDetails } from "../lib/touchlineArena/card-zoom-details.ts";
import { isTouchLineLocaleComplete, TOUCHLINE_COMPLETE_LOCALES } from "../lib/touchlineArena/i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const ptBaseline = {
  attacker: "Atacante", forward: "Atacante", striker: "Centroavante", defender: "Defensor", goalkeeper: "Goleiro", midfielder: "Meio-campista", winger: "Ponta", player: "Jogador",
  st: "Centroavante", cf: "Atacante", lw: "Ponta esquerda", rw: "Ponta direita", df: "Defensor", mf: "Meio-campista", fw: "Atacante",
  am: "Meia ofensivo", cam: "Meia ofensivo", cm: "Meio-campista", dm: "Volante", cdm: "Volante", cb: "Zagueiro", lb: "Lateral esquerdo", rb: "Lateral direito", gk: "Goleiro",
  lm: "Meia pela esquerda", rm: "Meia pela direita", lwb: "Ala esquerdo", rwb: "Ala direito",
  "attacking midfield": "Meia ofensivo", "attacking midfielder": "Meia ofensivo", "central midfield": "Meio-campista", "central midfielder": "Meio-campista",
  "defensive midfield": "Volante", "defensive midfielder": "Volante", "left midfield": "Meia pela esquerda", "left midfielder": "Meia pela esquerda", "right midfield": "Meia pela direita", "right midfielder": "Meia pela direita",
  "left wing": "Ponta esquerda", "left winger": "Ponta esquerda", "right wing": "Ponta direita", "right winger": "Ponta direita", "left back": "Lateral esquerdo", "right back": "Lateral direito",
  "left wing back": "Ala esquerdo", "right wing back": "Ala direito", "centre back": "Zagueiro", "center back": "Zagueiro", "centre forward": "Centroavante", "center forward": "Centroavante", "second striker": "Segundo atacante", "goal keeper": "Goleiro",
};

test("eight position catalogues are explicit drafts while public getters preserve every EN/PT alias", async () => {
  const copy = await import("../lib/touchlineArena/position-labels.ts");
  assert.ok(copy.TOUCHLINE_POSITION_LABEL_CATALOGUES, "eight position catalogues are required");
  assert.deepEqual(Object.keys(copy.TOUCHLINE_POSITION_LABEL_CATALOGUES), locales);
  assert.deepEqual(copy.TOUCHLINE_POSITION_LABEL_DRAFT_LOCALES, locales.slice(2));
  assert.equal(copy.TOUCHLINE_POSITION_LABEL_DRAFT_STATUS, "draft");
  const keys = Object.keys(copy.TOUCHLINE_POSITION_LABEL_CATALOGUES["en-GB"]).sort();
  assert.equal(keys.length, 19);
  for (const locale of locales) {
    assert.deepEqual(Object.keys(copy.TOUCHLINE_POSITION_LABEL_CATALOGUES[locale]).sort(), keys);
    assert.ok(Object.values(copy.TOUCHLINE_POSITION_LABEL_CATALOGUES[locale]).every(value => typeof value === "string" && value.trim()));
  }
  for (const [alias, expected] of Object.entries(ptBaseline)) {
    assert.equal(localizedPositionLabel(alias, "pt-BR"), expected, alias);
    const normalizedVariant = ` ${alias.toUpperCase().replaceAll(" ", "_")} `;
    assert.equal(localizedPositionLabel(normalizedVariant, "pt-BR"), expected, normalizedVariant);
    for (const locale of ["en-GB", ...locales.slice(2), "pt", "unknown"]) assert.equal(localizedPositionLabel(normalizedVariant, locale), normalizedVariant);
  }
  assert.deepEqual(TOUCHLINE_COMPLETE_LOCALES, ["en-GB", "pt-BR"]);
  for (const locale of locales.slice(2)) assert.equal(isTouchLineLocaleComplete(locale), false);
});

test("explicit draft position selection exercises the real helper and real builder without publishing locales", () => {
  const expected = { "es-ES": "Portero", "it-IT": "Portiere", "fr-FR": "Gardien de but", "ar-SA": "حارس مرمى", "tr-TR": "Kaleci", "de-DE": "Torwart" };
  const translate = (value: string | null | undefined, locale: string) => localizedPositionLabel(value, locale, true);
  for (const [locale, label] of Object.entries(expected)) {
    for (const alias of ["Goalkeeper", "GK", "Goal_Keeper"]) assert.equal(translate(alias, locale), label);
    const input = Object.freeze({ locale, name: "Canonical Player $&", clubName: "TouchLine ClubHub", position: "GK", positionKind: "goalkeeper" as const, nationality: "ENG", profileHref: "/player?keep=value#profile" });
    const details = buildTouchlinePlayerCardZoomDetails({ ...input, draftLocalesEnabled: true });
    assert.equal(details.subtitle, `TouchLine ClubHub · ${label}`);
    assert.equal(details.fields.find(field => field.icon === "player-identity-position")?.value, label);
    assert.equal(details.fields.find(field => field.icon === "player-identity-nationality")?.value, "ENG");
    assert.equal(details.positionKind, "goalkeeper"); assert.equal(input.position, "GK");
    assert.equal(details.title, input.name); assert.equal(details.profileHref, input.profileHref);
    for (const value of [null, undefined, "", "Unverified Role", "constructor", "toString", "__proto__", "TouchLine", "ClubOwner", "ClubHub", "Market Transfer", "TouchLine Cards League", "TouchLine Verified", "Erling Haaland", "ENG"]) assert.equal(translate(value, locale), value);
  }
  for (const locale of ["pt", "unknown", "ar"]) {
    assert.equal(localizedPositionLabel("GK", locale, true), localizedPositionLabel("GK", locale));
  }
});

test("Portuguese full provider positions and pitch abbreviations remain presentation-only", () => {
  for (const [original, expected] of [
    ["Attacking Midfield", "Meia ofensivo"], ["Central Midfield", "Meio-campista"],
    ["Defensive Midfield", "Volante"], ["Centre-Back", "Zagueiro"],
    ["Left-Back", "Lateral esquerdo"], ["Right-Back", "Lateral direito"],
    ["Left Winger", "Ponta esquerda"], ["Right Winger", "Ponta direita"],
    ["Centre-Forward", "Centroavante"], ["Goalkeeper", "Goleiro"],
    ["CAM", "Meia ofensivo"], ["RWB", "Ala direito"],
  ]) {
    assert.equal(localizedPositionLabel(original, "pt-BR"), expected);
    assert.equal(localizedPositionLabel(original, "en-GB"), original);
  }
  for (const unknown of [null, undefined, "", "Unverified Role", "Meia ofensivo"]) {
    assert.equal(localizedPositionLabel(unknown, "pt-BR"), unknown);
  }
});
test("shared card zoom and full profile use the same localised position without mutating identity", () => {
  const input = Object.freeze({ locale: "pt-BR", name: "Rayan Cherki", clubName: "Manchester City", position: "Attacking Midfield" });
  const details = buildTouchlinePlayerCardZoomDetails(input);
  assert.equal(details.subtitle, "Manchester City · Meia ofensivo");
  assert.equal(details.fields?.find(field => field.label === "Posição")?.value, "Meia ofensivo");
  assert.equal(input.position, "Attacking Midfield");
  const page = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /import \{ localizedPositionLabel \} from "@\/lib\/touchlineArena\/position-labels"/);
  assert.doesNotMatch(page, /const ptPositionLabels/);
});

test("ClubHub squad captions use the same position labels as the profile and zoom", () => {
  const grid = readFileSync(new URL("../components/touchline/ClubHubSquadGrid.tsx", import.meta.url), "utf8");
  assert.ok(grid.includes("localizedPositionLabel(card.position, locale, draftLocalesEnabled)"), "squad caption must use the shared presentation-only formatter");
  assert.doesNotMatch(grid, /function localizedPosition\(/);
});

test("both dedicated ranking summaries localise positions without changing data inputs", () => {
  const page = readFileSync(new URL("../app/touchline-player-card-rankings/page.tsx", import.meta.url), "utf8");
  assert.equal(page.match(/localizedPositionLabel\(card\.position, locale, draftLocalesEnabled\)/g)?.length, 2);
  assert.match(page, /position: card\.position,/);
});
