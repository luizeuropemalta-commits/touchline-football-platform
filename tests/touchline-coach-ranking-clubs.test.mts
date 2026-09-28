import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../app/touchline-tables/touchline-tables-client.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/touchline-tables/touchline-tables.module.css', import.meta.url), 'utf8');
const rows = source.slice(source.indexOf('{topSevenCoaches.map((coach)'), source.indexOf('</ol> : <RankingPending', source.indexOf('{topSevenCoaches.map((coach)')));

test('Top 7 resolves the club by coach identity and suppresses a crest contradicting the snapshot', () => {
  assert.match(rows, /touchlineLiveCoachForProviderId\(coach\.coachProviderId\)/);
  assert.match(rows, /TOUCHLINE_ENGLAND_CLUBS\.find\(\(club\) => club\.teamId === coachIdentity\.coach\.teamId\)/);
  assert.match(rows, /coachClub\?\.name === coach\.clubName \? coachClub\.logoUrl : null/);
  assert.match(rows, /coachClubLogoUrl \? <Image src=\{coachClubLogoUrl\} alt=""/);
  assert.match(rows, /<span>\{coach\.clubName\}<\/span>/);
  assert.match(rows, /touchlineCoachRankingGem\(coach\.rank\)/);
  assert.match(rows, /\{coach\.touchlinePoints\}/);
});

test('Top 7 retains separate localized result labels and a panel-width fallback', () => {
  for (const [pt, en, field, shortPt, shortEn] of [
    ['Vitórias', 'Wins', 'wins', 'V', 'W'],
    ['Empates', 'Draws', 'draws', 'E', 'D'],
    ['Derrotas', 'Losses', 'losses', 'D', 'L'],
  ]) {
    assert.ok(rows.includes(`aria-label={isPortuguese ? "${pt}" : "${en}"}`));
    assert.ok(rows.includes(`{isPortuguese ? "${shortPt}" : "${shortEn}"}</abbr></dt><dd>{coach.${field}}</dd>`));
  }
  assert.match(css, /container: coach-ranking \/ inline-size/);
  assert.match(css, /@container coach-ranking \(max-width: 440px\)/);
  assert.match(css, /\.coachRecord \{ grid-column: 3 \/ 5; grid-row: 2; width: min\(100%, 108px\)/);
  assert.match(css, /\.coachList \.pointsValue \{ margin-inline-end: 10px/);
});
