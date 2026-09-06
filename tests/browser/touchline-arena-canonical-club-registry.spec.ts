import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __touchlineArenaFetchRequests?: string[];
  }
}

const baseURL = process.env.TOUCHLINE_TEST_BASE_URL ?? "http://127.0.0.1:4318";
const squadEndpoint = "/api/football-data/premier-squad";
const inventoryEndpoint = "/api/touchline-arena/market/inventory";

test.setTimeout(60_000);

function endpointRequests(requests: readonly string[], endpoint: string) {
  return requests.filter((request) => new URL(request, baseURL).pathname === endpoint);
}

async function trackedFetchRequests(page: Page) {
  return page.evaluate(() => window.__touchlineArenaFetchRequests ?? []);
}

test("active Market loads a canonical club, rejects a textual ID, and recovers by club selection", async ({ page }, testInfo) => {
  // Arena intentionally blocks interaction in portrait on phones/tablets.
  const viewport = page.viewportSize();
  if (viewport && viewport.height > viewport.width) {
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
  }
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.addInitScript(() => {
    const requests: string[] = [];
    const nativeFetch = window.fetch.bind(window);

    Object.defineProperty(window, "__touchlineArenaFetchRequests", {
      configurable: false,
      value: requests,
      writable: false,
    });

    // Keep browser fetch real. The test only observes its URLs; the routes
    // below make authenticated Market responses deterministic.
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      requests.push(String(url));
      return nativeFetch(input, init);
    };
  });

  await page.route((url) => url.pathname === "/api/touchline-arena/state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, userId: "p2-browser-control", state: null }),
    });
  });
  await page.route((url) => url.pathname === squadEndpoint, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, players: [], rosterPlayers: [] }),
    });
  });
  await page.route((url) => url.pathname === inventoryEndpoint, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true, source: "supabase",
        providerTeamId: new URL(route.request().url()).searchParams.get("teamId"),
        cards: [], walletBalanceTc: 0, activeContractCount: 0,
        openContractSlots: 35, squadValueGbp: 0, representedClubCount: 0,
      }),
    });
  });

  const arena = page.locator("main.touchline-game");
  const market = page.locator('nav.arena-club-sections[data-panel="market"]');
  const roster = page.locator(".team-builder-roster");
  const status = roster.locator(".team-builder-roster-head > div > span");
  const clubs = page.locator(".team-builder-club-grid");

  async function openMarket(contractClub: string) {
    await page.goto(`${baseURL}/arena?contractClub=${contractClub}&skipIntro=1&lang=en-GB`, {
      waitUntil: "domcontentloaded",
    });
    await expect(arena).toHaveAttribute("data-account-sync-status", "ready");
    // Exercise Arena's existing history/popstate navigation boundary. The
    // server's /arena?panel=market redirect now targets the separate Fantasy
    // product; adding `club=Arsenal` would overwrite the invalid identity.
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("panel", "market");
      window.history.pushState(window.history.state, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(market).toBeVisible();
  }

  async function expectCanonicalRequests(teamId: string) {
    await expect.poll(async () => {
      const requests = await trackedFetchRequests(page);
      return [squadEndpoint, inventoryEndpoint].map((endpoint) =>
        endpointRequests(requests, endpoint).length > 0,
      );
    }).toEqual([true, true]);
    await expect(roster).toHaveAttribute("aria-busy", "false");
    await expect(status).toHaveText(/^0 players loaded$/i);
    const requests = await trackedFetchRequests(page);
    for (const endpoint of [squadEndpoint, inventoryEndpoint]) {
      const urls = endpointRequests(requests, endpoint);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(new URL(url, baseURL).searchParams.get("teamId")).toBe(teamId);
      }
    }
  }

  // Positive control uses the identical activation path and waits until both
  // responses have actually been consumed by the mounted Market.
  await openMarket("19");
  await expectCanonicalRequests("19");
  await expect(clubs.locator("button.is-active")).toContainText("Arsenal");

  const positiveRequests = await trackedFetchRequests(page);

  // Invalid identity is a route input, so entering it mounts a new Arena in
  // the same browser session. Wait for its rendered terminal error, not a
  // timeout or an absent panel, before asserting zero endpoint calls.
  await openMarket("Arsenal");
  await expect(status).toHaveText("Market Transfer is temporarily unavailable");
  await expect(roster).toHaveAttribute("aria-busy", "false");
  await expect(clubs.locator("button.is-active")).toHaveCount(0);
  const rejectedRequests = await trackedFetchRequests(page);
  for (const endpoint of [squadEndpoint, inventoryEndpoint]) {
    expect(endpointRequests(rejectedRequests, endpoint)).toEqual([]);
  }

  // Recover through the actual club button without navigation/remount. Keep
  // the request ledger intact so a late invalid request also fails this check.
  const rejectedDocument = await arena.elementHandle();
  expect(rejectedDocument).not.toBeNull();
  await clubs.getByRole("button", { name: /Arsenal/ }).click();
  await expectCanonicalRequests("19");
  await expect(clubs.locator("button.is-active")).toContainText("Arsenal");
  expect(await rejectedDocument!.evaluate((element) => element === document.querySelector("main.touchline-game"))).toBe(true);
  expect(runtimeErrors).toEqual([]);
  await testInfo.attach("market-request-evidence", {
    contentType: "application/json",
    body: JSON.stringify({
      positive: positiveRequests.filter((url) => [squadEndpoint, inventoryEndpoint].includes(new URL(url, baseURL).pathname)),
      invalid: rejectedRequests.filter((url) => [squadEndpoint, inventoryEndpoint].includes(new URL(url, baseURL).pathname)),
      recovered: (await trackedFetchRequests(page)).filter((url) => [squadEndpoint, inventoryEndpoint].includes(new URL(url, baseURL).pathname)),
      recoveryPreservedMountedArena: true,
      runtimeErrors,
    }, null, 2),
  });
});
