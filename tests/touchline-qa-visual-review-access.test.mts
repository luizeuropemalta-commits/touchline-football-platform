import assert from "node:assert/strict";
import test from "node:test";

import {
  isTouchlineQaAuthenticatedVisualReviewRoute,
  TOUCHLINE_QA_AUTHENTICATED_VISUAL_REVIEW_PATHS,
  TOUCHLINE_STABLE_QA_HOST,
} from "../lib/touchlinePreview/qa-visual-review.ts";

const qaEnvironment = {
  VERCEL_ENV: "preview",
  TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
  NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
} as const;

test("permits only the exact authenticated social and ClubHub review surfaces on stable QA", () => {
  for (const pathname of TOUCHLINE_QA_AUTHENTICATED_VISUAL_REVIEW_PATHS) {
    assert.equal(isTouchlineQaAuthenticatedVisualReviewRoute({
      pathname,
      hostname: TOUCHLINE_STABLE_QA_HOST,
      environment: qaEnvironment,
    }), true, pathname);
  }
});

test("never opens the QA review exception in Production or on another hostname", () => {
  assert.equal(isTouchlineQaAuthenticatedVisualReviewRoute({
    pathname: "/visual-qa/social-confirmed-event",
    hostname: TOUCHLINE_STABLE_QA_HOST,
    environment: { ...qaEnvironment, VERCEL_ENV: "production" },
  }), false);
  assert.equal(isTouchlineQaAuthenticatedVisualReviewRoute({
    pathname: "/visual-qa/social-confirmed-event",
    hostname: "touchline.com.br",
    environment: qaEnvironment,
  }), false);
  assert.equal(isTouchlineQaAuthenticatedVisualReviewRoute({
    pathname: "/visual-qa/social-confirmed-event",
    hostname: "touchline-arena-official-random.vercel.app",
    environment: qaEnvironment,
  }), false);
});

test("fails closed for missing QA markers, arbitrary visual QA pages and APIs", () => {
  assert.equal(isTouchlineQaAuthenticatedVisualReviewRoute({
    pathname: "/visual-qa/social-confirmed-event",
    hostname: TOUCHLINE_STABLE_QA_HOST,
    environment: { ...qaEnvironment, TOUCHLINE_DEPLOYMENT_MODE: undefined },
  }), false);
  assert.equal(isTouchlineQaAuthenticatedVisualReviewRoute({
    pathname: "/visual-qa/market-premium-pitch",
    hostname: TOUCHLINE_STABLE_QA_HOST,
    environment: qaEnvironment,
  }), false);
  assert.equal(isTouchlineQaAuthenticatedVisualReviewRoute({
    pathname: "/api/admin/social-publications/source",
    hostname: TOUCHLINE_STABLE_QA_HOST,
    environment: qaEnvironment,
  }), false);
});
