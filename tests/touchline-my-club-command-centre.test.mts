import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");
const owner = readFileSync(new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url), "utf8");

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

test("My Club opens the tactical field from a visible squad slot and keeps eligibility contextual", () => {
  assert.match(client, /View tactical layout/);
  assert.match(client, /Interactive tactical field/);
  assert.match(client, /const openTacticalSelector = \(slotId: string\)/);
  assert.match(client, /setSquadView\("tactical"\)/);
  assert.match(client, /onClick=\{\(\) => openTacticalSelector\(slot\.id\)\}/);
  assert.match(styles, /\.myClubCardRows\{display:grid/);
  assert.match(styles, /\.myClubCard\{display:block/);
  assert.match(styles, /\.myClubMarket\{display:grid/);
  assert.match(styles, /\.myClubCommandGrid\{display:grid/);
  assert.match(styles, /@media\(max-width:700px\).*?\.myClubCardRows\{grid-template-columns:repeat\(2/m);
});

test("My Club removes the ranking strip and puts factual wallet data directly after identity", () => {
  assert.doesNotMatch(owner, /club-owner-rank-deck/);
  assert.ok(owner.indexOf("</TouchlineSocialProfileHeader>") < owner.indexOf('className="club-owner-wallet"'));
  assert.ok(owner.indexOf('className="club-owner-wallet"') < owner.indexOf("<FantasyGameweekClient"));
  assert.match(owner, /walletBalanceTc === null/);
  assert.match(owner, /activeContractValueKnown/);
  assert.match(owner, /ownedContractCount === null/);
});
