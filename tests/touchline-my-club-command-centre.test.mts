import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");
const owner = readFileSync(new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url), "utf8");

test("My Club renders a pitch-first command centre instead of the Gameweek wizard", () => {
  assert.match(client, /if \(embedded\) \{/);
  assert.match(client, /className=\{styles\.myClubCommand\}/);
  assert.match(client, /className=\{styles\.myClubCardRows\}/);
  assert.match(client, /<TouchlineGameweekCard card=\{card\} locale=\{locale\} displayWidth=\{116\}/);
  assert.match(client, /className=\{styles\.myClubMarket\}/);
  assert.match(client, /TRANSFER MARKET/);
  assert.match(client, /<MarketWindowClock gameweeks=\{gameweeks\} locale=\{locale\} \/>/);
  assert.match(client, /removePlayer\(selection!\.playerId\)/);
  assert.match(client, /replaceTouchlineFantasyPlayerAtSlot/);
  assert.ok(client.indexOf("if (embedded) {") < client.indexOf('className={styles.shell}'));
});

test("My Club opens the tactical field by default and keeps eligibility contextual", () => {
  assert.match(client, /useState<"squad" \| "tactical">\("tactical"\)/);
  assert.match(client, /View tactical layout/);
  assert.match(client, /Interactive tactical field/);
  assert.match(client, /const openTacticalSelector = \(slotId: string\)/);
  assert.match(client, /setSquadView\("tactical"\)/);
  assert.match(client, /onClick=\{\(\) => openTacticalSelector\(slot\.id\)\}/);
  assert.match(client, /<TouchlinePitchSurface boundaryTrace className=\{styles\.myClubTacticalPitch\}/);
  const embedded = client.slice(client.indexOf("if (embedded) {"), client.indexOf('className={styles.shell}'));
  assert.match(embedded, /<CompactClubSelector selectedTeamId=\{selectedPlayerClub\?\.teamId/);
  assert.match(embedded, /id="my-club-player-selection"/);
  assert.match(embedded, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(embedded, /displayWidth=\{56\}/);
  assert.match(embedded, /selectMyClubPlayer\(card\)/);
  assert.match(styles, /\.myClubCardRows\{display:grid/);
  assert.match(styles, /\.myClubCard\{display:block/);
  assert.match(styles, /\.myClubMarket\{display:grid/);
  assert.match(styles, /\.myClubMarketResults\{grid-template-columns:repeat\(2/);
  assert.match(styles, /\.myClubCommandGrid\{display:grid/);
  assert.match(styles, /data-touchline-pitch-boundary-run=true/);
  assert.match(styles, /data-touchline-card-neon-trace=true\]\{display:none/);
  assert.match(styles, /@media\(max-width:700px\).*?\.myClubCardRows\{grid-template-columns:repeat\(2/m);
});

test("My Club keeps ownership actions private and visitor follow controls separate", () => {
  assert.match(owner, /showPrivateClubControl \? <ClubOwnerAvatarUpload locale=\{locale\} \/> : <TouchlineSocialProfileActions/);
  assert.match(owner, /actionsPlacement=\{showPrivateClubControl \? "avatar" : "default"\}/);
});

test("My Club removes the ranking strip and puts factual wallet data directly after identity", () => {
  assert.doesNotMatch(owner, /club-owner-rank-deck/);
  assert.ok(owner.indexOf("</TouchlineSocialProfileHeader>") < owner.indexOf('className="club-owner-wallet"'));
  assert.ok(owner.indexOf('className="club-owner-wallet"') < owner.indexOf("<FantasyGameweekClient"));
  assert.match(owner, /walletBalanceTc === null/);
  assert.match(owner, /activeContractValueKnown/);
  assert.match(owner, /clubCopy\.xiCapacity[\s\S]{0,120}\{fantasySnapshot\?\.selections\.length \?\? 0\}\/11/);
  assert.match(owner, /ownedContractCount !== null && ownedContractCount > 11/);
  assert.match(owner, /contratos legados permanecem preservados|legacy contracts remain preserved/);
  assert.doesNotMatch(owner, /\$\{ownedContractCount\}\/35/);
});
