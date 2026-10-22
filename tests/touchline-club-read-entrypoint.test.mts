import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("collection read entrypoint stays independent from purchase and catalogue loading", () => {
  const entry = read("app/api/touchline-fantasy/collection/read/route.ts");
  assert.match(entry, /export \{ GET \} from "@\/lib\/touchlineFantasy\/club-collection-read-handler"/);
  assert.match(entry, /dynamic = "force-dynamic"/);
  const handler = read("lib/touchlineFantasy/club-collection-read-handler.ts");
  assert.doesNotMatch(handler, /loadTouchlineFantasyReadSnapshot|purchaseClubPlayer|club-acquisition-service/);
  assert.match(handler, /client\.auth\.getUser\(\)/);
  assert.match(handler, /readClubCollectionServer\(user\.id, mark\)/);
  const reader = read("lib/touchlineFantasy/club-collection-read-server.ts");
  assert.match(reader, /store\.read\(authenticatedOwnerId, seasonId\)/);
  assert.doesNotMatch(reader, /loadTouchlineFantasyReadSnapshot|purchaseClubPlayer|club-acquisition-service/);
  assert.match(handler, /private, no-store/);
  assert.match(read("lib/touchlineFantasy/club-collection-request.ts"), /requestClubCollection\("\/api\/touchline-fantasy\/collection\/read", \{ method: "GET"/);
});
