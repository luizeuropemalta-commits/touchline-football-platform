import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const auditAccessSource = readFileSync(new URL("../lib/touchlineAudit/access.ts", import.meta.url), "utf8");
const robotsSource = readFileSync(new URL("../app/robots.ts", import.meta.url), "utf8");

test("Audit Mode is unavailable outside its dedicated preview deployment", () => {
  assert.match(proxySource, /const isAuditPath = pathname === "\/audit-index" \|\| pathname\.startsWith\("\/audit\/"\);/);
  assert.match(proxySource, /if \(isTouchlineAuditMode\(\)\)/);
  assert.match(proxySource, /if \(isAuditPath\) return auditNotFound\(\);/);
  assert.ok(
    proxySource.indexOf("if (isAuditPath) return auditNotFound();")
      > proxySource.indexOf("if (isTouchlineAuditMode())"),
  );
  assert.match(proxySource, /function auditNotFound\(\)[\s\S]*status: 404/);
  assert.match(proxySource, /x-robots-tag.*noindex, nofollow, noarchive, nosnippet/);
  assert.match(robotsSource, /"\/audit\/"/);
  assert.match(robotsSource, /"\/audit-index"/);
});

test("temporary Audit Mode remains explicit, token-scoped and expiring", () => {
  assert.match(auditAccessSource, /TOUCHLINE_AUDIT_MODE === "true"/);
  assert.match(auditAccessSource, /TOUCHLINE_AUDIT_EXPIRES_AT/);
  assert.match(auditAccessSource, /TOUCHLINE_AUDIT_TOKEN/);
  assert.match(auditAccessSource, /now >= timestamp/);
});
