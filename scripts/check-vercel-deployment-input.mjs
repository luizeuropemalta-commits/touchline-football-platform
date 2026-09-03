import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const repositoryRoot = process.cwd();
const vercelIgnorePath = join(repositoryRoot, ".vercelignore");
const remoteTestRunnerPath = join(repositoryRoot, "scripts/run-vercel-release-tests.mjs");

function fail(message) {
  console.error(`[vercel-input] ${message}`);
  process.exit(1);
}

if (!existsSync(vercelIgnorePath)) fail("missing .vercelignore");
if (!existsSync(remoteTestRunnerPath)) fail("missing remote release-test runner");

const vercelIgnore = readFileSync(vercelIgnorePath, "utf8");
const remoteTestRunner = readFileSync(remoteTestRunnerPath, "utf8");
const excludedTests = new Set(
  [...remoteTestRunner.matchAll(/"([^"]+\.test\.mts)"/g)].map((match) => match[1]),
);
const documentationReferencePattern = /(?:\.\.\/)?docs\/[A-Za-z0-9_./-]+\.(?:md|json|csv|txt)/g;
const requiredDocumentation = new Set();

function collectDocumentationReferences(source) {
  for (const match of source.matchAll(documentationReferencePattern)) {
    requiredDocumentation.add(match[0].replace(/^\.\.\//, ""));
  }
}

for (const testFile of readdirSync(join(repositoryRoot, "tests"))) {
  if (!testFile.endsWith(".test.mts") || excludedTests.has(testFile)) continue;
  collectDocumentationReferences(readFileSync(join(repositoryRoot, "tests", testFile), "utf8"));
}

const sourceExtensions = new Set([".js", ".mjs", ".mts", ".ts", ".tsx"]);
function scanRuntimeSources(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scanRuntimeSources(path);
    else if (sourceExtensions.has(extname(entry.name))) {
      collectDocumentationReferences(readFileSync(path, "utf8"));
    }
  }
}

for (const directory of ["app", "components", "lib"]) {
  scanRuntimeSources(join(repositoryRoot, directory));
}

const missingFiles = [];
const missingAllowlistEntries = [];
for (const relativePath of [...requiredDocumentation].sort()) {
  if (!existsSync(join(repositoryRoot, relativePath))) missingFiles.push(relativePath);
  const exactAllowlist = `!${relativePath}`;
  if (!vercelIgnore.split(/\r?\n/).includes(exactAllowlist)) {
    missingAllowlistEntries.push(exactAllowlist);
  }
}

if (missingFiles.length > 0) {
  fail(`required deployment documentation is absent: ${missingFiles.join(", ")}`);
}
if (missingAllowlistEntries.length > 0) {
  fail(`.vercelignore must explicitly allow: ${missingAllowlistEntries.join(", ")}`);
}

console.log(`[vercel-input] PASS (${requiredDocumentation.size} required documentation inputs)`);
