import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { EventsLiveReviewInput } from "@/components/touchline/social/TouchlineSocialEventsLiveReview";
import { assessEventsLivePackage } from "./social-events-live-contract";

/** One request-time clock read. No upstream calls, credentials, writes or historic clock override. */
export async function readEventsLiveReviewSource(artId: string, inputName?: string) {
  if (process.env.NODE_ENV !== "development") return null;
  const allowedName = inputName && /^[a-z0-9][a-z0-9._-]*\.json$/i.test(inputName)
    && basename(inputName) === inputName ? inputName : "render-inputs-20260915.json";
  const inputs = JSON.parse(await readFile(resolve(process.cwd(), "artifacts/social-studio/events", allowedName), "utf8")) as EventsLiveReviewInput[];
  const input = inputs.find(candidate => candidate.artId === artId);
  if (!input) return null;
  const now = Date.now();
  const state = assessEventsLivePackage(input, now);
  const dates = [input.fetchedAt, input.asOf, input.validUntil].map(Date.parse);
  const validDates = dates.every(Number.isFinite) && dates[0] <= now && dates[1] <= dates[0] && dates[2] > now;
  return { input, reason: !state.reviewable ? state.reason : !validDates ? "FACTUAL_REVIEW_EXPIRED" : null,
    checksum: `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}` };
}
