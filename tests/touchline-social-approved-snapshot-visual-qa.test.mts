import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/visual-qa/social-approved-snapshots/page.tsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("../app/visual-qa/social-approved-snapshots/preview-draft.ts", import.meta.url), "utf8");

test("standalone 041/042/043 review renders the new snapshot components without an outbound seam", () => {
  assert.match(page, /data-social-approved-snapshot-visual-qa="non-publishable"/);
  assert.match(page, /TouchlineSocialApprovedMatchPreviewDraft/);
  assert.match(page, /TouchlineSocialApprovedFinalScoreDraft/);
  assert.match(page, /TouchlineSocialApprovedGoalHatLayoutDemo/);
  assert.match(page, /process\.env\.VERCEL_ENV === "production"\) notFound\(\)/);
  assert.match(page, /assessTouchlineApprovedSocialSnapshot/);
  assert.doesNotMatch(page, /from "@\/lib\/touchlineArena\/social-.*executor/);
  assert.doesNotMatch(page, /from "@\/lib\/touchlineArena\/social-.*draft-server/);
  assert.match(preview, /checked-in visual-QA fixtures/);
  assert.doesNotMatch(preview, /from "@\/lib\/supabase/);
  assert.doesNotMatch(preview, /from "@\/lib\/touchlineArena\/social-.*draft-server/);
});
