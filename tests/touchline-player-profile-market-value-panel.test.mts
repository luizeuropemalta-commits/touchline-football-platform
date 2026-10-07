import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("../app/touchline-players/[player]/page.tsx", import.meta.url);
const source = readFileSync(sourceUrl, "utf8");
const sourceFile = ts.createSourceFile(
  sourceUrl.pathname,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function exactCards() {
  const cards: ts.JsxSelfClosingElement[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isJsxSelfClosingElement(node) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === "TouchlineEliteExactCard"
    ) {
      cards.push(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return cards;
}

function attribute(card: ts.JsxSelfClosingElement, name: string) {
  const value = card.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.text === name,
  );
  assert.ok(value, `TouchlineEliteExactCard must retain ${name}`);
  return value;
}

function expressionText(attributeValue: ts.JsxAttribute) {
  assert.ok(
    attributeValue.initializer && ts.isJsxExpression(attributeValue.initializer),
    `${attributeValue.name.text} must be a JSX expression`,
  );
  assert.ok(attributeValue.initializer.expression);
  return attributeValue.initializer.expression.getText(sourceFile);
}

test("the public player profile hides market value on exactly its three ExactCard renders", () => {
  const cards = exactCards();
  assert.equal(cards.length, 3);

  for (const card of cards) {
    assert.equal(attribute(card, "hideMarketValuePanel").initializer, undefined);
    assert.equal(expressionText(attribute(card, "player")), "exactPlayer");
    assert.equal(expressionText(attribute(card, "runtimeLocaleOverride")), "locale");
    assert.equal(
      expressionText(attribute(card, "rankingMode")),
      'previewTier ? "preview" : "live"',
    );
    assert.equal(
      expressionText(attribute(card, "layoutStorageKey")),
      "TOUCHLINE_CARD_STUDIO_LAYOUT_KEY",
    );
  }

  assert.equal(
    cards.filter((card) =>
      card.attributes.properties.some(
        (property) => ts.isJsxAttribute(property) && property.name.text === "playerProfileHref",
      ),
    ).length,
    2,
  );
});

test("the player profile retains its canonical rating, identity, position, and ranking inputs", () => {
  assert.match(source, /const \{ card, exactPlayer, club, isLocalCard \} = profile;/);
  assert.match(source, /const totalRatingText = competition\.totalRating;/);
  assert.match(source, /exactPlayer\.totalRating = totalRatingText;/);
  assert.match(
    source,
    /exactPlayer\.matchRating = playerStatistics\.currentOrSelectedFixture\?\.rating \?\? null;/,
  );
  assert.match(
    source,
    /const cardFactPosition = canonicalIdentity\?\.position \?\? exactPlayer\.position \?\? card\.position;/,
  );
  assert.match(source, /const rankingGroupLabel = competition\.positionGroup/);
  assert.match(source, /const displayPosition = localizedPositionLabel\(/);
});
