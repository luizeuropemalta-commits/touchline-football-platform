import { TOUCHLINE_QA_PREVIEW_MODE } from "./isolation.ts";

export const TOUCHLINE_STABLE_QA_HOST =
  "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app" as const;

/**
 * Human-review surfaces that may be shown to an authenticated Arena user on
 * the stable QA Preview. The list is deliberately exact: it never grants
 * access to arbitrary `/visual-qa` pages, admin routes or APIs.
 */
export const TOUCHLINE_QA_AUTHENTICATED_VISUAL_REVIEW_PATHS = [
  "/visual-qa/social-lineup",
  "/visual-qa/social-match-preview",
  "/visual-qa/social-full-time",
  "/visual-qa/social-final-score",
  "/visual-qa/social-confirmed-event",
  "/visual-qa/social-ranking",
  "/visual-qa/social-next-three",
  "/visual-qa/social-ranking-catalogue",
  "/visual-qa/clubhub-next-fixture-post",
  "/visual-qa/clubhub-premium-redesign",
] as const;

type TouchlineQaVisualReviewEnvironment = Readonly<
  Record<string, string | undefined>
>;

const qaAuthenticatedVisualReviewPaths = new Set<string>(
  TOUCHLINE_QA_AUTHENTICATED_VISUAL_REVIEW_PATHS,
);

export function isTouchlineQaAuthenticatedVisualReviewRoute(input: {
  pathname: string;
  hostname: string;
  environment?: TouchlineQaVisualReviewEnvironment;
}) {
  const environment = input.environment ?? process.env;
  return environment.VERCEL_ENV === "preview"
    && environment.TOUCHLINE_DEPLOYMENT_MODE === TOUCHLINE_QA_PREVIEW_MODE
    && environment.NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE === TOUCHLINE_QA_PREVIEW_MODE
    && input.hostname.trim().toLowerCase() === TOUCHLINE_STABLE_QA_HOST
    && qaAuthenticatedVisualReviewPaths.has(input.pathname);
}
