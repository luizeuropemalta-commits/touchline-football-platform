import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  decodeTouchlineClubSocialFeedCursor,
  encodeTouchlineClubSocialFeedCursor,
  touchlineClubSocialFeedPageSize,
} from "@/lib/touchlineArena/social-club-feed-contract";

const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FeedRpcItem = Readonly<{
  postId: string;
  contentType: string;
  copy: string;
  sourceChecksum: string;
  publishedAt: string;
  expiresAt: string;
  artifactBucket: string;
  artifactKey: string;
  artifactChecksum: string;
  width: number;
  height: number;
}>;

export type TouchlineClubSocialFeedItem = Readonly<{
  id: string;
  contentType: string;
  copy: string;
  publishedAt: string;
  width: number;
  height: number;
  imageUrl: string;
}>;

export type TouchlineClubSocialFeedPage = Readonly<{
  state: "ready" | "empty" | "unavailable";
  items: readonly TouchlineClubSocialFeedItem[];
  nextCursor: string | null;
}>;

type ShareArtworkRpcItem = Readonly<{
  artifactBucket: string;
  artifactKey: string;
  artifactChecksum: string;
  width: number;
  height: number;
}>;

export type TouchlineShareArtwork = Readonly<{
  signedUrl: string;
  checksum: string;
}>;

function validItem(value: unknown): value is FeedRpcItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return UUID.test(String(item.postId ?? ""))
    && /^[A-Z0-9_]{1,80}$/.test(String(item.contentType ?? ""))
    && String(item.copy ?? "").length >= 1 && String(item.copy ?? "").length <= 2_000
    && SHA256.test(String(item.sourceChecksum ?? ""))
    && Number.isFinite(Date.parse(String(item.publishedAt ?? "")))
    && Number.isFinite(Date.parse(String(item.expiresAt ?? "")))
    && String(item.artifactBucket ?? "") === "touchline-social-drafts"
    && String(item.artifactKey ?? "").length >= 32 && String(item.artifactKey ?? "").length <= 1_024
    && SHA256.test(String(item.artifactChecksum ?? ""))
    && Number(item.width) === 1080
    && [1350, 1920].includes(Number(item.height));
}

function validShareArtwork(value: unknown): value is ShareArtworkRpcItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return String(item.artifactBucket ?? "") === "touchline-social-drafts"
    && String(item.artifactKey ?? "").length >= 32
    && String(item.artifactKey ?? "").length <= 1_024
    && SHA256.test(String(item.artifactChecksum ?? ""))
    && Number(item.width) === 1080
    && [1350, 1920].includes(Number(item.height));
}

/** Revalidates the canonical post and signs its approved artwork at click time. */
export async function readTouchlineShareArtwork(postId: string): Promise<TouchlineShareArtwork | null> {
  if (!UUID.test(postId)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.rpc("touchline_social_049_read_share_art", { p_post_id: postId });
  if (error || !validShareArtwork(data)) return null;
  const { data: signed, error: signedError } = await admin.storage
    .from(data.artifactBucket)
    .createSignedUrl(data.artifactKey, 60);
  if (signedError || !signed?.signedUrl) return null;
  return Object.freeze({ signedUrl: signed.signedUrl, checksum: data.artifactChecksum });
}

export async function readTouchlineClubSocialFeed(input: Readonly<{
  providerTeamId: string;
  limit?: number;
  cursor?: string | null;
}>): Promise<TouchlineClubSocialFeedPage> {
  const providerTeamId = input.providerTeamId.trim();
  if (!NUMERIC_ID.test(providerTeamId)) return { state: "unavailable", items: [], nextCursor: null };
  const admin = createAdminClient();
  if (!admin) return { state: "unavailable", items: [], nextCursor: null };
  const limit = touchlineClubSocialFeedPageSize(input.limit);
  const cursor = decodeTouchlineClubSocialFeedCursor(input.cursor);
  if (input.cursor && !cursor) return { state: "unavailable", items: [], nextCursor: null };

  const { data, error } = await admin.rpc("touchline_social_045_read_feed", {
    p_team_provider_id: providerTeamId,
    p_limit: limit,
    p_before_published_at: cursor?.publishedAt ?? null,
    p_before_id: cursor?.postId ?? null,
  });
  return signTouchlineClubSocialFeedPage(data, error, limit);
}

async function signTouchlineClubSocialFeedPage(
  data: unknown,
  error: unknown,
  limit: number,
): Promise<TouchlineClubSocialFeedPage> {
  const admin = createAdminClient();
  if (!admin) return { state: "unavailable", items: [], nextCursor: null };
  const payload = data as { items?: unknown[] } | null;
  if (error || !Array.isArray(payload?.items) || payload.items.some((item) => !validItem(item))) {
    return { state: "unavailable", items: [], nextCursor: null };
  }
  const rawItems = payload.items as FeedRpcItem[];
  const visible = rawItems.slice(0, limit);
  const items = (await Promise.all(visible.map(async (item) => {
    const { data: signed, error: signedError } = await admin.storage
      .from(item.artifactBucket)
      .createSignedUrl(item.artifactKey, 300);
    if (signedError || !signed?.signedUrl) return null;
    return Object.freeze({
      id: item.postId,
      contentType: item.contentType,
      copy: item.copy,
      publishedAt: new Date(item.publishedAt).toISOString(),
      width: item.width,
      height: item.height,
      imageUrl: signed.signedUrl,
    });
  }))).filter((item): item is TouchlineClubSocialFeedItem => Boolean(item));
  if (items.length !== visible.length) return { state: "unavailable", items: [], nextCursor: null };
  const last = items.at(-1);
  const nextCursor = rawItems.length > limit && last
    ? encodeTouchlineClubSocialFeedCursor({ publishedAt: last.publishedAt, postId: last.id })
    : null;
  return { state: items.length ? "ready" : "empty", items: Object.freeze(items), nextCursor };
}

/**
 * Reads the one canonical first-party timeline shared with every ClubOwner.
 * The database function is service-role-only and returns only current,
 * fully-approved, non-expired posts. Storage locators never reach the client.
 */
export async function readTouchlineClubOwnerSocialFeed(input: Readonly<{
  limit?: number;
  cursor?: string | null;
}> = {}): Promise<TouchlineClubSocialFeedPage> {
  const admin = createAdminClient();
  if (!admin) return { state: "unavailable", items: [], nextCursor: null };
  const limit = touchlineClubSocialFeedPageSize(input.limit);
  const cursor = decodeTouchlineClubSocialFeedCursor(input.cursor);
  if (input.cursor && !cursor) return { state: "unavailable", items: [], nextCursor: null };
  const { data, error } = await admin.rpc("touchline_social_049_read_clubowner_feed", {
    p_limit: limit,
    p_before_published_at: cursor?.publishedAt ?? null,
    p_before_id: cursor?.postId ?? null,
  });
  return signTouchlineClubSocialFeedPage(data, error, limit);
}
