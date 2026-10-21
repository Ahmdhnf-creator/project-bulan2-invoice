// Browser E2E for BillMate app shell (sidebar) + redesigned dashboard.
// Reads credentials from env; never logs them.
// Creates isolated fixture data (1 project + 2 invoices under dev) directly
// via Prisma, cleans up in `finally`. Never touches seed data.
import { chromium } from "playwright";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./app/generated/prisma/client";

const BASE = process.env.BILLMATE_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.BILLMATE_EMAIL;
const PASSWORD = process.env.BILLMATE_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("SETUP FAIL: BILLMATE_EMAIL and BILLMATE_PASSWORD env vars required");
  process.exit(2);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Same formatter as app/lib/format.ts formatIdr.
const idr = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// ?period=2026-10 cards (explicit period → deterministic):
// Nilai proyek = all-time 250jt; invoice terbit Okt = seed 166.5jt;
// pembayaran Okt = seed 66jt; pengeluaran Okt = seed 18.5jt.
const OCT = { year: "2026", month: "10" };

const NAV = [
  ["/", "Ringkasan"],
  ["/projects", "Proyek"],
  ["/invoices", "Invoice"],
  ["/payments", "Pembayaran"],
  ["/expenses", "Pengeluaran"],
  ["/customers", "Pelanggan"],
  ["/reports", "Laporan"],
  ["/business-profile", "Pengaturan"],
];

let passCount = 0;
let failCount = 0;
function record(name, ok, detail = "") {
  if (ok) passCount++;
  else failCount++;
  console.log(`${ok ? "PASS" : "FAIL"} [browser] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function bodyText(page) {
  return (await page.locator("main, body").first().textContent().catch(() => "")) ?? "";
}

async function uiLogin(page, email, password) {
  if (!page.url().startsWith(`${BASE}/login`)) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  }
  await page.locator("#email").waitFor({ timeout: 15000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 20000 }).catch(() => {});
}

async function readCard(page, id) {
  return (await page.locator(`#${id}`).first().textContent().catch(() => "")) ?? "";
}

// --- Test fixture ---
let devUser = null;
let testProject = null;
let paidInvoice = null; // INV-2026-SHPAID — Lunas
let overdueInvoice = null; // INV-2026-SHOVER — Terlambat (due 2026-09-30)
let donut = { lunas: 0, belum: 0, terlambat: 0 };
let donutTotal = 0;
let expectedProjectValue = 0;

async function cleanupFixture() {
  try {
    for (const inv of [paidInvoice, overdueInvoice]) {
      if (!inv) continue;
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: inv.id } }).catch(() => {});
      await prisma.payment.deleteMany({ where: { invoiceId: inv.id } }).catch(() => {});
      await prisma.invoice.delete({ where: { id: inv.id } }).catch(() => {});
    }
    if (testProject) {
      await prisma.project.delete({ where: { id: testProject.id } }).catch(() => {});
    }
  } catch (error) {
    console.error("CLEANUP:", error instanceof Error ? error.message : error);
  }
}

try {
  devUser = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!devUser) throw new Error("dev user not found");

  testProject = await prisma.project.create({
    data: {
      userId: devUser.id,
      customerId: BigInt(1),
      name: "SH-TEST Project",
      projectValue: "7000000.00",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      status: "PLANNED",
      notes: "Shell fixture — cleaned up by e2e-shell.mjs",
    },
  });
  // PAID — issued NOVEMBER so October card stays seed-pure.
  paidInvoice = await prisma.invoice.create({
    data: {
      userId: devUser.id,
      projectId: testProject.id,
      invoiceNumber: "INV-2026-SHPAID",
      issueDate: new Date("2026-11-10T00:00:00.000Z"),
      dueDate: new Date("2026-11-20T00:00:00.000Z"),
      status: "PAID",
      taxRate: "0",
      subtotal: "3000000.00",
      taxAmount: "0",
      total: "3000000.00",
      notes: "Shell fixture",
    },
  });
  await prisma.invoiceItem.create({
    data: {
      invoiceId: paidInvoice.id,
      description: "SH paid item",
      quantity: "1.00",
      unitPrice: "3000000.00",
      amount: "3000000.00",
      sortOrder: 1,
    },
  });
  // UNPAID + long overdue — issued SEPTEMBER.
  overdueInvoice = await prisma.invoice.create({
    data: {
      userId: devUser.id,
      projectId: testProject.id,
      invoiceNumber: "INV-2026-SHOVER",
      issueDate: new Date("2026-09-10T00:00:00.000Z"),
      dueDate: new Date("2026-09-30T00:00:00.000Z"),
      status: "UNPAID",
      taxRate: "0",
      subtotal: "2000000.00",
      taxAmount: "0",
      total: "2000000.00",
      notes: "Shell fixture",
    },
  });
  await prisma.invoiceItem.create({
    data: {
      invoiceId: overdueInvoice.id,
      description: "SH overdue item",
      quantity: "1.00",
      unitPrice: "2000000.00",
      amount: "2000000.00",
      sortOrder: 1,
    },
  });

  // Expected donut counts derived from DB — time-independent.
  const allInvoices = await prisma.invoice.findMany({
    where: { userId: devUser.id },
    select: { status: true, dueDate: true },
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  donut = { lunas: 0, belum: 0, terlambat: 0 };
  for (const inv of allInvoices) {
    if (inv.status === "PAID") donut.lunas++;
    else if (inv.dueDate.getTime() < today.getTime()) donut.terlambat++;
    else donut.belum++;
  }
  donutTotal = allInvoices.length;
  // Expected all-time project value — includes SH fixture, derive from DB.
  const projectAgg = await prisma.project.aggregate({
    where: { userId: devUser.id },
    _sum: { projectValue: true },
  });
  expectedProjectValue = Number(projectAgg._sum.projectValue ?? 0);
} catch (error) {
  console.error("SETUP FAIL:", error instanceof Error ? error.message : error);
  await cleanupFixture();
  await prisma.$disconnect();
  process.exit(2);
}

let browser = null;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // ---------- SH1: auth guard ----------
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("SH1 / redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  // ---------- SH2: login + sidebar visible on dashboard ----------
  await uiLogin(page, EMAIL, PASSWORD);
  record("SH2 login navigates to /", page.url().replace(BASE, "").startsWith("/"), `final=${page.url()}`);
  await page.locator("h1", { hasText: "Ringkasan" }).waitFor({ timeout: 15000 });
  record("SH2b dashboard h1 is 'Ringkasan'", true);
  const asideCount = await page.locator("aside").count();
  record("SH2c sidebar (aside) present on dashboard", asideCount >= 1, `count=${asideCount}`);

  // ---------- SH3: all 8 sidebar nav links ----------
  for (const [href, label] of NAV) {
    const link = page.locator(`aside a[href="${href}"]`);
    const count = await link.count();
    record(`SH3 sidebar link '${label}' → ${href}`, count >= 1, `count=${count}`);
  }

  // ---------- SH4: sidebar persists on other pages ----------
  await page.goto(`${BASE}/invoices`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Invoice" }).waitFor({ timeout: 15000 });
  const asideOnInvoices = await page.locator("aside").count();
  const paymentsFromSidebar = await page.locator('aside a[href="/payments"]').count();
  record(
    "SH4 sidebar persists on /invoices with nav links",
    asideOnInvoices >= 1 && paymentsFromSidebar >= 1,
    `aside=${asideOnInvoices} payments=${paymentsFromSidebar}`,
  );

  // ---------- SH5: metadata lang + title ----------
  const lang = await page.locator("html").getAttribute("lang");
  record("SH5 html lang='id'", lang === "id", `lang=${lang}`);
  const title = await page.title();
  record("SH5b title contains 'BillMate'", title.includes("BillMate"), `title=${title}`);

  // ---------- SH6: month picker (?period=2026-10) ----------
  await page.goto(`${BASE}/?period=${OCT.year}-${OCT.month}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Ringkasan" }).waitFor({ timeout: 15000 });
  const checkedPeriod = (await page.locator("#period option:checked").textContent().catch(() => "")) ?? "";
  record(
    "SH6 month picker shows Oktober 2026 for ?period=2026-10",
    checkedPeriod.includes("Oktober 2026"),
    `got=${checkedPeriod}`,
  );

  // ---------- SH7: four stat cards for explicit period ----------
  record("SH7 Nilai proyek card (all-time)", (await readCard(page, "dash-value")) === idr(expectedProjectValue), `got=${await readCard(page, "dash-value")}`);
  record("SH7b Total invoice card (Okt)", (await readCard(page, "dash-invoice")) === idr(166500000), `got=${await readCard(page, "dash-invoice")}`);
  record("SH7c Pembayaran diterima card (Okt)", (await readCard(page, "dash-paid")) === idr(66000000), `got=${await readCard(page, "dash-paid")}`);
  record("SH7d Pengeluaran card (Okt)", (await readCard(page, "dash-expense")) === idr(18500000), `got=${await readCard(page, "dash-expense")}`);

  // ---------- SH8: cash-flow chart ----------
  const dashText = await bodyText(page);
  record("SH8 cash-flow chart subtitle mentions 6 bulan", dashText.includes("6 bulan terakhir"));
  record("SH8b chart legend Masuk + Keluar", dashText.includes("Masuk") && dashText.includes("Keluar"));
  const chartSvg = await page.locator("#cashflow-chart svg").count();
  record("SH8c cash-flow SVG rendered", chartSvg >= 1, `count=${chartSvg}`);

  // ---------- SH9: invoice status donut ----------
  const donutTotalText = (await page.locator("#donut-total").first().textContent().catch(() => "")) ?? "";
  record(
    "SH9 donut total matches invoice count",
    donutTotalText.includes(String(donutTotal)),
    `want=${donutTotal} got=${donutTotalText}`,
  );
  for (const [key, label] of [["lunas", "Lunas"], ["belum", "Belum lunas"], ["terlambat", "Terlambat"]]) {
    const countText = (await page.locator(`#donut-${key}-count`).first().textContent().catch(() => "")) ?? "";
    record(
      `SH9 donut ${label} count`,
      countText.trim() === String(donut[key]),
      `want=${donut[key]} got=${countText.trim()}`,
    );
  }
  const donutSvg = await page.locator("#status-donut svg").count();
  record("SH9b donut SVG rendered", donutSvg >= 1, `count=${donutSvg}`);

  // ---------- SH10: recent projects table ----------
  const seedRow = page.getByRole("row", { name: /Demo Office Garden/ });
  await seedRow.waitFor({ timeout: 15000 }).catch(() => {});
  const rowText = (await seedRow.textContent().catch(() => "")) ?? "";
  record(
    "SH10 recent projects row shows seed values",
    rowText.includes("Demo Office Garden") &&
      rowText.includes("Demo Customer Co.") &&
      rowText.includes(idr(250000000)) &&
      rowText.includes("Berjalan") &&
      rowText.includes("1 Okt 2026") &&
      rowText.includes("15 Nov 2026"),
    `row=${rowText.slice(0, 120)}`,
  );

  // ---------- SH11: 'Tambah transaksi' menu ----------
  await page.locator("summary", { hasText: "Tambah transaksi" }).click();
  const menuText = await bodyText(page);
  record(
    "SH11 Tambah transaksi menu links",
    (await page.locator('a[href="/invoices/new"]').count()) >= 1 &&
      (await page.locator('a[href="/payments/new"]').count()) >= 1 &&
      (await page.locator('a[href="/expenses/new"]').count()) >= 1,
    `visible=${menuText.includes("Tambah Invoice")}`,
  );

  // ---------- SH12: greeting + business name ----------
  record("SH12 greeting 'Halo, Dev User'", dashText.includes("Halo, Dev User"));
  record("SH12b business name on dashboard", dashText.includes("Billmate Demo Studio"));

  // ---------- SH13: Logout from sidebar ----------
  const logoutBtn = page.locator('aside button[type="submit"]', { hasText: "Logout" });
  const logoutCount = await logoutBtn.count();
  record("SH13 exactly one Logout button in sidebar", logoutCount === 1, `count=${logoutCount}`);
  if (logoutCount === 1) {
    await logoutBtn.click();
    await page.waitForURL("**/login", { timeout: 20000 }).catch(() => {});
    record("SH13b clicking sidebar Logout → /login", page.url().endsWith("/login"), `final=${page.url()}`);
    // Regression guard: aplikasi harus menghapus cookie sesi SENDIRI
    // tanpa bantuan test (clearCookies). Menutup race rolling refresh
    // next-auth (issue #12909) yang sempat membuat sesi hidup lagi.
    const sessionCookies = (await context.cookies()).filter((c) => c.name.includes("session-token"));
    record("SH13c session cookie cleared by app after Logout", sessionCookies.length === 0, `remaining=${sessionCookies.map((c) => c.name).join(",") || "none"}`);
  }

  // ---------- SH14: read-only proof ----------
  const invCount = await prisma.invoice.count({ where: { userId: devUser.id } });
  const payCount = await prisma.payment.count({ where: { invoice: { userId: devUser.id } } });
  record(
    "SH14 read-only: dev invoices=3, payments=1 unchanged",
    invCount === 3 && payCount === 1,
    `invoices=${invCount} payments=${payCount}`,
  );

  // ---------- SH15: switch mode terang/gelap ----------
  await uiLogin(page, EMAIL, PASSWORD);
  await page.locator("h1", { hasText: "Ringkasan" }).waitFor({ timeout: 15000 });
  const themeBtn = page.locator('aside button[aria-label="Ganti mode tampilan"]');
  const themeCount = await themeBtn.count();
  record("SH15 theme toggle present in sidebar", themeCount === 1, `count=${themeCount}`);
  if (themeCount === 1) {
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await themeBtn.click();
    const darkAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    const darkBg = await bg();
    record(
      "SH15b click → data-theme=dark + background gelap",
      darkAttr === "dark" && darkBg === "rgb(12, 20, 17)",
      `attr=${darkAttr} bg=${darkBg}`,
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("h1", { hasText: "Ringkasan" }).waitFor({ timeout: 15000 }).catch(() => {});
    const persistedAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    record("SH15c theme persists after reload", persistedAttr === "dark", `attr=${persistedAttr}`);
    const themeBtnAfterReload = page.locator('aside button[aria-label="Ganti mode tampilan"]');
    await themeBtnAfterReload.click();
    const lightAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    const lightBg = await bg();
    record(
      "SH15d click again → data-theme=light + background putih",
      lightAttr === "light" && lightBg === "rgb(255, 255, 255)",
      `attr=${lightAttr} bg=${lightBg}`,
    );
  }

  // ---------- SH15e: tema default = terang, walau sistem preferensi gelap ----------
  const darkCtx = await browser.newContext({ colorScheme: "dark" });
  const darkPage = await darkCtx.newPage();
  await uiLogin(darkPage, EMAIL, PASSWORD);
  await darkPage.locator("h1", { hasText: "Ringkasan" }).waitFor({ timeout: 15000 });
  const defaultAttr = await darkPage.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const defaultBg = await darkPage.evaluate(() => getComputedStyle(document.body).backgroundColor);
  record(
    "SH15e default tema terang walau sistem gelap",
    (defaultAttr === null || defaultAttr === "light") && defaultBg === "rgb(255, 255, 255)",
    `attr=${defaultAttr} bg=${defaultBg}`,
  );
  await darkCtx.close();

  await context.close();
} catch (error) {
  console.error("HARNESS ERROR:", error instanceof Error ? error.message : error);
  failCount++;
} finally {
  await cleanupFixture();
  await prisma.$disconnect();
  await browser?.close();
}

console.log(`--- browser summary: ${passCount} passed, ${failCount} failed ---`);
process.exit(failCount === 0 ? 0 : 1);
