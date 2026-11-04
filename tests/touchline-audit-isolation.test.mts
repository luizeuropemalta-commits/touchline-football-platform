import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

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

// Invoke the real server pages without the proxy: static-looking catch-all
// suffixes must not make authorization depend on the middleware matcher.
const auditNow = Date.parse("2026-11-03T12:00:00Z");
function auditPageHarness(relativePath: string, overrides: Record<string, string | undefined> = {}) {
  const environment = { TOUCHLINE_AUDIT_MODE: "true", TOUCHLINE_AUDIT_TOKEN: "synthetic-audit-token",
    TOUCHLINE_AUDIT_EXPIRES_AT: "2026-11-03T13:00:00Z", ...overrides };
  const access = {};
  const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(compile(auditAccessSource), { exports: access, process: { env: environment },
    Date: { now: () => auditNow, parse: Date.parse } });
  const page: { default?: (props: unknown) => Promise<{ type: unknown; props: Record<string, unknown> }> } = {};
  const Studio = () => null;
  let rendered = 0;
  vm.runInNewContext(compile(readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8")), {
    exports: page, require(name: string) {
      if (name === "@/lib/touchlineAudit/access") return access;
      if (name === "next/navigation") return { notFound() { throw new Error("AUDIT_NOT_FOUND"); } };
      if (name === "@/components/touchline/audit/TouchlineAuditStudio") return { TouchlineAuditStudio: Studio };
      if (name === "react/jsx-runtime") return { jsx(type: unknown, props: Record<string, unknown>) { rendered++; return { type, props }; } };
      throw new Error(`Unexpected audit dependency ${name}`);
    },
  });
  return { run: page.default!, Studio, rendered: () => rendered };
}

test("audit pages deny absent/wrong/duplicate tokens and disabled/expired configuration without the proxy", async () => {
  const cases: Array<{ token: unknown; env?: Record<string, string | undefined> }> = [
    { token: undefined }, { token: "" }, { token: "wrong" }, { token: ["synthetic-audit-token", "synthetic-audit-token"] },
    { token: "synthetic-audit-token", env: { TOUCHLINE_AUDIT_MODE: undefined } },
    { token: "synthetic-audit-token", env: { TOUCHLINE_AUDIT_MODE: "false" } },
    { token: "synthetic-audit-token", env: { TOUCHLINE_AUDIT_TOKEN: undefined } },
    { token: "synthetic-audit-token", env: { TOUCHLINE_AUDIT_EXPIRES_AT: undefined } },
    { token: "synthetic-audit-token", env: { TOUCHLINE_AUDIT_EXPIRES_AT: "invalid" } },
    { token: "synthetic-audit-token", env: { TOUCHLINE_AUDIT_EXPIRES_AT: "2026-11-03T12:00:00Z" } },
    { token: "synthetic-audit-token", env: { TOUCHLINE_AUDIT_EXPIRES_AT: "2026-11-03T11:59:59Z" } },
  ];
  for (const relativePath of ["app/audit-index/page.tsx", "app/audit/[...route]/page.tsx"]) {
    for (const route of [["arena", "upcoming"], ["fixture.svg"], ["fixture.png"]]) {
      for (const entry of cases) {
        const h = auditPageHarness(relativePath, entry.env);
        await assert.rejects(h.run({ params: Promise.resolve({ route }), searchParams: Promise.resolve({ auditToken: entry.token }) }), /AUDIT_NOT_FOUND/);
        assert.equal(h.rendered(), 0, "unauthorized request must not produce the Studio element");
      }
    }
  }
});

test("authorized unexpired audit pages preserve fixtures, route selection and presentation props", async () => {
  const query = { auditToken: "synthetic-audit-token", persona: "ClubOwner", matchState: "Upcoming", lang: "pt-BR" };
  for (const relativePath of ["app/audit-index/page.tsx", "app/audit/[...route]/page.tsx"]) {
    const h = auditPageHarness(relativePath);
    const result = await h.run({ params: Promise.resolve({ route: ["arena", "upcoming"] }), searchParams: Promise.resolve(query) });
    assert.equal(result.type, h.Studio); assert.equal(result.props.auditToken, query.auditToken); assert.equal(h.rendered(), 1);
    if (relativePath.includes("[...route]")) {
      assert.equal(result.props.routeId, "arena/upcoming"); assert.equal(result.props.initialPersona, query.persona);
      assert.equal(result.props.initialMatchState, query.matchState); assert.equal(result.props.initialLanguage, query.lang);
    }
  }
});
