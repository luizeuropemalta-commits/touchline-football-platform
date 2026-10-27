import assert from "node:assert/strict";
import ts from "typescript";

// Only these CSS-module classes occur in the page's unmounted right rail.
// They must never stand in for selectors used by the isolated lineup/nav.
const unmountedRailClasses: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  officialLeagueStyles: {
    layout: "isolated-unmounted-rail-official-layout",
    fixture: "isolated-unmounted-rail-official-fixture",
  },
  premiumStyles: {
    nextFixtureTeams: "isolated-unmounted-rail-premium-teams",
    nextFixtureClub: "isolated-unmounted-rail-premium-club",
    nextFixtureKickoff: "isolated-unmounted-rail-premium-kickoff",
    nextFixtureVenue: "isolated-unmounted-rail-premium-venue",
    nextFixtureVenueImage: "isolated-unmounted-rail-premium-venue-image",
    nextFixtureVenueCopy: "isolated-unmounted-rail-premium-venue-copy",
  },
};

export function extractIsolatedPageCss(ast: ts.SourceFile): string {
  const styles: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && ts.isIdentifier(node.openingElement.tagName)
      && node.openingElement.tagName.text === "style") {
      for (const child of node.children) {
        if (ts.isJsxText(child) && !child.text.trim()) continue;
        assert.ok(ts.isJsxExpression(child) && child.expression, "page style must contain a template literal");
        const expression = child.expression;
        if (ts.isNoSubstitutionTemplateLiteral(expression)) {
          styles.push(expression.text);
          continue;
        }
        assert.ok(ts.isTemplateExpression(expression), "page style must contain a template literal");
        let css = expression.head.text;
        for (const span of expression.templateSpans) {
          const access = span.expression;
          assert.ok(ts.isPropertyAccessExpression(access) && !access.questionDotToken
            && ts.isIdentifier(access.expression) && ts.isIdentifier(access.name),
          "unsupported page CSS interpolation");
          const mapName = access.expression.text, className = access.name.text;
          assert.ok(Object.hasOwn(unmountedRailClasses, mapName)
            && Object.hasOwn(unmountedRailClasses[mapName], className),
          "unknown page CSS module class");
          assert.match(css, /\.club-hub-right-rail \.$/,
            "CSS-module substitution is restricted to an unmounted right-rail selector");
          css += unmountedRailClasses[mapName][className] + span.literal.text;
        }
        styles.push(css);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return styles.join("\n");
}
