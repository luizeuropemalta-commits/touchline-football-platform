import assert from "node:assert/strict";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundleIsolatedBrowserFixture } from "./touchline-isolated-browser-bundle.mts";

// Run only as a child: TypeScript, PostCSS and native Tailwind compiler memory
// must be released by process exit before the parent starts a browser.
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
assert.equal(process.argv.length, 3, "Expected one test-owned temporary directory");
const output = realpathSync(process.argv[2]);
assert.equal(path.dirname(output), "/private/tmp");
assert.match(path.basename(output), /^touchline-utility-shell-[A-Za-z0-9]+$/);

const bundle = bundleIsolatedBrowserFixture({
  entryPath: "tests/fixtures/CustomerUtilityShellBrowserFixture.tsx", cssPrefix: "utilityshell",
  requiredSources: ["components/touchline/TouchlineCustomerUtilityShell.tsx", "components/touchline/TouchlineCustomerUtilityShell.module.css",
    "components/touchline/TouchlineBrandHeader.tsx", "components/touchline/TouchlineGlobalNavigation.tsx", "components/touchline/TouchlineNavigationRail.tsx"],
  mountScript: `flushSync(()=>root.render(React.createElement(loadEntry().default,{pathname:location.pathname,locale:document.documentElement.lang})));`,
});
// Same installed, source-scoped compiler as the real header browser proof.
const tailwindRequire = createRequire(require.resolve("@tailwindcss/postcss"));
const { compile } = tailwindRequire("@tailwindcss/node");
const { Scanner } = tailwindRequire("@tailwindcss/oxide");
const candidates = new Scanner({ sources: [] }).scanFiles(bundle.sources.filter(file => /\.tsx?$/.test(file)).map(file => ({ content: readFileSync(path.join(root, file), "utf8"), extension: path.extname(file).slice(1) })));
const globals = path.join(root, "app/globals.css");
const compiler = await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} });
const css = `${compiler.build(candidates)}\n${bundle.css}`;

writeFileSync(path.join(output, "fixture.js"), bundle.script, { flag: "wx" });
writeFileSync(path.join(output, "fixture.css"), css, { flag: "wx" });
writeFileSync(path.join(output, "fixture-sources.json"), JSON.stringify(bundle.sources), { flag: "wx" });
