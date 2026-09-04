import assert from "node:assert/strict";
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
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "/api/touchline-social/share-art/11111111-1111-4111-8111-111111111111");
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "image/png" } });
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
});

test("a device that rejects files receives the standard text and URL payload", async () => {
  const shared: ShareData[] = [];
  globalThis.fetch = async () => new Response(new Uint8Array([4]), {
    status: 200,
    headers: { "Content-Type": "image/png" },
  });
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
