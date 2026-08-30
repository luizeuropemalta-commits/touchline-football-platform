import { expect, test, type BrowserContextOptions } from "@playwright/test";

const baseURL = process.env.TOUCHLINE_TEST_BASE_URL ?? "http://127.0.0.1:3130";

const customerRoutes = [
  "/arena?lang=pt-BR",
  "/touchline-clubs?lang=pt-BR",
  "/live?lang=pt-BR",
  "/market-transfer?lang=pt-BR",
  "/touchline-player-card-rankings?lang=pt-BR",
] as const;

test("launch gate covers customer pages while auth remains available", async ({ page, request }) => {
  for (const route of customerRoutes) {
    const response = await request.get(`${baseURL}${route}`);
    expect(response.status(), route).toBe(200);
    expect(response.headers()["x-touchline-launch-gate"], route).toBe("global");
    expect(response.headers()["cache-control"], route).toContain("no-store");
    expect(response.headers()["x-robots-tag"], route).toContain("noindex");
  }

  for (const route of ["/login?lang=pt-BR", "/register?lang=pt-BR"] as const) {
    const response = await request.get(`${baseURL}${route}`);
    expect(response.status(), route).toBe(200);
    expect(response.headers()["x-touchline-launch-gate"], route).toBeUndefined();
  }

  await page.goto(`${baseURL}/arena?lang=pt-BR`);
  await expect(page.getByTestId("touchline-public-launch-gate")).toBeVisible();
  await expect(page.getByRole("heading", { name: "A ARENA ESTÁ QUASE PRONTA" })).toBeVisible();
  await expect(page.getByText("Estamos finalizando cada detalhe", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /Criar minha conta/i })).toHaveAttribute("href", /\/register/);
  await expect(page.getByRole("link", { name: /Já tenho uma conta/i })).toHaveAttribute("href", /\/login/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("desktop and touch landscape render the premium gate without overflow", async ({ browser }) => {
  const matrices: ReadonlyArray<BrowserContextOptions> = [
    { viewport: { width: 1280, height: 720 } },
    { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
    { viewport: { width: 1024, height: 768 }, hasTouch: true },
  ];

  for (const options of matrices) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.goto(`${baseURL}/arena?lang=pt-BR`);
    await expect(page.getByTestId("touchline-public-launch-gate")).toBeVisible();
    await expect(page.getByRole("heading", { name: "A ARENA ESTÁ QUASE PRONTA" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
  }
});

test("touch portrait exposes only the canonical rotation boundary", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(`${baseURL}/arena?lang=pt-BR`);

  const rotationGate = page.getByRole("dialog", { name: "Gire para o modo horizontal" });
  await expect(rotationGate).toBeVisible();
  const protectedContent = page.locator("[data-touchline-main-content-fallback]");
  await expect(protectedContent).toHaveAttribute("aria-hidden", "true");
  expect(await protectedContent.evaluate((node) => (node as HTMLElement).inert)).toBe(true);
  expect(await rotationGate.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return style.position === "fixed"
      && rect.left === 0
      && rect.top === 0
      && rect.width >= window.innerWidth
      && rect.height >= window.innerHeight
      && style.backgroundImage !== "none";
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
