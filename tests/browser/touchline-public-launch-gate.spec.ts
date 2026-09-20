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
  expect(root.headers().location).toContain("/arena?lang=pt-BR");

  const retired = await request.get(`${baseURL}/coming-soon?lang=pt-BR`, { maxRedirects: 0 });
  expect(retired.status()).toBeGreaterThanOrEqual(300);
  expect(retired.status()).toBeLessThan(400);
  expect(retired.headers().location).toContain("/arena?lang=pt-BR");

  for (const route of ["/login?lang=pt-BR", "/register?lang=pt-BR"] as const) {
    const response = await request.get(`${baseURL}${route}`);
    expect(response.status(), route).toBe(200);
    expect(response.headers()["x-touchline-launch-gate"], route).toBeUndefined();
  }

  await page.goto(`${baseURL}/arena?lang=pt-BR`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("touchline-public-launch-gate")).toHaveCount(0);
  await expect(page.getByText(/A ARENA ESTÁ QUASE PRONTA|LANÇAMENTO EM BREVE/i)).toHaveCount(0);
  await expect(page.getByTestId("touchline-arena-intro")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("desktop, phone, tablet and TV landscape render the public Arena without pre-launch content or overflow", async ({ browser }) => {
  const matrices: ReadonlyArray<BrowserContextOptions> = [
    { viewport: { width: 1280, height: 720 } },
    { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true },
    { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
    { viewport: { width: 1024, height: 768 }, hasTouch: true },
    { viewport: { width: 1366, height: 1024 }, hasTouch: true },
    { viewport: { width: 1920, height: 1080 } },
  ];

  for (const options of matrices) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.goto(`${baseURL}/arena?lang=pt-BR`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("touchline-public-launch-gate")).toHaveCount(0);
    await expect(page.getByTestId("touchline-arena-intro")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
  }
});

test("TV-size browser exposes a visible keyboard and remote-control focus target", async ({ browser, browserName }) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/arena?lang=pt-BR`, { waitUntil: "domcontentloaded" });
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

test("phone portrait blocks gameplay and rotating releases the same page without reload", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(`${baseURL}/arena?lang=pt-BR`, { waitUntil: "domcontentloaded" });

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
  await expect(page.locator("main.touchline-game")).toBeVisible();
  await expect(page.getByText(/Prepare seu clube para a próxima rodada/i)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.touchlineOrientation)).toBe("landscape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(gate).toBeVisible();
  await expect(content).toHaveJSProperty("inert", true);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(gate).toBeHidden();
  await expect(page.locator("main.touchline-game")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
