export type LinkPreviewResult = {
  ok: boolean;
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  error?: string;
};

const MAX_HTML_LENGTH = 300_000;

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMeta(html: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapedKey}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapedKey}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }

  return null;
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1].replace(/\s+/g, " ").trim()) : null;
}

function absoluteUrl(value: string | null, baseUrl: string) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export function validatePreviewUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function getDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function getTransfermarktPlayerId(value: string) {
  const match = value.match(/\/spieler\/(\d+)/i);
  return match?.[1] ?? null;
}

export async function fetchLinkPreview(target: URL): Promise<LinkPreviewResult> {
  try {
    const response = await fetch(target.toString(), {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "TouchlineBot/1.0 (+https://touchline-football-platform.vercel.app; link preview)",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        url: target.toString(),
        title: null,
        description: null,
        image: null,
        siteName: target.hostname.replace(/^www\./, ""),
        error: `Preview blocked or unavailable (${response.status}).`,
      };
    }

    const html = (await response.text()).slice(0, MAX_HTML_LENGTH);
    const title = extractMeta(html, "og:title") ?? extractMeta(html, "twitter:title") ?? extractTitle(html);
    const description = extractMeta(html, "og:description") ?? extractMeta(html, "twitter:description") ?? extractMeta(html, "description");
    const image = absoluteUrl(extractMeta(html, "og:image") ?? extractMeta(html, "twitter:image"), target.toString());
    const siteName = extractMeta(html, "og:site_name") ?? target.hostname.replace(/^www\./, "");

    return {
      ok: true,
      url: target.toString(),
      title,
      description,
      image,
      siteName,
    };
  } catch (error) {
    return {
      ok: false,
      url: target.toString(),
      title: null,
      description: null,
      image: null,
      siteName: target.hostname.replace(/^www\./, ""),
      error: error instanceof Error ? error.message : "Preview unavailable.",
    };
  }
}
