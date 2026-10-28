import assert from "node:assert/strict";
import test from "node:test";
import { ingestCompanyMailPage, type MailPageCommit, type MailScan } from "../lib/admin/company-mail-intake.ts";
import { parseCompanyMailEvidence } from "../lib/admin/company-mail.ts";
const scan: MailScan = { id: "scan", mailboxId: "mailbox", query: "from:billing@example.test", cursor: null, revision: 0, enabled: true, completed: false };
function evidence(id: string) {
  return parseCompanyMailEvidence({ id, threadId: "thread", internalDate: "1700000000000", payload: { mimeType: "text/plain", headers: [], body: { data: "" } } }, { id, raw: Buffer.from("Original mail").toString("base64url") }, id);
}
test("disabled and completed scans make no provider calls or writes", async () => {
  for (const state of [{ enabled: false }, { completed: true }]) {
    const result = await ingestCompanyMailPage("scan", { scan: async () => ({ ...scan, ...state }), commit: async () => { assert.fail("write"); } }, async () => { assert.fail("provider"); });
    assert.ok(["DISABLED", "SCAN_FINISHED"].includes(result.state));
  }
});
test("intake commits successful evidence and redacted failures with cursor atomically", async () => {
  let saved: MailPageCommit | undefined;
  const result = await ingestCompanyMailPage("scan", { scan: async () => scan, commit: async page => { saved = page; return "APPLIED"; } }, async () => ({
    page: async () => ({ ids: ["one", "bad", "three"], nextPageToken: "next" }),
    message: async id => { if (id === "bad") throw Error("remote secret and arbitrary body"); return evidence(id); },
  }));
  assert.deepEqual(result, { state: "REVIEW_REQUIRED", imported: 2, pending: 1 });
  assert.deepEqual(saved?.messages.map(row => row.messageId), ["one", "three"]);
  assert.deepEqual(saved?.failures, [{ messageId: "bad", code: "MAIL_READ_FAILED" }]);
  assert.equal(saved?.nextCursor, "next"); assert.equal(saved?.expectedRevision, 0);
});
test("provider page errors and invalid pagination never advance cursor", async () => {
  for (const page of [{ ids: ["one", "one"], nextPageToken: null }, { ids: ["../secret"], nextPageToken: null }, { ids: [], nextPageToken: "same" }]) {
    await assert.rejects(ingestCompanyMailPage("scan", { scan: async () => ({ ...scan, cursor: "same" }), commit: async () => { assert.fail("commit"); } }, async () => ({ page: async () => page, message: async () => { assert.fail("message"); } })), /MAIL_INVALID_PAGE/);
  }
  await assert.rejects(ingestCompanyMailPage("scan", { scan: async () => scan, commit: async () => { assert.fail("commit"); } }, async () => ({ page: async () => { throw Error("offline"); }, message: async id => evidence(id) })), /offline/);
});
test("stale CAS reports no import; persistence failure is not acknowledged", async () => {
  const reader = async () => ({ page: async () => ({ ids: ["one"], nextPageToken: null }), message: async (id: string) => evidence(id) });
  assert.deepEqual(await ingestCompanyMailPage("scan", { scan: async () => scan, commit: async () => "STALE" }, reader), { state: "STALE", imported: 0, pending: 0 });
  await assert.rejects(ingestCompanyMailPage("scan", { scan: async () => scan, commit: async () => { throw Error("database unavailable"); } }, reader), /database unavailable/);
});
