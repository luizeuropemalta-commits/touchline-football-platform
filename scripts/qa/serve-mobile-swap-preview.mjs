import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Reuse the existing isolated fixture with real components and local artwork.
// This is a loopback-only review server, never an application/API server.
const root = resolve(import.meta.dirname, "../..");
const sourceFile = resolve(root, "tests/touchline-squad-swap-isolated-browser.test.mts");
const original = readFileSync(sourceFile, "utf8");
const boundary = original.indexOf('\ntest("isolated real swap dialog');
if (boundary < 0) throw new Error("Isolated fixture boundary changed");
const source = original.slice(0, boundary)
  .replaceAll("import.meta.dirname", JSON.stringify(dirname(sourceFile)))
  .replaceAll("import.meta.url", JSON.stringify(pathToFileURL(sourceFile).href)) + "\nexport { fixture };";
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
const exports = {};
runInNewContext(compiled, { exports, require: createRequire(sourceFile), process: {
  env: { SQUAD_SWAP_ORIGINAL_CARDS: "1", SQUAD_SWAP_FULL_SQUAD: "1" },
} });
const port = Number(process.argv[2] ?? 3348);
const html = exports.fixture().replaceAll("http://isolated-fixture.invalid/", `http://127.0.0.1:${port}/`);
const publicRoot = resolve(root, "public");
const mime = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/") { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); response.end(html); return; }
  const file = resolve(publicRoot, "." + decodeURIComponent(url.pathname));
  const type = mime[extname(file)];
  if (!file.startsWith(publicRoot + "/") || !type || !existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { "Content-Type": type }); response.end(readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log(`Isolated mobile substitution preview: http://127.0.0.1:${port}`));
