import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const trackerSource = fs.readFileSync(
  new URL("../components/touchline-activity-tracker.tsx", import.meta.url),
  "utf8",
);

test("activity tracking does not load Supabase in the exact QA read-only surface", () => {
  assert.doesNotMatch(trackerSource, /^import \{ createClient \} from "@\/lib\/supabase\/client";/m);
  assert.match(
    trackerSource,
    /const isQaReadOnly = searchParams\.get\("qaReadOnly"\) === "1"\s*&& typeof window !== "undefined"\s*&& window\.location\.hostname\.toLowerCase\(\) === TOUCHLINE_QA_HOSTNAME;/,
  );
  assert.match(
    trackerSource,
    /if \(isQaReadOnly \|\| !area \|\| !canStartTouchlineAnalyticsTracking\(/,
  );
  assert.match(
    trackerSource,
    /const \{ createClient \} = await import\("@\/lib\/supabase\/client"\);/,
  );
});
