import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
export type BrowserFixtureBundle = { script: string; css: string; sources: string[] };

// Extracted without changing product modules from the existing isolated XI fixture.
// No server, credentials, package installation or Next build is involved.
export function transpileFixtureModule(source: string, fileName: string) {
  return ts.transpileModule(source, { fileName, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }, transformers: { before: [context => sourceFile => {
    // ESM evaluates static dependencies before the module body, even when an
    // import is written last. CommonJS lowering otherwise leaves its require at
    // that textual position. Hoist AST declarations, not generated JS strings;
    // retain dependency order, live bindings and leading directives.
    const directives: ts.Statement[] = [], dependencies: ts.Statement[] = [], body: ts.Statement[] = [];
    let prologue = true;
    for (const statement of sourceFile.statements) {
      if (prologue && ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
        directives.push(statement); continue;
      }
      prologue = false;
      if (ts.isImportDeclaration(statement) || (ts.isExportDeclaration(statement) && statement.moduleSpecifier)) dependencies.push(statement);
      else body.push(statement);
    }
    return context.factory.updateSourceFile(sourceFile, [...directives, ...dependencies, ...body]);
  }] } }).outputText;
}

export function bundleIsolatedBrowserFixture(options: {
  entryPath: string; requiredSources: readonly string[]; mountScript: string; cssPrefix?: string;
  /** Additional real components composed by this fixture, using the same React. */
  additionalEntryPaths?: readonly string[];
  /** Explicit synthetic boundary: records refresh intent, never proves a real RSC refresh. */
  allowSyntheticRouteRefresh?: boolean;
}): BrowserFixtureBundle {
  const modules = new Map<string, { source: string; imports: Record<string, string> }>();
  const css: string[] = [];
  const sources = new Set<string>();
  const installedDependencies = realpathSync(path.join(root, "node_modules")) + path.sep;
  const nextRequire = createRequire(require.resolve("next/package.json"));
  // Reuse Next's installed CSS Modules processors; never flatten module scopes.
  const postcss = nextRequire("postcss");
  const localByDefault = require("next/dist/compiled/postcss-modules-local-by-default");
  const scope = require("next/dist/compiled/postcss-modules-scope");
  const boundaries: Record<string, string> = {
    "next/image": `const React=require('react'); module.exports=React.forwardRef(function Image(p,ref){const {unoptimized,priority,fill,quality,loader,placeholder,blurDataURL,onLoadingComplete,...rest}=p;return React.createElement('img',{...rest,ref});});`,
    "next/link": `const React=require('react'); module.exports=React.forwardRef(function Link(p,ref){const {prefetch,replace,scroll,shallow,locale,legacyBehavior,passHref,...rest}=p;return React.createElement('a',{...rest,ref});});module.exports.useLinkStatus=()=>({pending:false});`,
    "next/navigation": `const router={refresh(){${options.allowSyntheticRouteRefresh ? "if(typeof window.onFixtureRouteRefresh!=='function')throw Error('Missing synthetic refresh observer');window.onFixtureRouteRefresh();" : "throw Error('Unexpected Next refresh');"}},push(){throw Error('Unexpected Next navigation');},replace(){throw Error('Unexpected Next navigation');}};exports.usePathname=()=>location.pathname;exports.useRouter=()=>router;`,
    // Real createClient executes its missing-config branch in this credential-free
    // fixture. The SDK is a forbidden transport, not a fake authenticated session.
    "@supabase/ssr": `const forbidden=()=>{throw Error('Unexpected Supabase transport in isolated XI fixture');};exports.createBrowserClient=forbidden;exports.parseCookieHeader=forbidden;exports.serializeCookieHeader=forbidden;`,
  };
  const allowedPackages = new Set(["react", "react-dom", "scheduler", "lucide-react", "clsx", "tailwind-merge"]);
  function resolve(specifier: string, parent: string): string {
    if (Object.hasOwn(boundaries, specifier)) return `boundary:${specifier}`;
    if (specifier.startsWith("@/") || specifier.startsWith(".")) {
      const base = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(parent), specifier);
      const file = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.js")]
        .find(candidate => existsSync(candidate) && statSync(candidate).isFile());
      assert.ok(file, `Missing fixture module: ${specifier}`);
      // This release reuses the installed node_modules through a symlink.
      // Allow package-internal relative imports only within that exact tree;
      // product sources still cannot escape the selected repository.
      const packageInternal = realpathSync(parent).startsWith(installedDependencies)
        && realpathSync(file).startsWith(installedDependencies);
      assert.ok(file.startsWith(root) || packageInternal, `fixture module escaped repository: ${specifier}`);
      return file;
    }
    assert.ok(allowedPackages.has(specifier.split("/")[0]), `Unapproved browser dependency: ${specifier}`);
    // Keep a single root React instance; resolve transitive dependencies from
    // their actual importer, as pnpm does not expose scheduler at the root.
    return specifier === "react" || specifier.startsWith("react/")
      ? require.resolve(specifier)
      : createRequire(parent).resolve(specifier);
  }
  function add(id: string): void {
    if (modules.has(id)) return;
    const compiledModule = { source: "", imports: {} as Record<string, string> };
    modules.set(id, compiledModule);
    const isBoundary = id.startsWith("boundary:");
    let source = isBoundary ? boundaries[id.slice("boundary:".length)] : readFileSync(id, "utf8");
    if (!isBoundary && !id.includes("/node_modules/")) sources.add(path.relative(root, id));
    if (id.endsWith(".css")) {
      const suffix = createHash("sha256").update(path.relative(root, id)).digest("hex").slice(0, 10);
      const result = postcss([localByDefault({ mode: "local" }), scope({ generateScopedName: (name: string) => `${options.cssPrefix ?? "xi"}_${suffix}_${name}` })])
        .process(source, { from: id }).sync();
      const exported: Record<string, string> = {};
      result.root.walkRules(":export", (rule: { walkDecls(fn: (decl: { prop: string; value: string }) => void): void; remove(): void }) => {
        rule.walkDecls(decl => { exported[decl.prop] = decl.value; }); rule.remove();
      });
      assert.ok(Object.keys(exported).length, `CSS Module has no exported classes: ${id}`);
      css.push(result.root.toString());
      compiledModule.source = `module.exports=${JSON.stringify(exported)};`; return;
    }
    if (id.endsWith(".json")) { compiledModule.source = `module.exports=${JSON.stringify(JSON.parse(source))};`; return; }
    if (/\.tsx?$/.test(id)) source = transpileFixtureModule(source, id);
    compiledModule.source = source;
    const ast = ts.createSourceFile(id, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
        assert.equal(node.arguments.length, 1); assert.ok(ts.isStringLiteral(node.arguments[0]), `Dynamic require refused: ${id}`);
        const name = node.arguments[0].text, child = resolve(name, isBoundary ? path.join(root, "fixture.js") : id);
        compiledModule.imports[name] = child; add(child);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  const entry = path.join(root, options.entryPath);
  const react = require.resolve("react"), client = require.resolve("react-dom/client"), dom = require.resolve("react-dom");
  for (const id of [entry, react, client, dom]) add(id);
  const additionalEntries = Object.fromEntries((options.additionalEntryPaths ?? []).map(relative => {
    const id = path.resolve(root, relative);
    assert.ok(id.startsWith(root), `Additional entry escaped repository: ${relative}`);
    add(id); return [relative, id];
  }));
  for (const required of options.requiredSources) assert.ok(sources.has(required), required);
  const definitions = [...modules].map(([id, mod]) => `${JSON.stringify(id)}:[function(module,exports,require){${mod.source}\n},${JSON.stringify(mod.imports)}]`).join(",");
  return { sources: [...sources].sort(), css: css.join("\n"), script: `
    const process={env:{NODE_ENV:'development'}};const modules={${definitions}},cache={};
    function load(id){if(cache[id])return cache[id].exports;const definition=modules[id];if(!definition)throw Error('Missing bundled module');const module={exports:{}};cache[id]=module;definition[0](module,module.exports,name=>{if(!Object.hasOwn(definition[1],name))throw Error('Unmapped import '+name);return load(definition[1][name]);});return module.exports;}
    const React=load(${JSON.stringify(react)}),root=load(${JSON.stringify(client)}).createRoot(document.getElementById('root'));
    const flushSync=load(${JSON.stringify(dom)}).flushSync,loadEntry=()=>load(${JSON.stringify(entry)});
    const additionalEntries=${JSON.stringify(additionalEntries)},loadAdditionalEntry=relative=>{if(!Object.hasOwn(additionalEntries,relative))throw Error('Unapproved additional entry');return load(additionalEntries[relative]);};
    ${options.mountScript}
  ` };
}
