import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");

test("My Club renders a collection-first command centre instead of the Gameweek wizard", () => {
  assert.match(client, /if \(embedded\) \{/);
  assert.match(client, /className=\{styles\.myClubCommand\}/);
  assert.match(client, /className=\{styles\.myClubCardRows\}/);
  assert.match(client, /<TouchlineGameweekCard card=\{card\} locale=\{locale\} displayWidth=\{116\}/);
  assert.match(client, /className=\{styles\.myClubMarket\}/);
  assert.match(client, /Only compatible cards appear here/);
  assert.match(client, /removePlayer\(selection!\.playerId\)/);
  assert.match(client, /replaceTouchlineFantasyPlayerAtSlot/);
  assert.ok(client.indexOf("if (embedded) {") < client.indexOf('className={styles.shell}'));
});

test("My Club command centre keeps cards premium and the tactical pitch optional", () => {
  assert.match(client, /View tactical layout/);
  assert.match(client, /Optional tactical view/);
  assert.match(styles, /\.myClubCardRows\{display:grid/);
  assert.match(styles, /\.myClubCard\{display:block/);
  assert.match(styles, /\.myClubMarket\{display:grid/);
  assert.match(styles, /\.myClubCommandGrid\{display:grid/);
  assert.match(styles, /@media\(max-width:700px\).*?\.myClubCardRows\{grid-template-columns:repeat\(2/m);
});
