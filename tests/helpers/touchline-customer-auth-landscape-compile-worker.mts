import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { bundleIsolatedBrowserFixture, transpileFixtureModule } from "./touchline-isolated-browser-bundle.mts";

// Compiler exits before an engine starts. Never load server imports or clients.
assert.equal(process.argv.length, 3);
const output = realpathSync(process.argv[2]);
assert.equal(path.dirname(output), "/private/tmp");
assert.match(path.basename(output), /^touchline-customer-auth-landscape-[A-Za-z0-9]+$/);
const root = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const authRoutes = ["login", "register", "forgot-password", "reset-password"];
const pagePaths = authRoutes.map(route => `app/(auth)/${route}/page.tsx`);
const source = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const ast = (relative: string) => ts.createSourceFile(relative, source(relative), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const finalReturn = (tree: ts.SourceFile, name: string) => {
  const functions = tree.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(functions.length, 1); assert.ok(functions[0].body);
  const returns = functions[0].body.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1); assert.ok(returns[0].expression && ts.isParenthesizedExpression(returns[0].expression) || returns[0].expression && ts.isJsxElement(returns[0].expression));
  return returns[0].getText(tree);
};
const functionNames = ["Login", "renderRegister", "renderForgot", "renderResetPassword"];
const copies = ["login", "register", "forgot", "reset"];
const authCases = pagePaths.map((relative, index) => {
  const tree = ast(relative);
  const actualReturn = finalReturn(tree, functionNames[index]);
  // Only server-owned loading inputs are substituted. Returned JSX, real form
  // components, layout, gallery and labels are copied from the owning routes.
  return `case '/${authRoutes[index]}': { const copy=${index === 0 ? "getTouchLineLoginCopy(locale).login" : `getTouchLineAuthCopy(locale,true).${copies[index]}`}; ${actualReturn} }`;
}).join("\n");
const authSource = `function renderAuthPresentation(pathname,locale){
  const protectedReturn=false,siteLocalesEnabled=true,publicRelease=true,draftLocalesEnabled=false;
  const accountLocaleContext={mode:'guest'},returnTo=undefined,error=undefined,loginErrors=new Set();
  switch(pathname){${authCases} default:throw Error('Unsupported auth fixture route');}
}`;
const inboxPath = "app/(app)/inbox/page.tsx", inboxAst = ast(inboxPath);
const catalogue = inboxAst.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === "TOUCHLINE_INBOX_CATALOGUES"));
const copy = inboxAst.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === "getTouchlineInboxCopy");
assert.equal(catalogue.length, 1); assert.equal(copy.length, 1);
const inboxSource = `${catalogue[0].getText(inboxAst)}\n${copy[0].getText(inboxAst)}\nfunction renderInboxPresentation(locale,items){const draftLocalesEnabled=true,unavailable=false;const copy=getTouchlineInboxCopy(locale,true);${finalReturn(inboxAst, "renderTouchlineInboxPage")}}`;
assert.doesNotMatch(authSource + inboxSource, /createAdminClient|createClient|auth\.getUser|loadAccountLocaleContext|\.from\(/);
const bundle = bundleIsolatedBrowserFixture({
  entryPath: "tests/fixtures/CustomerAuthLandscapeBrowserFixture.tsx", cssPrefix: "customerlandscape",
  requiredSources: ["components/auth-layout.tsx", "components/auth-form.tsx", "components/reset-password-form.tsx", "components/ui.tsx",
    "components/touchline/TouchlineCustomerUtilityShell.tsx", "components/touchline/TouchlineLandscapeBoundary.tsx",
    "app/(app)/notifications/page.tsx", "app/(app)/notifications/NotificationsContent.module.css", "app/(app)/inbox/InboxContent.module.css"],
  mountScript: `const fixture=loadEntry();
    const {Link,ArrowLeft,FlaskConical,AuthForm,AuthLayout,ResetPasswordForm,LoginPlanGallery,getTouchLineAuthCopy,getTouchLineLoginCopy,touchLineAuthHref,touchLineAuthEntryHref}=fixture;
    const exports={};const require=id=>{if(id==='react/jsx-runtime')return fixture.InboxBindings.jsxRuntime;throw Error('Unexpected extracted dependency '+id);};
    ${transpileFixtureModule(authSource, "actual-auth-presentation.tsx")}
    const renderInbox=(()=>{const {Link,TouchlineInboxList,TouchlineNavigationRail,navigationStyles,styles,resolveTouchlineCatalogueLocale}=fixture.InboxBindings;
      ${transpileFixtureModule(inboxSource, "actual-inbox-presentation.tsx")}
      return renderInboxPresentation;})();
    const pathname=location.pathname,locale=document.documentElement.lang;
    const content=pathname==='/notifications'?React.createElement(fixture.NotificationsPage):pathname==='/inbox'?renderInbox(locale,fixture.InboxBindings.syntheticInboxItems(locale)):renderAuthPresentation(pathname,locale);
    flushSync(()=>root.render(React.createElement(fixture.default,{pathname,locale},content)));
    document.documentElement.dataset.fixtureReady='true';`,
});
const tailwindRequire = createRequire(require.resolve("@tailwindcss/postcss"));
const { compile } = tailwindRequire("@tailwindcss/node");
const { Scanner } = tailwindRequire("@tailwindcss/oxide");
const productPaths = [...new Set([...bundle.sources, ...pagePaths, inboxPath])];
const candidates = new Scanner({ sources: [] }).scanFiles(productPaths.filter(file => /\.tsx?$/.test(file)).map(file => ({ content: source(file), extension: path.extname(file).slice(1) })));
const globals = path.join(root, "app/globals.css");
const compiler = await compile(source("app/globals.css"), { base: path.dirname(globals), from: globals, onDependency() {} });
const sources = [...new Set([...productPaths, "app/globals.css", "tests/helpers/touchline-customer-auth-landscape-compile-worker.mts", "tests/helpers/touchline-isolated-browser-bundle.mts"])].sort();
const sha256 = Object.fromEntries(sources.map(file => [file, createHash("sha256").update(source(file)).digest("hex")]));
writeFileSync(path.join(output, "fixture.js"), bundle.script, { flag: "wx" });
writeFileSync(path.join(output, "fixture.css"), `${compiler.build(candidates)}\n${bundle.css}`, { flag: "wx" });
writeFileSync(path.join(output, "sources.json"), JSON.stringify({ sources, sha256 }, null, 2), { flag: "wx" });
