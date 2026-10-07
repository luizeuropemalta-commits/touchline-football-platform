import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { touchlineCoachRankingClubLogo } from '../lib/touchlineArena/coach-ranking-club.ts';
import { getTouchlineTablesPresentationCopy } from '../lib/touchlineArena/tables-presentation-i18n.ts';

const source = readFileSync(new URL('../app/rankings/touchline-tables-client.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/rankings/touchline-tables.module.css', import.meta.url), 'utf8');
const rows = source.slice(source.indexOf('{topSevenCoaches.map((coach)'), source.indexOf('</ol> : <RankingPending', source.indexOf('{topSevenCoaches.map((coach)')));

test('Top 7 resolves the club by coach identity and suppresses a crest contradicting the snapshot', () => {
  assert.match(rows, /touchlineCoachRankingClubLogo\(coach\.coachProviderId, coach\.clubName\)/);
  assert.match(rows, /coachClubLogoUrl \? <Image src=\{coachClubLogoUrl\} alt=""/);
  assert.match(rows, /<span>\{coach\.clubName\}<\/span>/);
  assert.match(rows, /touchlineCoachRankingGem\(coach\.rank\)/);
  assert.match(rows, /\{coach\.touchlinePoints\}/);
});

test('approved short and full club names retain the four real missing crests', () => {
  for (const [id, name, asset] of [
    ['307', 'Arsenal', 'arsenal'],
    ['19960388', 'Liverpool', 'liverpool'],
    ['255', 'Brentford', 'brentford'],
    ['455355', 'Everton', 'everton'],
  ]) {
    const expected = `/touchlineArena/shared/club-logos/2026-27/ui-512/${asset}.png`;
    assert.equal(touchlineCoachRankingClubLogo(id, name), expected);
    assert.equal(touchlineCoachRankingClubLogo(id, `${name} FC`), expected);
  }
});

test('a mismatched or unknown club or coach cannot supply a crest', () => {
  assert.equal(touchlineCoachRankingClubLogo('307', 'Liverpool'), null);
  assert.equal(touchlineCoachRankingClubLogo('unknown', 'Arsenal'), null);
  assert.equal(touchlineCoachRankingClubLogo('307', 'Unknown Arsenal'), null);
  assert.equal(touchlineCoachRankingClubLogo('307', ''), null);
});

test('Top 7 retains separate localized result labels and a panel-width fallback', () => {
  for (const [pt, en, field, shortPt, shortEn] of [
    ['Vitórias', 'Wins', 'wins', 'V', 'W'],
    ['Empates', 'Draws', 'draws', 'E', 'D'],
    ['Derrotas', 'Losses', 'losses', 'D', 'L'],
  ]) {
    assert.ok(rows.includes(`aria-label={presentationCopy.${field}}`));
    assert.ok(rows.includes(`{presentationCopy.${field}Short}</abbr></dt><dd>{coach.${field}}</dd>`));
    for (const [locale, full, short] of [["pt-BR", pt, shortPt], ["en-GB", en, shortEn]]) {
      const copy = getTouchlineTablesPresentationCopy(locale) as Record<string, string>;
      assert.equal(copy[field], full);
      assert.equal(copy[`${field}Short`], short);
    }
  }
  assert.match(css, /container: coach-ranking \/ inline-size/);
  assert.match(css, /@container coach-ranking \(max-width: 440px\)/);
  assert.match(css, /\.coachRecord \{ grid-column: 3 \/ 5; grid-row: 2; width: min\(100%, 108px\)/);
  assert.match(css, /\.coachList \.pointsValue \{ margin-inline-end: 10px/);
});
