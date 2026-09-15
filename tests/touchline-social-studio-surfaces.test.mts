import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { STUDIO_CATALOG, studioRecordKey, studioSurfacesForArt } from "../lib/touchlineArena/social-studio-catalog.ts";
import { applyStudioAction, emptyStudioDocument, parseStudioAction, type StudioAction } from "../lib/touchlineArena/social-studio-contract.ts";
import { studioRequestHandler } from "../lib/touchlineArena/social-studio-request.ts";

const base = { requestId: "a2c1fa0d-ab0c-4fb1-887a-a5ec75165430", artId: "FULL_TIME", platform: "CLUB", placement: "CLUB_FEED", expectedRevision: 0, action: "save-plan", selected: false, schedule: null };

test("an unresolved club destination cannot obtain a record key or mutate even an unselected plan", () => {
  for (const art of STUDIO_CATALOG.filter((item) => item.internal === "PENDING")) {
    assert.throws(() => studioRecordKey(art.id, "CLUB", "CLUB_FEED"), /SURFACE_NOT_ALLOWED/);
    assert.throws(() => parseStudioAction({ ...base, artId: art.id }), /SURFACE_NOT_ALLOWED/);
  }
});

test("every artwork declares eligible external choices explicitly without selecting them; club scope matches the owner decision", () => {
  for (const art of STUDIO_CATALOG) {
    assert.ok(Array.isArray(art.allowedSurfaces));
    assert.equal(new Set(art.allowedSurfaces).size, art.allowedSurfaces.length);
    assert.deepEqual(art.allowedSurfaces.filter((surface) => !surface.startsWith("CLUB:")), ["INSTAGRAM:FEED", "INSTAGRAM:STORY", "FACEBOOK:FEED", "FACEBOOK:STORY"], "eligibility leaves Feed/Story/both for the owner, not a historical proposal");
    assert.equal(art.allowedSurfaces.includes("CLUB:CLUB_FEED"), art.internal !== "PENDING");
    for (const surface of studioSurfacesForArt(art)) {
      assert.equal(studioRecordKey(art.id, surface.platform, surface.placement), `${art.id}:${surface.platform}:${surface.placement}`);
      const plan = parseStudioAction({ ...base, artId: art.id, platform: surface.platform, placement: surface.placement });
      const document = applyStudioAction(emptyStudioDocument(), plan, null, Date.parse("2026-09-15T12:00:00Z"));
      assert.equal(document.selected, false); assert.equal(document.permission, "PAUSED"); assert.equal(document.outbound, "DISABLED");
    }
  }
  const preview = STUDIO_CATALOG.find((art) => art.id === "MATCH_PREVIEW")!;
  assert.equal(preview.internal, "BOTH_CLUBS");
  assert.equal(STUDIO_CATALOG.find((art) => art.id === "GOAL_CONFIRMED")!.internal, "SUBJECT_CLUB");
  assert.deepEqual(studioSurfacesForArt({ ...preview, allowedSurfaces: ["FACEBOOK:STORY"] }).map((surface) => surface.label), ["Facebook · Stories"], "the UI selector must honor an exact future per-type restriction");
});

test("forbidden surface rejects every action before persistence, including direct application bypassing the parser", async () => {
  let writes = 0;
  const handler = studioRequestHandler({ authorize: async () => "owner-test-only", save: async () => { writes++; throw new Error("unexpected write"); } });
  for (const action of ["save-plan", "approve-artwork", "approve-caption", "reject-artwork", "request-revision", "request-retry"]) {
    const payload = { ...base, action };
    assert.throws(() => parseStudioAction(payload), /SURFACE_NOT_ALLOWED/);
    assert.throws(() => applyStudioAction(emptyStudioDocument(), payload as StudioAction, null, Date.now()), /SURFACE_NOT_ALLOWED/);
    const response = await handler(new Request("https://qa.example.test/api/admin/social-publications/studio", { method: "POST", headers: { Origin: "https://qa.example.test", "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /não está autorizada/);
  }
  assert.equal(writes, 0);
});

test("the approval UI and media reader use the same per-art surface policy and Facebook supersession is explicit", async () => {
  const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const [ui, server, roadmap] = await Promise.all([source("components/touchline/admin/TouchlineSocialStudio.tsx"), source("lib/touchlineArena/social-studio-server.ts"), source("docs/touchline-arena/social-publishing-playbook/MULTICHANNEL_DESTINATION_ROADMAP.md")]);
  assert.match(ui, /const surfaces = studioSurfacesForArt\(art\)/);
  assert.match(ui, /\{surfaces\.map\(/);
  assert.doesNotMatch(ui, /STUDIO_SURFACES\.(map|filter)\(/);
  assert.match(server, /studioSurfacesForArt\(art\)\.some\(\(surface\) => surface\.placement === placement\)/);
  assert.match(server, /STUDIO_CATALOG\.flatMap\(\(art\) => studioSurfacesForArt\(art\)/);
  assert.match(roadmap, /Instagram AND Facebook required/);
  assert.match(roadmap, /SUPERSEDED/);
  assert.match(roadmap, /both integrations remain disabled\/unverified/);
});
