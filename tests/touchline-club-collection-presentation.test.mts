import test from "node:test";
import assert from "node:assert/strict";
import { clubCollectionPresentationEnabled } from "../lib/touchlineFantasy/club-collection-presentation.ts";

test("collection presentation is local, paid-plan, opt-in only", () => {
  const input = { nodeEnv: "development", enabled: "true", host: "localhost:3319", plan: "vip" };
  assert.equal(clubCollectionPresentationEnabled(input), true);
  assert.equal(clubCollectionPresentationEnabled({ ...input, host: "127.0.0.1:3319" }), true);
  for (const nodeEnv of [undefined, "test", "production"]) assert.equal(clubCollectionPresentationEnabled({ ...input, nodeEnv }), false);
  for (const enabled of [undefined, "false", "1"]) assert.equal(clubCollectionPresentationEnabled({ ...input, enabled }), false);
  for (const host of [null, "localhost:3337", "example.com", "localhost:3319.evil"]) assert.equal(clubCollectionPresentationEnabled({ ...input, host }), false);
  for (const plan of [null, "pro", "unknown"]) assert.equal(clubCollectionPresentationEnabled({ ...input, plan }), false);
  for (const plan of ["standard", "master", "vip"]) assert.equal(clubCollectionPresentationEnabled({ ...input, plan }), true);
});

test("approved Beta collection shares the guarded local presentation",()=>{assert.equal(clubCollectionPresentationEnabled({nodeEnv:"development",enabled:"true",host:"localhost:3319",plan:"beta"}),true);});
