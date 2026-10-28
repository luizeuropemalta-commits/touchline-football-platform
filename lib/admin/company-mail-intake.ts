import type { CompanyMailEvidence } from "./company-mail.ts";

export type MailScan = {
  id: string; mailboxId: string; query: string; cursor: string | null;
  revision: number; enabled: boolean; completed: boolean; busy?: boolean;
};
export type MailPageCommit = {
  scanId: string; expectedRevision: number; expectedCursor: string | null;
  nextCursor: string | null; messages: CompanyMailEvidence[];
  failures: { messageId: string; code: string }[];
};
export interface CompanyMailIntakeStore {
  scan(scanId: string): Promise<MailScan>;
  /** One database transaction: evidence + retry records + cursor CAS. */
  commit(page: MailPageCommit): Promise<"APPLIED" | "STALE">;
}
export interface CompanyMailReader {
  page(query: string, cursor: string | null): Promise<{ ids: string[]; nextPageToken: string | null }>;
  message(id: string): Promise<CompanyMailEvidence>;
}
/** A failed message is retained for retry, never counted as successfully imported. */
export async function ingestCompanyMailPage(scanId: string, store: CompanyMailIntakeStore,
  connect: (mailboxId: string) => Promise<CompanyMailReader>) {
  const scan = await store.scan(scanId);
  if (!scan.enabled) return { state: "DISABLED" as const, imported: 0, pending: 0 };
  if (scan.busy) return { state: "BUSY" as const, imported: 0, pending: 0 };
  if (scan.completed) return { state: "SCAN_FINISHED" as const, imported: 0, pending: 0 };
  const reader = await connect(scan.mailboxId);
  const page = await reader.page(scan.query, scan.cursor);
  if (page.ids.length > 10 || new Set(page.ids).size !== page.ids.length ||
    page.ids.some(id => !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) ||
    (page.nextPageToken !== null && (!page.nextPageToken || page.nextPageToken === scan.cursor || page.nextPageToken.length > 4096))) {
    throw Error("MAIL_INVALID_PAGE");
  }
  const messages: CompanyMailEvidence[] = [], failures: MailPageCommit["failures"] = [];
  const deadline=Date.now()+90_000;
  for (const id of page.ids) {
    try {
      if(Date.now()>deadline)throw Error("MAIL_TIME_BUDGET");
      const evidence = await reader.message(id);
      if (evidence.messageId !== id) throw Error("MAIL_ID_MISMATCH");
      messages.push(evidence);
    } catch (error) {
      // Persist only our enumerated code family, never remote bodies or credentials.
      const code = error instanceof Error && /^MAIL_[A-Z_0-9]{1,80}$/.test(error.message)
        ? error.message : "MAIL_READ_FAILED";
      failures.push({ messageId: id, code });
    }
  }
  const result = await store.commit({ scanId: scan.id, expectedRevision: scan.revision,
    expectedCursor: scan.cursor, nextCursor: page.nextPageToken, messages, failures });
  if (result === "STALE") return { state: "STALE" as const, imported: 0, pending: 0 };
  return { state: failures.length ? "REVIEW_REQUIRED" as const : "IMPORTED" as const,
    imported: messages.length, pending: failures.length };
}
