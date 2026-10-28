import { createHash } from "node:crypto";

/** Provider data is evidence for review, never a financial command. */
export type CompanyMailEvidence = {
  messageId: string; threadId: string; receivedAt: string; subject: string; sender: string;
  text: string; originalBase64: string; sha256: string;
  category: "INVOICE_REVIEW" | "PAYMENT_REVIEW" | "CONTRACT_REVIEW" | "OTHER_REVIEW";
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("MAIL_INVALID_RESPONSE");
  return value as Record<string, unknown>;
};
const id = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw Error("MAIL_INVALID_ID");
  return value;
};
function decode(value: unknown, maximum: number) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*={0,2}$/.test(value) || value.length > Math.ceil(maximum * 4 / 3) + 4) throw Error("MAIL_CONTENT_LIMIT");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length > maximum || bytes.toString("base64url") !== value.replace(/=+$/, "")) throw Error("MAIL_INVALID_ENCODING");
  return bytes;
}
/** Categorization is only a queue label. A receipt email never marks an invoice paid. */
export function companyMailCategory(subject: string): CompanyMailEvidence["category"] {
  if (/\b(receipt|paid|payment confirmation|pagamento confirmado|comprovante)\b/i.test(subject)) return "PAYMENT_REVIEW";
  if (/\b(invoice|fatura|billing|bill|nota fiscal)\b/i.test(subject)) return "INVOICE_REVIEW";
  if (/\b(contract|agreement|contrato|renewal|renova[çc][aã]o)\b/i.test(subject)) return "CONTRACT_REVIEW";
  return "OTHER_REVIEW";
}
export function parseCompanyMailEvidence(full: unknown, raw: unknown, expectedId: string): CompanyMailEvidence {
  const message = record(full), original = record(raw);
  if (id(message.id) !== id(expectedId) || id(original.id) !== expectedId) throw Error("MAIL_ID_MISMATCH");
  const timestamp = Number(message.internalDate);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime())) throw Error("MAIL_INVALID_DATE");
  const bytes = decode(original.raw, 2 * 1024 * 1024);
  if (!bytes.length) throw Error("MAIL_EMPTY_ORIGINAL");
  const payload = record(message.payload);
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const header = (name: string) => {
    const matches = headers.map(record).filter(row => typeof row.name === "string" && row.name.toLowerCase() === name);
    if (matches.length > 1) throw Error("MAIL_AMBIGUOUS_HEADER");
    const value = matches[0]?.value;
    return typeof value === "string" ? value.replace(/[\r\n\u0000]/g, " ").slice(0, 1000) : "";
  };
  const parts: string[] = []; let nodes = 0, textBytes = 0;
  function visit(value: unknown, depth: number) {
    if (++nodes > 100 || depth > 10) throw Error("MAIL_PART_LIMIT");
    const part = record(value);
    if (part.mimeType === "text/plain" && part.body) {
      const body = record(part.body);
      if (body.data !== undefined) {
        const text = decode(body.data, 256 * 1024).toString("utf8").replace(/\u0000/g, ""); textBytes += Buffer.byteLength(text,"utf8")+(parts.length?2:0);
        if (textBytes > 256 * 1024) throw Error("MAIL_TEXT_LIMIT");
        parts.push(text);
      }
    }
    if (part.parts !== undefined) {
      if (!Array.isArray(part.parts)) throw Error("MAIL_INVALID_PARTS");
      for (const child of part.parts) visit(child, depth + 1);
    }
  }
  visit(payload, 0);
  const subject = header("subject");
  return { messageId: expectedId, threadId: id(message.threadId), receivedAt: new Date(timestamp).toISOString(),
    subject, sender: header("from"), text: parts.join("\n\n"), originalBase64: bytes.toString("base64"),
    sha256: createHash("sha256").update(bytes).digest("hex"), category: companyMailCategory(subject) };
}
export function parseCompanyMailPage(value: unknown) {
  const page = record(value);
  if (page.messages !== undefined && !Array.isArray(page.messages)) throw Error("MAIL_INVALID_PAGE");
  const messages = (page.messages as unknown[] | undefined) ?? [];
  if (messages.length > 10) throw Error("MAIL_PAGE_LIMIT");
  const ids = messages.map(row => id(record(row).id));
  if (new Set(ids).size !== ids.length) throw Error("MAIL_DUPLICATE_PAGE_ID");
  if (page.nextPageToken !== undefined && (typeof page.nextPageToken !== "string" || !page.nextPageToken || page.nextPageToken.length > 4096)) throw Error("MAIL_INVALID_CURSOR");
  return { ids, nextPageToken: (page.nextPageToken as string | undefined) ?? null };
}
