import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("ClubHub preserves natural crest silhouettes without decorative circles", () => {
  const traceHost = source("components/touchline/ClubHubCrestTrace.tsx");
  const profile = source("app/touchline-clubs/[club]/page.tsx");
  const lineup = source("components/touchline/ClubHubOfficialLineup.tsx");
  const directory = source("app/touchline-clubs/page.tsx");
  const directoryCss = source("app/touchline-clubs/touchline-clubs.module.css");
  const perimeterTrace = source("components/touchline/TouchlineClubPerimeterTrace.tsx");
  const perimeterTraceCss = source("components/touchline/TouchlineClubPerimeterTrace.module.css");
  const profileCss = profile.slice(profile.indexOf(".club-hub-logo {"), profile.indexOf(".club-hub-honours {"));

  assert.doesNotMatch(traceHost, /TouchlineClubCrestPerimeterTrace|crest-trace/);
  assert.match(traceHost, /data-club-hub-crest-host="true"/);
  assert.match(traceHost, /data-touchline-card-crest-host="true"/);
  assert.match(traceHost, /--touchline-club-crest-color": accent/);
  assert.match(traceHost, /draggable=\{false\}/);
  assert.doesNotMatch(traceHost, /fetch\(|create(?:Admin)?Client|supabase|providers\/sportmonks|process\.env|mask|clip-path|filter:/i);

  assert.match(profile, /<ClubHubCrestTrace[\s\S]*?accent=\{club\.accent\}[\s\S]*?className="club-hub-logo"/);
  assert.match(profile, /<ClubHubOfficialLineup[\s\S]*?matchup=\{\{/);
  assert.match(lineup, /matchup\.home\.logoUrl && matchup\.home\.accent/);
  assert.match(lineup, /matchup\.away\.logoUrl && matchup\.away\.accent/);
  assert.match(lineup, /className=\{styles\.matchupCrest\}/);
  assert.match(directory, /<ClubHubCrestTrace[\s\S]*?accent=\{club\.accent\}[\s\S]*?className=\{styles\.logoWrap\}/);
  assert.match(directory, /<TouchlineClubPerimeterTrace accent=\{club\.accent\} className=\{styles\.clubCardTrace\}/);
  assert.match(perimeterTrace, /data-touchline-club-perimeter-trace="true"/);
  assert.match(perimeterTrace, /data-touchline-club-perimeter-trace-run="true"/);
  assert.doesNotMatch(perimeterTrace, /(?:width|height)="calc\(/);
  assert.match(perimeterTraceCss, /\.base,[\s\S]*?width: calc\(100% - 2px\)[\s\S]*?height: calc\(100% - 2px\)/);
  assert.match(perimeterTraceCss, /\.run \{[\s\S]*?stroke-dasharray: 12 88[\s\S]*?animation: touchlineClubEdgeTravel/);
  assert.doesNotMatch(directoryCss, /\.clubCard::after|mask-composite|conic-gradient/);

  assert.match(profileCss, /overflow: visible/);
  assert.match(profileCss, /isolation: isolate/);
  assert.doesNotMatch(profileCss, /mask|clip-path/);
});

test("ClubHub crest motion is bounded, pointer-safe and static under reduced motion", () => {
  const profile = source("app/touchline-clubs/[club]/page.tsx");
  const directoryCss = source("app/touchline-clubs/touchline-clubs.module.css");
  const perimeterTraceCss = source("components/touchline/TouchlineClubPerimeterTrace.module.css");
  const cardTraceCss = source("app/globals.css");

  assert.match(profile, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?translate3d\(0, -2px, 0\)/);
  assert.match(profile, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?translate3d\(0, -1px, 0\)/);
  assert.match(profile, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transform: none !important/);
  assert.match(directoryCss, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.clubCard:hover \.logoWrap/);
  assert.match(directoryCss, /\.clubCard:hover \.clubCardTrace[\s\S]*?--touchline-perimeter-speed: 2\.8s/);
  assert.match(directoryCss, /\.logoWrap \{[\s\S]*?width: clamp\(106px, 11\.7vw, 161px\)/);
  assert.match(directoryCss, /\.logoWrap img \{[\s\S]*?width: 78%[\s\S]*?height: 78%/);
  assert.match(directoryCss, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.clubCard:active \.logoWrap/);
  assert.match(perimeterTraceCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.run \{ animation: none; \}/);
  assert.match(directoryCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.clubCard:active \.logoWrap[\s\S]*?transform: none !important/);
  assert.doesNotMatch(cardTraceCss, /data-touchline-card-crest-trace/);
  assert.match(cardTraceCss, /\[data-touchline-card-crest-host="true"\] > img[\s\S]*?z-index: 1/);
  assert.doesNotMatch(directoryCss, /\.logoWrap \{[\s\S]*?border-radius:\s*50%|\.logoWrap \{[\s\S]*?radial-gradient\(circle/);
  assert.doesNotMatch(profile, /touch-action:\s*none/);
  assert.doesNotMatch(directoryCss, /touch-action:\s*none/);
});
