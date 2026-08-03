import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rendererUrl = new URL("../components/touchline/club-owner/ClubOwnerRenewalCenterRenderer.tsx", import.meta.url);
const pageUrl = new URL("../app/club-owner/[owner]/renewals/page.tsx", import.meta.url);

test("Renewal Center screen keeps the user scope server-owned and offers no checkout mutation", async () => {
  const [renderer, page] = await Promise.all([
    readFile(fileURLToPath(rendererUrl), "utf8"),
    readFile(fileURLToPath(pageUrl), "utf8"),
  ]);

  assert.match(renderer, /readTouchlineRenewalCenter\(admin, user\.id\)/);
  assert.match(renderer, /requestedSlug === userSlug/);
  assert.match(renderer, /touchLineAuthEntryHref\([\s\S]*?"\/login"[\s\S]*?renewals\?lang=/);
  assert.match(renderer, /if \(user && !isOwner\) notFound\(\)/);
  assert.match(renderer, /Sem checkout ativo/);
  assert.match(renderer, /No checkout active/);
  assert.doesNotMatch(renderer, /checkout_touchline_market_cart/);
  assert.doesNotMatch(renderer, /fetch\(/);
  assert.doesNotMatch(renderer, /\.insert\(/);
  assert.doesNotMatch(renderer, /\.update\(/);
  assert.match(page, /ClubOwnerRenewalCenterRenderer/);
});
