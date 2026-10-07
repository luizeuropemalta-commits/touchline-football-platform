import { expect, test, type BrowserContextOptions } from "@playwright/test";

const baseURL = process.env.TOUCHLINE_TEST_BASE_URL ?? "http://127.0.0.1:3130";
test.setTimeout(120_000);

const publicRoutes = [
  "/arena?lang=pt-BR",
  "/touchline-clubs?lang=pt-BR",
  "/live?lang=pt-BR",
  "/touchline-player-card-rankings?lang=pt-BR",
] as const;

test("the public product opens normally while auth pages stay available", async ({ page, request }) => {
  for (const route of publicRoutes) {
    const response = await request.get(`${baseURL}${route}`);
    expect(response.status(), route).toBe(200);
    expect(response.headers()["x-touchline-launch-gate"], route).toBeUndefined();
  }

  const root = await request.get(`${baseURL}/?lang=pt-BR`, { maxRedirects: 0 });
  expect(root.status()).toBeGreaterThanOrEqual(300);
  expect(root.status()).toBeLessThan(400);
  expect(new URL(root.headers().location, baseURL).pathname).toBe("/intro");
  expect(new URL(root.headers().location, baseURL).search).toBe("?lang=pt-BR");

  const retired = await request.get(`${baseURL}/coming-soon?lang=pt-BR`, { maxRedirects: 0 });
  expect(retired.status()).toBeGreaterThanOrEqual(300);
  expect(retired.status()).toBeLessThan(400);
  expect(new URL(retired.headers().location, baseURL).pathname).toBe("/intro");
  expect(new URL(retired.headers().location, baseURL).search).toBe("?lang=pt-BR");

  const compatibility = await request.get(`${baseURL}/arena?lang=pt-BR&intro=first&contractClub=19&demoLineup=1&panel=market`, { maxRedirects: 0 });
  expect(compatibility.status()).toBeGreaterThanOrEqual(300);
  expect(compatibility.status()).toBeLessThan(400);
  const compatibilityDestination = new URL(compatibility.headers().location, baseURL);
  expect(compatibilityDestination.pathname).toBe("/intro");
  expect([...compatibilityDestination.searchParams.entries()].sort()).toEqual([["intro", "first"], ["lang", "pt-BR"]]);

  for (const route of ["/login?lang=pt-BR", "/register?lang=pt-BR"] as const) {
    const response = await request.get(`${baseURL}${route}`);
    expect(response.status(), route).toBe(200);
    expect(response.headers()["x-touchline-launch-gate"], route).toBeUndefined();
  }

  await page.goto(`${baseURL}/arena?lang=pt-BR&intro=first`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("touchline-public-launch-gate")).toHaveCount(0);
  await expect(page.getByText(/A ARENA ESTÁ QUASE PRONTA|LANÇAMENTO EM BREVE/i)).toHaveCount(0);
  await expect(page.getByTestId("touchline-arena-intro")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("desktop, phone, tablet and TV landscape render the public Arena without pre-launch content or overflow", async ({ browser, browserName }) => {
  const matrices: ReadonlyArray<BrowserContextOptions> = [
    { viewport: { width: 1280, height: 720 } },
    { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true },
    { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
    { viewport: { width: 1024, height: 768 }, hasTouch: true },
    { viewport: { width: 1366, height: 1024 }, hasTouch: true },
    { viewport: { width: 1920, height: 1080 } },
  ];

  for (const options of matrices) {
    // Firefox supports these viewport/touch checks, but not mobile emulation.
    const contextOptions = { ...options };
    if (browserName === "firefox") delete contextOptions.isMobile;
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await page.goto(`${baseURL}/arena?lang=pt-BR&intro=first`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("touchline-public-launch-gate")).toHaveCount(0);
    await expect(page.getByTestId("touchline-arena-intro")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
  }
});

test("TV-size browser exposes a visible keyboard and remote-control focus target", async ({ browser, browserName }) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/arena?lang=pt-BR&intro=first`, { waitUntil: "domcontentloaded" });
  const intro = page.getByTestId("touchline-arena-intro");
  await expect(intro).toBeVisible();
  await expect.poll(() => intro.evaluate((node) => document.activeElement === node)).toBe(true);

  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  const soundButton = intro.getByRole("button", { name: /Ativar som da Arena|Silenciar Arena/ });
  await expect(soundButton).toBeFocused();
  expect(await soundButton.evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return styles.boxShadow !== "none" || (styles.outlineStyle !== "none" && styles.outlineWidth !== "0px");
  })).toBe(true);
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  const skipButton = page.getByRole("button", { name: "Pular intro" });
  await expect(skipButton).toBeFocused();
  expect(await skipButton.evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return styles.boxShadow !== "none" || (styles.outlineStyle !== "none" && styles.outlineWidth !== "0px");
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});

test("phone portrait preserves the intro through rotation and guest Market entry reaches login", async ({ browser, request }) => {
  // Cold Next development compilation previously left the actual post-click
  // ClubOwner RSC request pending. Establish server readiness through bounded
  // public GETs without navigating or supplying an authenticated browser state.
  const clubOwner = await request.get(`${baseURL}/clubowner?lang=pt-BR`, { maxRedirects: 0, timeout: 60_000 });
  expect(clubOwner.status()).toBeGreaterThanOrEqual(300);
  expect(clubOwner.status()).toBeLessThan(400);
  const guestDestination = new URL(clubOwner.headers().location, baseURL);
  expect(guestDestination.origin).toBe(new URL(baseURL).origin);
  expect(guestDestination.pathname).toBe("/login");
  expect(guestDestination.searchParams.get("lang")).toBe("pt-BR");
  expect(guestDestination.searchParams.get("returnTo")).toBe("/clubowner?lang=pt-BR");
  const loginReady = await request.get(guestDestination.toString(), { timeout: 60_000 });
  expect(loginReady.status()).toBe(200);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(`${baseURL}/arena?lang=pt-BR&intro=first`, { waitUntil: "domcontentloaded" });

  const gate = page.getByRole("dialog", { name: "Gire para o modo horizontal" });
  // DocumentLocaleSync moves the skip-link ID to the semantic main. The
  // persistent orientation wrapper owns inert; its descendants inherit it.
  const content = page.locator("[data-touchline-main-content-fallback]");
  await expect(gate).toBeVisible();
  await expect(content).toHaveJSProperty("inert", true);
  expect(await page.locator("#touchline-main-content").evaluate((node) => Boolean(node.closest("[inert]")))).toBe(true);
  await expect(page.getByTestId("touchline-arena-intro")).toBeHidden();
  await page.keyboard.press("Tab");
  await expect(gate).toBeFocused();
  const mountedContent = await content.elementHandle();
  const startingUrl = page.url();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(gate).toBeHidden();
  await expect(content).toHaveJSProperty("inert", false);
  expect(await mountedContent!.evaluate((node) => node === document.querySelector("[data-touchline-main-content-fallback]"))).toBe(true);
  expect(page.url()).toBe(startingUrl);
  await expect(page.getByTestId("touchline-arena-intro")).toBeVisible();
  await page.getByRole("button", { name: "Pular intro" }).click();
  // The intro intentionally leaves this document's route for customer-only
  // ClubOwner. A credential-free guest must reach the real login form, not
  // a fabricated account or the retired in-place Arena game.
  await expect(page).toHaveURL((url) => url.pathname === "/login"
    && url.searchParams.get("lang") === "pt-BR"
    && url.searchParams.get("returnTo") === "/clubowner?lang=pt-BR");
  const loginForm = page.locator('form:has(input[name="email"])');
  await expect(loginForm.locator('input[name="email"]')).toBeVisible();
  await expect(loginForm.locator('input[name="password"]')).toBeVisible();
  await expect(loginForm.locator('input[name="return_to"]')).toHaveValue("/clubowner?lang=pt-BR");
  const loginDocument = await content.elementHandle();
  expect(loginDocument).not.toBeNull();
  const loginUrl = page.url();
  expect(await page.evaluate(() => document.documentElement.dataset.touchlineOrientation)).toBe("landscape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(gate).toBeVisible();
  await expect(content).toHaveJSProperty("inert", true);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(gate).toBeHidden();
  await expect(content).toHaveJSProperty("inert", false);
  await expect(loginForm.locator('input[name="email"]')).toBeVisible();
  await expect(loginForm.locator('input[name="password"]')).toBeVisible();
  expect(await loginDocument!.evaluate((node) => node === document.querySelector("[data-touchline-main-content-fallback]"))).toBe(true);
  expect(page.url()).toBe(loginUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
