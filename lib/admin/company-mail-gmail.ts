import { parseCompanyMailEvidence, parseCompanyMailPage } from "./company-mail.ts";

export type GmailReadConfiguration = {
  expectedEmail: string; clientId: string; clientSecret: string; refreshToken: string;
};
async function json(response: Response, limit: number) {
  if (!response.ok) throw Error(`MAIL_PROVIDER_HTTP_${response.status}`);
  if (!response.body) throw Error("MAIL_PROVIDER_EMPTY");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); throw Error("MAIL_PROVIDER_RESPONSE_LIMIT"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("MAIL_PROVIDER_INVALID");
  return value as Record<string, unknown>;
}
/** Only fixed Google OAuth/read URLs. Never marks, moves, deletes or sends mail. */
export async function createCompanyGmailReader(config: GmailReadConfiguration, fetcher: typeof fetch = fetch) {
  if (!config.expectedEmail || !config.clientId || !config.clientSecret || !config.refreshToken) throw Error("MAIL_CONNECTION_REQUIRED");
  const token = await json(await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: config.clientId,
      client_secret: config.clientSecret, refresh_token: config.refreshToken }),
  }), 16_384);
  if (typeof token.access_token !== "string" || !token.access_token || token.access_token.length > 8192) throw Error("MAIL_CONNECTION_FAILED");
  const read = async (path: string, params: Record<string, string> = {}, limit = 65_536) => {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return json(await fetcher(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${token.access_token}` } }), limit);
  };
  const profile = await read("profile");
  if (typeof profile.emailAddress !== "string" || profile.emailAddress.toLowerCase() !== config.expectedEmail.toLowerCase()) throw Error("MAIL_ACCOUNT_MISMATCH");
  let calls = 2;
  return {
    calls: () => calls,
    page: async (query: string, pageToken: string | null) => {
      if (!query.trim() || query.length > 2048 || (pageToken && pageToken.length > 4096)) throw Error("MAIL_INVALID_QUERY");
      calls++;
      return parseCompanyMailPage(await read("messages", { q: query, maxResults: "10", includeSpamTrash: "false", ...(pageToken ? { pageToken } : {}) }));
    },
    message: async (messageId: string) => {
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(messageId)) throw Error("MAIL_INVALID_ID");
      calls++;
      const full = await read(`messages/${messageId}`, { format: "full" }, 1024 * 1024);
      calls++;
      const raw = await read(`messages/${messageId}`, { format: "raw" }, 3 * 1024 * 1024);
      return parseCompanyMailEvidence(full, raw, messageId);
    },
  };
}
