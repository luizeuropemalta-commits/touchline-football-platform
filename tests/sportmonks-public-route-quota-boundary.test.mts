import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixtureRoute = await readFile(
  new URL("../app/api/football-data/fantasy/fixture/route.ts", import.meta.url),
  "utf8",
);
const liveScoresRoute = await readFile(
  new URL("../app/api/football-data/fantasy/livescores/route.ts", import.meta.url),
  "utf8",
);

test("fixture GET authenticates before loading a provider fixture and never persists", () => {
  const getHandler = fixtureRoute.slice(
    fixtureRoute.indexOf("export async function GET"),
    fixtureRoute.indexOf("export async function POST"),
  );

  assert.match(getHandler, /requireAuthenticatedOrLocalTouchlineEditor\(request\)/);
  assert.ok(
    getHandler.indexOf("requireAuthenticatedOrLocalTouchlineEditor(request)") <
      getHandler.indexOf("loadFixtureFeed(request)"),
  );
  assert.doesNotMatch(getHandler, /persistFantasyFixtureFeed/);
  assert.match(getHandler, /reason: "read_only_request"/);
});

test("fixture persistence is restricted to the owner-authorized POST handler", () => {
  const postHandler = fixtureRoute.slice(fixtureRoute.indexOf("export async function POST"));

  assert.match(postHandler, /requireOwnerOrLocalTouchlineEditor\(request\)/);
  assert.ok(
    postHandler.indexOf("requireOwnerOrLocalTouchlineEditor(request)") <
      postHandler.indexOf("loadFixtureFeed(request)"),
  );
  assert.ok(
    postHandler.indexOf("requireOwnerOrLocalTouchlineEditor(request)") <
      postHandler.indexOf("persistFantasyFixtureFeed(loaded.data)"),
  );
});

test("public livescore reads stop at sanitized snapshots before provider access", () => {
  const snapshotBranch = liveScoresRoute.indexOf("if (snapshotOnly)");
  const accessCheck = liveScoresRoute.indexOf("requireAuthenticatedOrLocalTouchlineEditor(request)");
  const providerCall = liveScoresRoute.indexOf('createFootballDataProvider("sportmonks")');

  assert.ok(snapshotBranch >= 0 && snapshotBranch < accessCheck);
  assert.ok(accessCheck >= 0 && accessCheck < providerCall);
  assert.match(
    liveScoresRoute,
    /if \(accessError\) \{[\s\S]*?snapshotResponse\("local-snapshot"\) \?\? accessError/,
  );
});
