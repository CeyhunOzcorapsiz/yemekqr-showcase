import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
async function account(request) {
  const email = randomUUID() + "@browser.test";
  const res = await request.post("/api/auth/register-restaurant", {
    data: {
      restaurantName: "Tarayıcı Restoranı",
      adminName: "Yönetici",
      email,
      password: "Browser123!",
    },
  });
  expect(res.ok()).toBeTruthy();
  return { email, data: await res.json() };
}
async function product(request, name = "Mercimek Çorbası") {
  const res = await request.post("/api/products", {
    data: { name, category: "Çorba", price: 6050 },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}
test("Restoran kaydı, menü revizyonu, satış ve müşteriye açık fiş", async ({
  page,
  browser,
}) => {
  await page.goto("/register");
  await page.getByLabel("Restoran adı", { exact: true }).fill("Pilot Lokanta");
  await page.getByLabel("Yönetici adı soyadı").fill("Pilot Yönetici");
  await page
    .getByLabel("E-posta", { exact: true })
    .fill(randomUUID() + "@browser.test");
  await page.getByLabel("Şifre", { exact: true }).fill("Browser123!");
  await page
    .getByRole("button", { name: "Restoranı oluştur", exact: true })
    .click();
  await expect(page).toHaveURL(/\/menu$/);
  await page.getByLabel("Ürün adı", { exact: true }).fill("Mercimek Çorbası");
  await page.getByLabel("Kategori", { exact: true }).fill("Çorba");
  await page.getByLabel("Fiyat (TL)", { exact: true }).fill("60,50");
  await page.getByRole("button", { name: "Ürün ekle", exact: true }).click();
  let row = page.getByRole("row").filter({ hasText: "Mercimek Çorbası" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Düzenle", exact: true }).click();
  await page.getByLabel("Fiyat (TL)", { exact: true }).fill("70,50");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(row).toContainText("70,50");
  await row.getByRole("button", { name: "Gizle", exact: true }).click();
  await expect(row).toContainText("Gizli");
  await row.getByRole("button", { name: "Satışa aç", exact: true }).click();
  await expect(row).toContainText("Satışta");
  await page.getByRole("link", { name: "Sipariş al", exact: true }).click();
  await page
    .locator(".product-card")
    .filter({ hasText: "Mercimek Çorbası" })
    .click();
  await page
    .getByRole("button", { name: "Mercimek Çorbası artır", exact: true })
    .click();
  await page.getByRole("button", { name: "Onayla ve fişi oluştur" }).click();
  await expect(page).toHaveURL(/\/receipt\//);
  await expect(
    page.getByRole("heading", { name: "Pilot Lokanta" }),
  ).toBeVisible();
  await expect(page.locator(".receipt-total")).toContainText("141,00");
  const customer = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const receipt = await customer.newPage();
  await receipt.goto(page.url());
  await expect(
    receipt.getByRole("heading", { name: "Pilot Lokanta" }),
  ).toBeVisible();
  await expect(
    receipt.getByRole("link", { name: "Yeni sipariş", exact: true }),
  ).toHaveCount(0);
  expect(
    await receipt.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  mkdirSync(".cache/e2e", { recursive: true });
  await receipt
    .getByRole("combobox", { name: "Kağıt genişliği", exact: true })
    .selectOption("58");
  await receipt.emulateMedia({ media: "print" });
  await expect(
    receipt.getByRole("button", { name: "Yazdır", exact: true }),
  ).toBeHidden();
  expect(
    await receipt
      .locator(".receipt-page")
      .evaluate((e) => e.getBoundingClientRect().width),
  ).toBeLessThan(200);
  await receipt.emulateMedia({ media: "screen" });
  await receipt
    .getByRole("combobox", { name: "Kağıt genişliği", exact: true })
    .selectOption("80");
  await receipt.screenshot({
    path: ".cache/e2e/customer-mobile.png",
    fullPage: true,
  });
  await customer.close();
});
test("Kaybolan satış yanıtında tekrar deneme çift kayıt oluşturmaz", async ({
  page,
}) => {
  await account(page.request);
  await product(page.request);
  await page.goto("/new-order");
  await page.locator(".product-card").click();
  let first = true;
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() === "POST" && first) {
      first = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Onayla ve fişi oluştur" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Onayla ve fişi oluştur" }).click();
  await expect(page).toHaveURL(/\/receipt\//);
  const list = await page.request.get("/api/orders");
  expect((await list.json()).total).toBe(1);
});
test("Geçici oturum kontrol hatası cookie oturumunu silmez", async ({
  page,
}) => {
  await account(page.request);
  await page.route("**/api/auth/me", (route) => route.abort("failed"));
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/api/auth/me");
  await page.getByRole("button", { name: "Tekrar dene", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Siparişe hazır" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("yemekqr_token")),
  ).toBeNull();
});
test("Bekleyen tahsilat, iade ve personel yönetimi ekranları", async ({
  page,
}) => {
  await account(page.request);
  await product(page.request);
  await page.goto("/new-order");
  await page.locator(".product-card").click();
  await page
    .getByRole("combobox", { name: "Ödeme", exact: true })
    .selectOption("unpaid");
  await page.getByRole("button", { name: "Onayla ve fişi oluştur" }).click();
  await expect(page).toHaveURL(/\/receipt\//);
  await page.getByRole("link", { name: "Geçmiş", exact: true }).click();
  await page.getByRole("button", { name: "Tahsil et", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Ödeme türü", exact: true })
    .selectOption("card");
  await page
    .getByRole("button", { name: "İşlemi onayla", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Tahsil et", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "İade", exact: true }).click();
  await page
    .getByLabel("İşlem gerekçesi", { exact: true })
    .fill("Eksik ürün iadesi");
  await page.getByLabel("İade tutarı (TL)", { exact: true }).fill("10,00");
  await page
    .getByRole("button", { name: "İşlemi onayla", exact: true })
    .click();
  await expect(page.getByText("Kısmi iade", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Personel", exact: true }).click();
  await page.getByLabel("Ad soyad", { exact: true }).fill("Yeni Kasiyer");
  await page
    .getByLabel("E-posta", { exact: true })
    .fill(randomUUID() + "@browser.test");
  await page.getByLabel("Şifre", { exact: true }).fill("Cashier123!");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "Yeni Kasiyer" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Düzenle", exact: true }).click();
  await page.getByLabel("Hesap aktif", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(row).toContainText("Kapalı");
  await page.getByRole("link", { name: "Raporlar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Satış ve tahsilat raporu" }),
  ).toBeVisible();
  await expect(page.getByText("₺50,50", { exact: true })).toBeVisible();
});

test("Fotoğraf yükleme, mock analiz, kasiyer düzeltmesi ve analiz raporu", async ({
  page,
}) => {
  await account(page.request);
  await product(page.request);
  await page.goto("/camera-order");
  await page
    .getByLabel("Fotoğraf yükle", { exact: true })
    .setInputFiles("e2e/fixtures/plate.png");
  await expect(
    page.getByRole("heading", { name: "Ürünleri kontrol et" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Test modu");
  await page
    .getByRole("button", { name: "Mercimek Çorbası artır", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Kontrol ettim, fişi oluştur", exact: true })
    .click();
  await expect(page).toHaveURL(/\/receipt\//);
  await expect(page.locator(".receipt-total")).toContainText("121,00");
  const report = await page.request.get("/api/reports/ai");
  const metrics = await report.json();
  expect(metrics.reviewed).toBe(1);
  expect(metrics.corrected).toBe(1);
  expect(metrics.modes).toEqual(["mock"]);
});
test("Vardiya açılışı, nakit hareketi ve İngilizce kapanış", async ({
  page,
}) => {
  await account(page.request);
  await page.goto("/shift");
  await page.getByLabel("Açılış nakdi (TL)").fill("100");
  await page.getByRole("button", { name: "Vardiya aç" }).click();
  await expect(page.getByText("Beklenen nakit", { exact: true })).toBeVisible();
  await page.getByLabel("Tutar (TL)").fill("20");
  await page.getByLabel("Açıklama").fill("Bozuk para");
  await page.getByRole("button", { name: "Hareket ekle" }).click();
  await expect(page.getByText(/Bozuk para/).first()).toBeVisible();
  await page
    .getByRole("combobox", { name: "Dil", exact: true })
    .selectOption("en");
  await expect(page.getByRole("heading", { name: "Cash shift" })).toBeVisible();
  await page.getByLabel("Counted cash (TRY)").fill("115");
  await page.getByRole("button", { name: "Close shift" }).click();
  await expect(page.getByText("There is no open shift.")).toBeVisible();
  await page.locator("details").first().locator("summary").click();
  await expect(page.locator("details").first()).toContainText(
    "Cash difference",
  );
  await expect(page.locator("details").first()).toContainText("5.00");
});
test("Hesap şifresi ve yönetici denetim geçmişi", async ({ page }) => {
  await account(page.request);
  await page.goto("/account");
  await page.getByLabel("Mevcut şifre").fill("Browser123!");
  await page.getByLabel("Yeni şifre", { exact: true }).fill("Different123!");
  await page.getByLabel("Yeni şifre tekrarı").fill("Different123!");
  await page.getByRole("button", { name: "Şifre değiştir" }).click();
  await expect(page.getByRole("status")).toContainText("Şifre güncellendi");
  await page.getByRole("link", { name: "Denetim geçmişi" }).click();
  await expect(
    page.getByRole("cell", { name: "Şifre değiştirildi" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Dil", exact: true })
    .selectOption("en");
  await expect(
    page.getByRole("heading", { name: "Audit history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Password changed" }),
  ).toBeVisible();
});
