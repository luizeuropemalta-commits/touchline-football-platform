import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadState(failure?: string) {
  const states: unknown[] = [];
  const effects: (() => unknown)[] = [];
  const cleanups: (() => void)[] = [];
  let cursor = 0;
  const exports: { default?: (props: object) => { type: (props: object) => unknown; props: object } } = {};
  const source = readFileSync(new URL("../components/touchline/social/TouchlinePlayerSocialActions.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Error, AbortController, Intl, setTimeout, clearTimeout,
    window: { addEventListener() {}, removeEventListener() {} },
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) };
      if (name === "react") return {
        useState(initial: unknown) { const index = cursor++; states[index] = initial; return [initial, (next: unknown) => { states[index] = next; }]; },
        useRef: (current: unknown) => ({ current }),
        useEffect: (effect: () => unknown) => effects.push(effect),
      };
      if (name.includes("player-social-client")) return {
        normalizePlayerSocialSubject: () => "123",
        requestPlayerSocial: async () => {
          if (failure) throw new Error(failure);
          return { summary: { followerCount: 2, likeCount: 3, following: false, liked: false }, canReact: false };
        },
      };
      if (name.includes("player-social-invalidation")) return { playerSocialInvalidation: { subscribe: () => () => {} } };
      if (name.endsWith(".css")) return { default: {} };
      if (name === "lucide-react") return {};
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const component = exports.default!({ providerId: "123", playerName: "Player", locale: "pt-BR" });
  component.type(component.props);
  for (const effect of effects) { const cleanup = effect(); if (typeof cleanup === "function") cleanups.push(cleanup as () => void); }
  await new Promise<void>((resolve) => setImmediate(resolve));
  for (const cleanup of cleanups) cleanup();
  return { summary: states[0], canReact: states[1], phase: states[2] };
}

test("expired login while reading social counts offers sign-in, not a generic retry", async () => {
  assert.deepEqual(await loadState("AUTHENTICATION_REQUIRED"), { summary: null, canReact: false, phase: "signed-out" });
});
test("unavailable counts never become zero or enable reactions", async () => {
  assert.deepEqual(await loadState("SOCIAL_UNAVAILABLE"), { summary: null, canReact: false, phase: "error" });
});
test("public acknowledged counts stay visible while signed-out reactions remain disabled", async () => {
  const result = await loadState();
  assert.equal(result.phase, "signed-out");
  assert.equal(result.canReact, false);
  assert.equal((result.summary as { likeCount: number }).likeCount, 3);
});
