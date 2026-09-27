import { createECDH } from "node:crypto";

/** Private configuration validation only, not subscription/key-rotation proof.
 * Derives a public point from supplied material; never generates new keys.
 */
export function parseMatchPushVapidConfig(value: unknown): Readonly<{ subject: string; publicKey: string; privateKey: string }> | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const { subject, publicKey, privateKey } = value as Record<string, unknown>;
    if (typeof subject !== "string" || typeof publicKey !== "string" || typeof privateKey !== "string") return null;
    if (!/^(https:\/\/|mailto:)/.test(subject) || /[\s\u0000-\u001f\u007f\\]/.test(subject)) return null;
    const url = new URL(subject);
    if (url.protocol === "https:") {
      if (!/^https:\/\/[^/?#]+/.test(subject)) return null;
      if (!url.hostname || url.username || url.password || url.hostname.toLowerCase().replace(/\.$/, "") === "localhost") return null;
    } else if (url.protocol !== "mailto:" || !url.pathname) return null;
    const decode = (raw: string, length: number) => {
      if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
      const bytes = Buffer.from(raw, "base64url");
      return bytes.length === length && bytes.toString("base64url") === raw ? bytes : null;
    };
    const publicBytes = decode(publicKey, 65);
    const privateBytes = decode(privateKey, 32);
    if (!publicBytes || publicBytes[0] !== 4 || !privateBytes) return null;
    const curve = createECDH("prime256v1");
    curve.setPrivateKey(privateBytes);
    if (!curve.getPublicKey(undefined, "uncompressed").equals(publicBytes)) return null;
    return Object.freeze({ subject, publicKey, privateKey });
  } catch {
    return null;
  }
}
