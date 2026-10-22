import test from "node:test";
import assert from "node:assert/strict";
import { readClubCommand } from "../lib/touchlineFantasy/club-request.ts";

const request = (body: string, headers: Record<string,string> = {}) => new Request("http://localhost/collection", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body,
});

test("collection command reads bounded JSON and rejects invalid encoding, length and content type", async () => {
  assert.deepEqual(await readClubCommand(request('{"coachId":"coach"}'),512), {coachId:"coach"});
  for (const value of [request("{"), request("{}",{"content-type":"text/plain"}), request("{}",{"content-length":"-1"}),
    request("{}",{"content-length":"513"}), request(`"${"x".repeat(513)}"`)]) assert.equal(await readClubCommand(value,512),null);
  const invalid = new Request("http://localhost",{method:"POST",headers:{"content-type":"application/json"},body:new Uint8Array([0xff])});
  assert.equal(await readClubCommand(invalid),null);
});

test("chunked body without a length is cancelled when the byte limit is exceeded", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(257)); controller.enqueue(new Uint8Array(256)); },
    cancel() { cancelled = true; },
  });
  const req = new Request("http://localhost",{method:"POST",headers:{"content-type":"application/json"},body:stream,duplex:"half"} as RequestInit);
  assert.equal(await readClubCommand(req,512),null);
  assert.equal(cancelled,true);
});

test("an aborted or stalled request cannot hold the collection command open indefinitely", async () => {
  const controller = new AbortController(); controller.abort();
  assert.equal(await readClubCommand(new Request("http://localhost",{method:"POST",headers:{"content-type":"application/json"},body:"{}",signal:controller.signal})),null);
  let cancelled=false;
  const req = new Request("http://localhost",{method:"POST",headers:{"content-type":"application/json"},body:new ReadableStream({cancel(){cancelled=true;}}),duplex:"half"} as RequestInit);
  assert.equal(await readClubCommand(req),null); assert.equal(cancelled,true);
});
