import { createHash } from "node:crypto";
import { normalizePublicOwnerSearchName, parsePublicOwnerProfile, parsePublicOwnerSearchPage, publicOwnerId, publicOwnerNameMatchesQuery, publicOwnerQuery, type PublicOwnerSearchPage } from "./clubowner-public-contract.ts";

const CAPACITY = 10_000;
const PAGE_SIZE = 20;
const invalid = () => new Error("PEOPLE_INVALID_CURSOR");
export function validatePublicOwnerSearch(query: string, cursor: string | null) {
  if ((query !== "" && !publicOwnerQuery(query)) || (cursor !== null && (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)))) throw invalid();
}
/** Server-side only: inputs may contain account UUIDs, returned DTO never does. */
export function projectPublicOwnerSearchPage(
  candidates: unknown, ranking: readonly { accountId: string; rank: number }[], query: string, cursor: string | null,
): PublicOwnerSearchPage {
  validatePublicOwnerSearch(query, cursor);
  if (!Array.isArray(candidates) || candidates.length > CAPACITY || ranking.length > 100_000) throw new Error("PEOPLE_DIRECTORY_UNAVAILABLE");
  const ranks = new Map<string, number>();
  for (const row of ranking) {
    if (!publicOwnerId(row.accountId) || !Number.isSafeInteger(row.rank) || row.rank < 1 || ranks.has(row.accountId.toLowerCase())) throw new Error("PEOPLE_RANKING_UNAVAILABLE");
    ranks.set(row.accountId.toLowerCase(), row.rank);
  }
  const accounts = new Set<string>(), ids = new Set<string>();
  const rows = candidates.map(value => {
    if (!value || typeof value !== "object" || !publicOwnerId(value.accountId)) throw new Error("PEOPLE_DIRECTORY_UNAVAILABLE");
    const profile = parsePublicOwnerProfile(value);
    if (!profile || accounts.has(value.accountId.toLowerCase()) || ids.has(profile.publicId.toLowerCase())) throw new Error("PEOPLE_DIRECTORY_UNAVAILABLE");
    accounts.add(value.accountId.toLowerCase()); ids.add(profile.publicId.toLowerCase());
    // Only explicitly published data passes through. Ignore unexpected columns.
    return { ...profile, rank: ranks.get(value.accountId.toLowerCase()) ?? null };
  }).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.publicId.localeCompare(b.publicId));
  const normalized = normalizePublicOwnerSearchName(query);
  const filtered = normalized === "" ? rows : rows.filter(row => publicOwnerNameMatchesQuery(row.displayName, normalized));
  // Changes in ranking/publication/name/confirmed-plan invalidate continuation.
  // Follows do not alter order, so changing them does not invalidate pagination.
  const stamp = createHash("sha256").update(JSON.stringify(filtered.map(row => [row.publicId, row.displayName, row.rank, row.planKey]))).digest("hex");
  let offset = 0;
  if (cursor !== null) {
    let decoded: unknown;
    try {
      const bytes = Buffer.from(cursor, "base64url");
      if (bytes.toString("base64url") !== cursor) throw invalid();
      decoded = JSON.parse(bytes.toString("utf8"));
    } catch { throw invalid(); }
    const token = decoded as { v?: unknown; offset?: unknown; stamp?: unknown; query?: unknown } | null;
    if (!token || typeof token !== "object" || Object.keys(token).sort().join(",") !== "offset,query,stamp,v"
      || token.v !== 1 || token.query !== normalized || token.stamp !== stamp || typeof token.offset !== "number"
      || !Number.isSafeInteger(token.offset) || token.offset < PAGE_SIZE || token.offset >= filtered.length
      || token.offset > CAPACITY || token.offset % PAGE_SIZE !== 0) throw invalid();
    offset = token.offset;
  }
  const nextOffset = offset + PAGE_SIZE;
  return parsePublicOwnerSearchPage({ profiles: filtered.slice(offset, nextOffset), nextCursor: nextOffset < filtered.length
    ? Buffer.from(JSON.stringify({ v: 1, offset: nextOffset, stamp, query: normalized })).toString("base64url") : null });
}
