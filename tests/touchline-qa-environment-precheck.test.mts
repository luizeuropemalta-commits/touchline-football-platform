import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const route = "app/api/qa/environment-precheck/route.ts";
const hostname = "touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app";
const environment = {
  NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa",
  VERCEL_URL: "touchline-candidate.vercel.app", VERCEL_BRANCH_URL: hostname,
  TOUCHLINE_DEPLOYMENT_MODE: "qa-preview", NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
  TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy",
  SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
  NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
  NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: `https://${hostname}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: `synthetic_anon_${"a".repeat(32)}`,
  SUPABASE_SERVICE_ROLE_KEY: `synthetic_service_${"b".repeat(32)}`,
};
const pureFiles = new Set([
  route, "lib/touchlinePreview/qa-environment-verifier-core.ts",
  "lib/touchlinePreview/isolation.ts", "lib/touchlineArena/public-origin.ts",
]);

function forbidden(): never { throw new Error("External effect or session access attempted"); }

// Execute real source in a capability-limited context. Only the four audited
// local modules can load: no framework, Supabase/auth SDK or external module.
function loadPure(file: string, env: Record<string, string | undefined>): Record<string, unknown> {
  assert.ok(pureFiles.has(file), `Unexpected dependency: ${file}`);
  const source = readFileSync(path.join(root, file), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(javascript, {
    exports, URL, Response, process: { env },
    fetch: forbidden, setTimeout: forbidden, setInterval: forbidden,
    localStorage: new Proxy({}, { get: forbidden }),
    sessionStorage: new Proxy({}, { get: forbidden }),
    require: (specifier: string) => {
      assert.ok(specifier.startsWith("."), `External dependency: ${specifier}`);
      return loadPure(path.relative(root, path.resolve(root, path.dirname(file), specifier)), env);
    },
  }, { timeout: 1_000 });
  return exports;
}

function handler(env: Record<string, string | undefined>) {
  return loadPure(route, env).GET as (request: Request) => Response;
}

test("HTTP precheck returns only safe configuration PASS without session or external capabilities", async () => {
  const request = new Proxy({ url: `https://${hostname}/api/qa/environment-precheck` }, {
    get(target, property) { if (property === "url") return target.url; return forbidden(); },
  }) as Request;
  const response = handler(environment)(request);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "PASS", reason: "QA_ENVIRONMENT_CONFIGURATION_COHERENT" });
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("HTTP precheck fails closed for mode, branch, host, project and credential configuration", async () => {
  const scenarios = [
    { overrides: { VERCEL_ENV: "production" }, reason: "QA_RUNTIME_INVALID" },
    { overrides: { VERCEL_GIT_COMMIT_REF: "main" }, reason: "QA_BRANCH_MISMATCH" },
    { overrides: { SUPABASE_URL: "https://private.invalid/secret" }, reason: "QA_PROJECT_MISMATCH" },
    { overrides: { NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: "https://private.invalid" }, reason: "QA_AUTH_ORIGIN_MISMATCH" },
    { overrides: { SUPABASE_SERVICE_ROLE_KEY: "secret" }, reason: "QA_CREDENTIAL_CONFIGURATION_INVALID" },
    { overrides: {}, host: "foreign.invalid", reason: "QA_ALIAS_MISMATCH" },
    { overrides: { STRIPE_SECRET_KEY: "synthetic_forbidden" }, reason: "QA_RUNTIME_INVALID" },
  ];
  for (const scenario of scenarios) {
    const response = handler({ ...environment, ...scenario.overrides })(
      new Request(`https://${scenario.host ?? hostname}/api/qa/environment-precheck`),
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { status: "FAIL", reason: scenario.reason });
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("route and transitive core graph cannot import Supabase/auth or invoke effect APIs", () => {
  const forbiddenCalls = /^(?:fetch|cookies|createClient|createAdminClient|createServerClient|getUser|getSession|rpc|setItem|getItem|removeItem|setTimeout|setInterval|sendBeacon|eval|require)$/;
  for (const file of pureFiles) {
    const source = ts.createSourceFile(file, readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = node.moduleSpecifier;
        if (specifier && ts.isStringLiteral(specifier)) {
          assert.ok(specifier.text.startsWith("."), `${file}: external import`);
          const target = path.relative(root, path.resolve(root, path.dirname(file), specifier.text));
          assert.ok(pureFiles.has(target), `${file}: unreviewed dependency ${target}`);
        }
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        assert.notEqual(node.expression.kind, ts.SyntaxKind.ImportKeyword, `${file}: dynamic import`);
        const name = ts.isIdentifier(node.expression) ? node.expression.text
          : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
        assert.equal(forbiddenCalls.test(name), false, `${file}: effect call ${name}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});

test("proxy sends only the exact precheck path directly to its handler before other routing", async () => {
  const source = readFileSync(path.join(root, "proxy.ts"), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sentinel = new Response(null, { status: 204 });
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(javascript, {
    exports, process: { env: {} },
    require: (specifier: string) => specifier === "next/server"
      ? { NextResponse: { next: () => sentinel } }
      : new Proxy({}, { get: forbidden }),
  });
  const proxy = exports.proxy as (request: unknown) => Promise<Response>;
  const request = (pathname: string) => new Proxy({ nextUrl: { pathname } }, {
    get(target, property) { if (property === "nextUrl") return target.nextUrl; return forbidden(); },
  });
  assert.equal(await proxy(request("/api/qa/environment-precheck")), sentinel);
  for (const pathname of ["/api/admin/qa-environment", "/api/qa/environment-precheck/extra", "/api/qa/environment-precheck-other"]) {
    await assert.rejects(proxy(request(pathname)), /External effect or session access attempted/);
  }
});
