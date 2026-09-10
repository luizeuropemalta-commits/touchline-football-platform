import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/visual-qa/social-match-preview/page.tsx", import.meta.url), "utf8");
const fixture = readFileSync(new URL("../app/visual-qa/social-match-preview/preview-draft.ts", import.meta.url), "utf8");

test("041 local visual QA fixture is explicit, deterministic and non-publishable", () => {
  assert.match(page, /params\.design === "1"/);
  assert.match(page, /data-match-preview-visual-qa="non-publishable"/);
  assert.match(page, /LOCAL VISUAL QA · FROZEN CANONICAL SNAPSHOT · NOT PUBLISHED/);
  assert.match(page, /readTouchlineMatchPreviewVisualQaPreview/);
  assert.match(page, /The crown stays absent unless a unique explicit leader is supplied by a live ranking\./);
  assert.match(fixture, /readClubHubNextFixturePreview/);
  assert.match(fixture, /no credential, network, analytics or write dependency/);
  assert.doesNotMatch(fixture, /createAdminClient|fetch\(|touchline-analytics|insert\(|update\(|delete\(/);
});
