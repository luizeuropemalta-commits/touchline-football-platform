import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isTouchlineLaunchGateProductRoute,
  resolveTouchlinePublicLaunchGate,
  touchlineLaunchGateReturnTo,
} from "../lib/touchlineArena/public-launch-gate.ts";

const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const comingSoonSource = readFileSync(new URL("../app/coming-soon/page.tsx", import.meta.url), "utf8");
const landingSource = readFileSync(
  new URL("../components/touchline/coming-soon/TouchlinePublicLaunchGate.tsx", import.meta.url),
  "utf8",
);
const previewContractSource = readFileSync(new URL("../lib/touchlinePreview/isolation.ts", import.meta.url), "utf8");

function qaPreviewEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    VERCEL_ENV: "preview",
    VERCEL_URL: "touchline-launch-gate-123.vercel.app",
    TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
    NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
    VERCEL_GIT_COMMIT_REF: "codex/launch-gate-visual-proof",
    ...overrides,
  };
}

test("the public launch gate is server-owned, off by default and explicit when globally enabled", () => {
  assert.deepEqual(resolveTouchlinePublicLaunchGate({ environment: {} }), {
    active: false,
    mode: "off",
  });
  assert.deepEqual(resolveTouchlinePublicLaunchGate({
    environment: { TOUCHLINE_PUBLIC_LAUNCH_GATE: "true" },
  }), {
    active: true,
    mode: "global",
  });
  assert.deepEqual(resolveTouchlinePublicLaunchGate({
    environment: { TOUCHLINE_PUBLIC_LAUNCH_GATE: "TRUE" },
  }), {
    active: false,
    mode: "off",
  });
});

test("the Git-native qa branch is fully gated without a query and Production remains untouched", () => {
  assert.deepEqual(resolveTouchlinePublicLaunchGate({
    environment: qaPreviewEnvironment({ VERCEL_GIT_COMMIT_REF: "qa" }),
    requestHostname: "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app",
  }), {
    active: true,
    mode: "qa-branch",
  });
  assert.deepEqual(resolveTouchlinePublicLaunchGate({
    environment: qaPreviewEnvironment({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "qa",
    }),
    requestHostname: "touchline.com.br",
  }), {
    active: false,
    mode: "off",
  });
});

test("the non-persistent opt-in works only inside a functional QA Preview and never in Production", () => {
  assert.deepEqual(resolveTouchlinePublicLaunchGate({
    environment: qaPreviewEnvironment(),
    previewOptIn: "1",
    requestHostname: "touchline-launch-gate-123.vercel.app",
  }), {
    active: true,
    mode: "qa-opt-in",
  });
  assert.deepEqual(resolveTouchlinePublicLaunchGate({
    environment: qaPreviewEnvironment(),
    previewOptIn: undefined,
    requestHostname: "touchline-launch-gate-123.vercel.app",
  }), {
    active: false,
    mode: "off",
  });
  assert.deepEqual(resolveTouchlinePublicLaunchGate({
    environment: qaPreviewEnvironment({ VERCEL_ENV: "production" }),
    previewOptIn: "1",
    requestHostname: "touchline-launch-gate-123.vercel.app",
  }), {
    active: false,
    mode: "off",
  });
  assert.deepEqual(resolveTouchlinePublicLaunchGate({
    environment: qaPreviewEnvironment({ TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview" }),
    previewOptIn: "1",
    requestHostname: "touchline-launch-gate-123.vercel.app",
  }), {
    active: false,
    mode: "off",
  });
  assert.deepEqual(resolveTouchlinePublicLaunchGate({
    environment: qaPreviewEnvironment({ NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "isolated-preview" }),
    previewOptIn: "1",
    requestHostname: "touchline-launch-gate-123.vercel.app",
  }), {
    active: false,
    mode: "off",
  });
  assert.deepEqual(resolveTouchlinePublicLaunchGate({
    environment: qaPreviewEnvironment(),
    previewOptIn: "1",
    requestHostname: "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app",
  }), {
    active: false,
    mode: "off",
  });
  assert.deepEqual(resolveTouchlinePublicLaunchGate({
    environment: qaPreviewEnvironment(),
    previewOptIn: "1",
    requestHostname: null,
  }), {
    active: false,
    mode: "off",
  });
});

test("the gate covers customer product surfaces without swallowing auth, callbacks, access APIs or owner admin", () => {
  for (const pathname of [
    "/arena",
    "/market-transfer",
    "/fantasy",
    "/touchline-clubs",
    "/touchline-clubs/arsenal",
    "/touchline-players/player-1",
    "/touchline-coaches/coach-1",
    "/touchline-player-card-rankings",
    "/touchline-tables",
    "/live",
    "/club-owner/me",
    "/notifications",
    "/inbox",
    "/football-search",
  ]) {
    assert.equal(isTouchlineLaunchGateProductRoute(pathname), true, pathname);
  }

  for (const pathname of [
    "/",
    "/coming-soon",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/auth/callback",
    "/api/auth/login",
    "/api/touchline-arena/access",
    "/admin",
    "/visual-qa/card-neon-trace",
  ]) {
    assert.equal(isTouchlineLaunchGateProductRoute(pathname), false, pathname);
  }
});

test("launch CTAs preserve an ephemeral QA opt-in only in their safe Arena return destination", () => {
  assert.equal(touchlineLaunchGateReturnTo("pt-BR", "global"), "/arena?lang=pt-BR");
  assert.equal(touchlineLaunchGateReturnTo("pt-BR", "qa-branch"), "/arena?lang=pt-BR");
  assert.equal(
    touchlineLaunchGateReturnTo("en-GB", "qa-opt-in"),
    "/arena?launchPreview=1&lang=en-GB",
  );
});

test("the root and protected-route proxy use one canonical launch experience without changing auth", () => {
  assert.match(homeSource, /resolveTouchlinePublicLaunchGate/);
  assert.match(homeSource, /<TouchlinePublicLaunchGate/);
  assert.match(comingSoonSource, /resolveTouchlinePublicLaunchGate/);
  assert.match(comingSoonSource, /<TouchlinePublicLaunchGate/);
  assert.match(proxySource, /isTouchlineLaunchGateProductRoute/);
  assert.match(proxySource, /touchlinePublicLaunchRewrite/);
  assert.match(proxySource, /if \(launchGate\.active && isTouchlineLaunchGateProductRoute\(pathname\)\)/);
  assert.match(proxySource, /const isAuth = authPaths\.some/);
  assert.match(proxySource, /if \(!user && isProtectedArenaRoute\) return loginRedirect/);
  assert.match(proxySource, /if \(user && hasArenaAccess && isAuthEntry\)/);
  assert.match(previewContractSource, /"TOUCHLINE_PUBLIC_LAUNCH_GATE"/);
});

test("the premium launch copy and both authentication calls to action are present", () => {
  assert.match(landingSource, /A ARENA ESTÁ QUASE PRONTA/);
  assert.match(landingSource, /Seu lugar já pode ser garantido\./);
  assert.match(
    landingSource,
    /Crie sua conta agora e seja um dos primeiros a entrar em campo quando a TouchLine abrir oficialmente\./,
  );
  assert.match(landingSource, /LANÇAMENTO EM BREVE/);
  assert.match(landingSource, /touchLineAuthEntryHref\("\/login"/);
  assert.match(landingSource, /touchLineAuthEntryHref\("\/register"/);
  assert.match(landingSource, /TouchlineClubPerimeterTrace/);
});
