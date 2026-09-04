import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";

import { shareTouchlinePost } from "../lib/touchlineArena/social-native-share.ts";

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalFetch = globalThis.fetch;

function installNavigator(value: Partial<Navigator>) {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value });
}

afterEach(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
  globalThis.fetch = originalFetch;
});

test("sharing a canonical post refreshes the artwork on click and validates the exact file payload", async () => {
  const checked: ShareData[] = [];
  const shared: ShareData[] = [];
  const bytes = new Uint8Array([1, 2, 3]);
  const checksum = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const fetched: string[] = [];
  globalThis.fetch = async (input) => {
    fetched.push(String(input));
    if (String(input).startsWith("/api/")) {
      return Response.json({ ok: true, signedUrl: "https://storage.example/art.png?token=signed", checksum });
    }
    return new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } });
  };
  installNavigator({
    canShare: (payload) => {
      checked.push(payload);
      return true;
    },
    share: async (payload) => { shared.push(payload); },
  });

  const result = await shareTouchlinePost({
    title: "TouchLine goal",
    text: "João Pedro scores.",
    pageUrl: "https://touchline.example/club/chelsea",
    postId: "11111111-1111-4111-8111-111111111111",
    imageUrl: "https://expired.example/old-signed-url",
  });

  assert.equal(result, "shared");
  assert.equal(checked.length, 1);
  assert.equal(shared.length, 1);
  assert.equal(checked[0], shared[0]);
  assert.equal(shared[0]?.url, undefined);
  assert.equal(shared[0]?.files?.length, 1);
  assert.match(shared[0]?.text ?? "", /https:\/\/touchline\.example\/club\/chelsea/);
  assert.deepEqual(fetched, [
    "/api/touchline-social/share-art/11111111-1111-4111-8111-111111111111",
    "https://storage.example/art.png?token=signed",
  ]);
});

test("a device that rejects files receives the standard text and URL payload", async () => {
  const shared: ShareData[] = [];
  const bytes = new Uint8Array([4]);
  const checksum = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  globalThis.fetch = async (input) => String(input).startsWith("/api/")
    ? Response.json({ ok: true, signedUrl: "https://storage.example/art.png?token=signed", checksum })
    : new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } });
  installNavigator({
    canShare: () => false,
    share: async (payload) => { shared.push(payload); },
  });

  const result = await shareTouchlinePost({
    title: "Full time",
    text: "Arsenal win.",
    pageUrl: "https://touchline.example/club/arsenal",
    postId: "22222222-2222-4222-8222-222222222222",
  });

  assert.equal(result, "shared");
  assert.deepEqual(shared, [{
    title: "Full time",
    text: "Arsenal win.",
    url: "https://touchline.example/club/arsenal",
  }]);
});

test("an unavailable refreshed artwork never reuses an expired signed URL", async () => {
  const fetched: string[] = [];
  const shared: ShareData[] = [];
  globalThis.fetch = async (input) => {
    fetched.push(String(input));
    return new Response(null, { status: 404 });
  };
  installNavigator({ share: async (payload) => { shared.push(payload); } });

  const result = await shareTouchlinePost({
    title: "Match preview",
    text: "Next fixture.",
    pageUrl: "https://touchline.example/club/arsenal",
    postId: "33333333-3333-4333-8333-333333333333",
    imageUrl: "https://expired.example/old-signed-url",
  });

  assert.equal(result, "shared");
  assert.deepEqual(fetched, ["/api/touchline-social/share-art/33333333-3333-4333-8333-333333333333"]);
  assert.equal(shared[0]?.files, undefined);
  assert.equal(shared[0]?.url, "https://touchline.example/club/arsenal");
});

test("a checksum mismatch never shares unapproved artwork bytes", async () => {
  const shared: ShareData[] = [];
  globalThis.fetch = async (input) => String(input).startsWith("/api/")
    ? Response.json({
      ok: true,
      signedUrl: "https://storage.example/changed.png?token=signed",
      checksum: `sha256:${"0".repeat(64)}`,
    })
    : new Response(new Uint8Array([9, 9, 9]), { status: 200, headers: { "Content-Type": "image/png" } });
  installNavigator({
    canShare: () => true,
    share: async (payload) => { shared.push(payload); },
  });

  const result = await shareTouchlinePost({
    title: "Match preview",
    text: "Verified fixture.",
    pageUrl: "https://touchline.example/club/liverpool",
    postId: "44444444-4444-4444-8444-444444444444",
  });

  assert.equal(result, "shared");
  assert.equal(shared[0]?.files, undefined);
  assert.equal(shared[0]?.url, "https://touchline.example/club/liverpool");
});
