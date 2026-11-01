import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
async function account(page) {
  const response = await page.request.post("/api/auth/register-restaurant", {
    data: {
      restaurantName: "International Kitchen",
      adminName: "Alex",
      email: randomUUID() + "@english.test",
      password: "English123!",
    },
  });
  expect(response.ok()).toBeTruthy();
}
async function english(page, url) {
  await page.goto(url);
  await page
    .getByRole("combobox", { name: "Dil", exact: true })
    .selectOption("en");
}
test("guest language persists and errors and validation translate", async ({
  page,
}) => {
  await english(page, "/login");
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("YemekQR | Checkout and Orders");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Language", exact: true }),
  ).toHaveValue("en");
  await page.getByLabel("Email", { exact: true }).fill("unknown@english.test");
  await page.getByLabel("Password", { exact: true }).fill("Wrong123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Incorrect email or password.",
  );
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("tr");
  await expect(page.getByRole("alert")).toHaveText(
    "E-posta veya şifre hatalı.",
  );
  await page
    .getByRole("combobox", { name: "Dil", exact: true })
    .selectOption("en");
  await page
    .getByRole("link", { name: "Register restaurant", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create restaurant", exact: true })
    .click();
  expect(
    await page
      .getByLabel("Restaurant name", { exact: true })
      .evaluate((el) => el.validationMessage),
  ).toBe("Please fill in this field.");
  mkdirSync(".cache/e2e", { recursive: true });
  await page.goto("/login");
  await page.screenshot({
    path: ".cache/e2e/login-english.png",
    fullPage: true,
  });
});
test("bilingual menu and cart, receipt snapshot and English CSV", async ({
  page,
  browser,
}) => {
  await account(page);
  await english(page, "/menu");
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Mercimek Çorbası");
  await page
    .getByLabel("Product name (English)", { exact: true })
    .fill("Lentil soup");
  await page.getByLabel("Category", { exact: true }).fill("Çorba");
  await page.getByLabel("Category (English)", { exact: true }).fill("Soup");
  await page.getByLabel("Price (TRY)", { exact: true }).fill("60.50");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Menu saved." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "New order", exact: true }).click();
  await expect(page.locator(".product-card")).toContainText("Lentil soup");
  await page.locator(".product-card").click();
  await page
    .getByRole("button", { name: "Lentil soup increase", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("tr");
  await expect(page.locator(".cart-panel")).toContainText("Mercimek Çorbası");
  await expect(page.locator(".cart-total")).toContainText("121,00");
  await page
    .getByRole("combobox", { name: "Dil", exact: true })
    .selectOption("en");
  await expect(page.locator(".cart-total")).toContainText("121.00");
  await page
    .getByRole("button", { name: "Confirm and create receipt", exact: true })
    .click();
  await expect(page).toHaveURL(/\/receipt\//);
  const url = page.url();
  const list = await page.request.get("/api/products");
  const p = (await list.json())[0];
  await page.request.put("/api/products/" + p.id, {
    data: { nameEn: "Changed name" },
  });
  await page.reload();
  await expect(page.locator(".receipt-line").first()).toContainText(
    "Lentil soup",
  );
  await expect(
    page.getByRole("combobox", { name: "Paper width", exact: true }),
  ).toBeVisible();
  const customer = await browser.newContext();
  const receipt = await customer.newPage();
  await receipt.goto(url);
  await receipt
    .getByRole("combobox", { name: "Dil", exact: true })
    .selectOption("en");
  await expect(receipt.locator(".receipt-line").first()).toContainText(
    "Lentil soup",
  );
  await expect(
    receipt.getByRole("link", { name: "New order", exact: true }),
  ).toHaveCount(0);
  await customer.close();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV", exact: true }).click();
  const download = await pending;
  const csv = readFileSync(await download.path(), "utf8");
  expect(csv).toContain('"Metric";"Value"');
  expect(csv).toContain("Lentil soup");
  expect(csv).not.toContain("Ölçüm");
});
test("staff errors, history, camera and report are English", async ({
  page,
}) => {
  await account(page);
  const created = await page.request.post("/api/products", {
    data: {
      name: "Pilav",
      nameEn: "Rice pilaf",
      category: "Yardımcı",
      categoryEn: "Side dish",
      price: 5000,
    },
  });
  expect(created.ok()).toBeTruthy();
  await english(page, "/staff");
  await expect(
    page.getByRole("heading", { name: "Staff management", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: "Alex" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("Account active", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The last active administrator cannot be deactivated or changed to a cashier.",
  );
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Order history", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No orders match these filters.", { exact: true }),
  ).toBeVisible();
  await page.goto("/camera-order");
  await page
    .getByLabel("Upload photo", { exact: true })
    .setInputFiles("e2e/fixtures/plate.png");
  await expect(
    page.getByRole("heading", { name: "Review products", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Test mode:");
  await expect(page.locator(".cart-line")).toContainText("Rice pilaf");
  await page
    .getByRole("button", { name: "Reviewed, create receipt", exact: true })
    .click();
  await expect(page).toHaveURL(/\/receipt\//);
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Camera usage metrics", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Net payments", { exact: true })).toBeVisible();
});
