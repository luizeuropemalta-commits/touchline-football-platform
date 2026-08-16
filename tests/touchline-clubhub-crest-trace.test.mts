import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("ClubHub reuses the stroke-only canonical crest trace for club identity only", () => {
  const traceHost = source("components/touchline/ClubHubCrestTrace.tsx");
  const profile = source("app/touchline-clubs/[club]/page.tsx");
  const directory = source("app/touchline-clubs/page.tsx");
  const directoryCss = source("app/touchline-clubs/touchline-clubs.module.css");
  const profileCss = profile.slice(profile.indexOf(".club-hub-logo {"), profile.indexOf(".club-hub-honours {"));

  assert.match(traceHost, /TouchlineClubCrestPerimeterTrace/);
  assert.match(traceHost, /data-club-hub-crest-trace-host="true"/);
  assert.match(traceHost, /data-touchline-card-crest-trace-host="true"/);
  assert.match(traceHost, /--touchline-club-crest-color": accent/);
  assert.match(traceHost, /draggable=\{false\}/);
  assert.doesNotMatch(traceHost, /fetch\(|create(?:Admin)?Client|supabase|providers\/sportmonks|process\.env|mask|clip-path|filter:/i);

  assert.match(profile, /<ClubHubCrestTrace[\s\S]*?accent=\{club\.accent\}[\s\S]*?className="club-hub-logo"/);
  assert.match(profile, /matchPreview\.home\.logoUrl && matchPreview\.home\.accent/);
  assert.match(profile, /matchPreview\.away\.logoUrl && matchPreview\.away\.accent/);
  assert.match(profile, /className="club-hub-fixture-crest"/);
  assert.match(directory, /<ClubHubCrestTrace[\s\S]*?accent=\{club\.accent\}[\s\S]*?className=\{styles\.logoWrap\}/);
  assert.match(directory, /<svg className=\{styles\.clubCardTrace\}[\s\S]*?<rect className=\{styles\.clubCardTraceRun\}/);
  assert.match(directoryCss, /\.clubCardTraceRun \{[\s\S]*?stroke-dasharray: 12 88[\s\S]*?animation: touchlineClubEdgeTravel 7s linear infinite/);
  assert.doesNotMatch(directoryCss, /\.clubCard::after|mask-composite|conic-gradient/);

  assert.match(profileCss, /overflow: visible/);
  assert.match(profileCss, /isolation: isolate/);
  assert.doesNotMatch(profileCss, /mask|clip-path/);
});

test("ClubHub crest motion is bounded, pointer-safe and static under reduced motion", () => {
  const profile = source("app/touchline-clubs/[club]/page.tsx");
  const directoryCss = source("app/touchline-clubs/touchline-clubs.module.css");
  const cardTraceCss = source("app/globals.css");

  assert.match(profile, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?translate3d\(0, -2px, 0\)/);
  assert.match(profile, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?translate3d\(0, -1px, 0\)/);
  assert.match(profile, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transform: none !important/);
  assert.match(directoryCss, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.clubCard:hover \.logoWrap/);
  assert.match(directoryCss, /\.clubCard:hover \.clubCardTraceRun[\s\S]*?animation-duration: 2\.8s/);
  assert.match(directoryCss, /\.logoWrap \{[\s\S]*?width: clamp\(106px, 11\.7vw, 161px\)/);
  assert.match(directoryCss, /\.logoWrap img \{[\s\S]*?width: 78%[\s\S]*?height: 78%/);
  assert.match(directoryCss, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.clubCard:active \.logoWrap/);
  assert.match(directoryCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.clubCardTraceRun \{ animation: none; \}/);
  assert.match(directoryCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.clubCard:active \.logoWrap[\s\S]*?transform: none !important/);
  assert.match(cardTraceCss, /\[data-touchline-card-crest-trace="true"\][\s\S]*?pointer-events: none/);
  assert.match(cardTraceCss, /\[data-touchline-card-crest-trace-run="true"\][\s\S]*?animation: touchline-card-perimeter-trace 8s/);
  assert.match(cardTraceCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-touchline-card-crest-trace-run="true"\][\s\S]*?animation: none !important/);
  assert.doesNotMatch(profile, /touch-action:\s*none/);
  assert.doesNotMatch(directoryCss, /touch-action:\s*none/);
});
