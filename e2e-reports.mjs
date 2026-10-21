// Browser E2E for BillMate Basic Reports (/reports).
// Reads credentials from env; never logs them.
// Creates isolated fixture data (1 project + invoice + payment 2026-12
// + expense 2026-07, 1 empty isolation user) directly via Prisma,
// then cleans up in `finally`. Never touches seed data.
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

// Seed data (prisma/seed.ts) — display-only anchors for October 2026.
const SEED = {
  projectName: "Demo Office Garden",
  projectValue: 250000000,
  paymentAmount: 66000000, // payment id=1, 2026-10-06
  paymentDate: "2026-10-06",
  expenseAmount: 18500000, // expense id=1, 2026-10-03
  expenseDate: "2026-10-03",
};

// Fixture sits OUTSIDE October 2026 so October assertions stay seed-pure.
const FIX = {
  projectName: "RPT-TEST Project",
  projectValue: 50000000,
  invoiceNumber: "INV-2026-RPT01",
  invoiceTotal: 20000000,
  paymentAmount: 10000000,
  paymentDate: "2026-12-15", // → Desember 2026 + setahun 2026
  expenseAmount: 5000000,
  expenseDate: "2026-07-20", // → Juli 2026
};

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// Same formatter as app/lib/format.ts formatIdr (same machine/locale as server),
// so expected strings match the app's NBSP after "Rp" exactly.
const idr = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Default period label — computed from this machine's clock, identical to the
// server's default (bulan berjalan).
const defaultPeriodLabel = (() => {
  const now = new Date();
  return `Periode: ${MONTHS_ID[now.getMonth()]} ${now.getFullYear()}`;
})();

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

async function uiLogout(page) {
  await page
    .locator('button[type="submit"]', { hasText: "Logout" })
    .first()
    .click();
  await page.waitForURL("**/login", { timeout: 15000 }).catch(() => {});
  // signOut via server action (NextAuth v5) kadang tidak mengirim cookie clear;
  // clear + reload agar halaman login benar-benar bersih (deterministik).
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.context().clearCookies();
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    if ((await page.locator("#email").count()) >= 1) return;
  }
}

async function uiLogin(page, email, password) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (new URL(page.url()).pathname !== "/login") {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    }
    await page.locator("#email").waitFor({ timeout: 15000 });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/", { timeout: 20000 }).catch(() => {});
    if (new URL(page.url()).pathname === "/") return;
    // Login gagal; kemungkinan sisa cookie sesi lama. Bersihkan lalu ulangi.
    await page.context().clearCookies();
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  }
}

async function readCard(page, id) {
  return (await page.locator(`#${id}`).first().textContent().catch(() => "")) ?? "";
}

// --- Test fixture ---
const isoBEmail = `rp-empty-${Date.now()}@billmate-demo.test`;
let devUser = null;
let testProject = null;
let testInvoice = null;
let testPayment = null;
let testExpense = null;
let isoBUser = null;

async function cleanupFixture() {
  try {
    if (testPayment) {
      await prisma.payment.delete({ where: { id: testPayment.id } }).catch(() => {});
    }
    if (testInvoice) {
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: testInvoice.id } }).catch(() => {});
      await prisma.invoice.delete({ where: { id: testInvoice.id } }).catch(() => {});
    }
    if (testExpense) {
      await prisma.expense.delete({ where: { id: testExpense.id } }).catch(() => {});
    }
    if (testProject) {
      await prisma.project.delete({ where: { id: testProject.id } }).catch(() => {});
    }
    if (isoBUser) {
      await prisma.customer.deleteMany({ where: { userId: isoBUser.id } }).catch(() => {});
      await prisma.project.deleteMany({ where: { userId: isoBUser.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: isoBUser.id } }).catch(() => {});
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
      name: FIX.projectName,
      projectValue: `${FIX.projectValue}.00`,
      startDate: new Date("2026-12-01T00:00:00.000Z"),
      status: "PLANNED",
      notes: "Reports fixture — cleaned up by e2e-reports.mjs",
    },
  });
  testInvoice = await prisma.invoice.create({
    data: {
      userId: devUser.id,
      projectId: testProject.id,
      invoiceNumber: FIX.invoiceNumber,
      issueDate: new Date("2026-12-01T00:00:00.000Z"),
      dueDate: new Date("2026-12-31T00:00:00.000Z"),
      status: "PARTIALLY_PAID",
      taxRate: "0",
      subtotal: `${FIX.invoiceTotal}.00`,
      taxAmount: "0",
      total: `${FIX.invoiceTotal}.00`,
      notes: "Reports fixture — cleaned up by e2e-reports.mjs",
    },
  });
  await prisma.invoiceItem.create({
    data: {
      invoiceId: testInvoice.id,
      description: "RPT fixture item",
      quantity: "1.00",
      unitPrice: `${FIX.invoiceTotal}.00`,
      amount: `${FIX.invoiceTotal}.00`,
      sortOrder: 1,
    },
  });
  testPayment = await prisma.payment.create({
    data: {
      invoiceId: testInvoice.id,
      amount: `${FIX.paymentAmount}.00`,
      paymentDate: new Date(`${FIX.paymentDate}T00:00:00.000Z`),
      method: "Bank transfer",
      notes: "Reports fixture — cleaned up by e2e-reports.mjs",
    },
  });
  testExpense = await prisma.expense.create({
    data: {
      userId: devUser.id,
      projectId: testProject.id,
      description: "RPT-TEST biaya operasional",
      amount: `${FIX.expenseAmount}.00`,
      date: new Date(`${FIX.expenseDate}T00:00:00.000Z`),
      category: "Materials",
      notes: "Reports fixture — cleaned up by e2e-reports.mjs",
    },
  });

  // Isolation user: NO data at all — cards must be zero, table empty.
  isoBUser = await prisma.user.create({
    data: {
      email: isoBEmail,
      fullName: "Report Empty User",
      passwordHash: await Bun.password.hash("rp-empty-password"),
    },
  });
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

  // ---------- RP1: auth guard ----------
  await page.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("RP1 /reports redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  // ---------- RP2: login ----------
  await uiLogin(page, EMAIL, PASSWORD);
  record("RP2 login navigates to /", page.url().replace(BASE, "").startsWith("/"), `final=${page.url()}`);

  // ---------- RP3: dashboard nav link ----------
  const reportsLink = page.locator('a[href="/reports"]');
  const linkCount = await reportsLink.count();
  record("RP3 dashboard shows 'Laporan' link", linkCount >= 1, `count=${linkCount}`);
  record(
    "RP3b link text is 'Laporan'",
    linkCount >= 1 && ((await reportsLink.first().textContent()) ?? "").includes("Laporan"),
  );
  await reportsLink.first().click();
  await page.waitForURL("**/reports", { timeout: 15000 }).catch(() => {});
  await page.locator("h1", { hasText: "Laporan" }).waitFor({ timeout: 15000 });
  record("RP3c dashboard link navigates to /reports", page.url().includes("/reports"), `final=${page.url()}`);

  // ---------- RP4: default period = bulan berjalan + cards exist ----------
  const defaultText = await bodyText(page);
  record(
    "RP4 default period = bulan berjalan",
    defaultText.includes(defaultPeriodLabel),
    `want=${defaultPeriodLabel}`,
  );
  const cardCount =
    (await page.locator("#rp-income").count()) +
    (await page.locator("#rp-expense").count()) +
    (await page.locator("#rp-diff").count());
  record("RP4b three summary cards present", cardCount === 3, `count=${cardCount}`);

  // ---------- RP5: October 2026 = pure seed numbers ----------
  await page.goto(`${BASE}/reports?year=2026&month=10`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Laporan" }).waitFor({ timeout: 15000 });
  const octText = await bodyText(page);
  record("RP5 Oct period label", octText.includes("Periode: Oktober 2026"), `found=${octText.includes("Periode: Oktober 2026")}`);
  record("RP5b Oct pemasukan = seed payment", (await readCard(page, "rp-income")) === idr(SEED.paymentAmount), `got=${await readCard(page, "rp-income")}`);
  record("RP5c Oct pengeluaran = seed expense", (await readCard(page, "rp-expense")) === idr(SEED.expenseAmount), `got=${await readCard(page, "rp-expense")}`);
  record(
    "RP5d Oct selisih = payment - expense",
    (await readCard(page, "rp-diff")) === idr(SEED.paymentAmount - SEED.expenseAmount),
    `got=${await readCard(page, "rp-diff")}`,
  );

  // ---------- RP6: July 2026 = fixture expense only ----------
  await page.goto(`${BASE}/reports?year=2026&month=7`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Laporan" }).waitFor({ timeout: 15000 });
  const julText = await bodyText(page);
  record("RP6 Jul period label", julText.includes("Periode: Juli 2026"));
  record("RP6b Jul pemasukan = 0", (await readCard(page, "rp-income")) === idr(0), `got=${await readCard(page, "rp-income")}`);
  record("RP6c Jul pengeluaran = fixture expense", (await readCard(page, "rp-expense")) === idr(FIX.expenseAmount), `got=${await readCard(page, "rp-expense")}`);
  record(
    "RP6d Jul selisih = negative",
    (await readCard(page, "rp-diff")) === idr(-FIX.expenseAmount),
    `got=${await readCard(page, "rp-diff")}`,
  );

  // ---------- RP7: December 2026 = fixture payment only ----------
  await page.goto(`${BASE}/reports?year=2026&month=12`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Laporan" }).waitFor({ timeout: 15000 });
  const decText = await bodyText(page);
  record("RP7 Dec period label", decText.includes("Periode: Desember 2026"));
  record("RP7b Dec pemasukan = fixture payment", (await readCard(page, "rp-income")) === idr(FIX.paymentAmount), `got=${await readCard(page, "rp-income")}`);
  record("RP7c Dec pengeluaran = 0", (await readCard(page, "rp-expense")) === idr(0), `got=${await readCard(page, "rp-expense")}`);
  record(
    "RP7d Dec selisih = fixture payment",
    (await readCard(page, "rp-diff")) === idr(FIX.paymentAmount),
    `got=${await readCard(page, "rp-diff")}`,
  );

  // ---------- RP8: full year 2026 = seed + fixture ----------
  await page.goto(`${BASE}/reports?year=2026`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Laporan" }).waitFor({ timeout: 15000 });
  const yearText = await bodyText(page);
  record("RP8 year period label", yearText.includes("Periode: 2026"));
  record(
    "RP8b year pemasukan = seed + fixture",
    (await readCard(page, "rp-income")) === idr(SEED.paymentAmount + FIX.paymentAmount),
    `got=${await readCard(page, "rp-income")}`,
  );
  record(
    "RP8c year pengeluaran = seed + fixture",
    (await readCard(page, "rp-expense")) === idr(SEED.expenseAmount + FIX.expenseAmount),
    `got=${await readCard(page, "rp-expense")}`,
  );
  record(
    "RP8d year selisih",
    (await readCard(page, "rp-diff")) ===
      idr(SEED.paymentAmount + FIX.paymentAmount - SEED.expenseAmount - FIX.expenseAmount),
    `got=${await readCard(page, "rp-diff")}`,
  );

  // ---------- RP9: period without data = all zeros ----------
  await page.goto(`${BASE}/reports?year=1999&month=1`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Laporan" }).waitFor({ timeout: 15000 });
  const emptyText = await bodyText(page);
  record("RP9 empty period label", emptyText.includes("Periode: Januari 1999"));
  record(
    "RP9b empty period cards all zero",
    (await readCard(page, "rp-income")) === idr(0) &&
      (await readCard(page, "rp-expense")) === idr(0) &&
      (await readCard(page, "rp-diff")) === idr(0),
    `income=${await readCard(page, "rp-income")}`,
  );

  // ---------- RP10: invalid params fall back to bulan berjalan ----------
  await page.goto(`${BASE}/reports?year=abc&month=99`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Laporan" }).waitFor({ timeout: 15000 });
  const invalidText = await bodyText(page);
  record(
    "RP10 invalid params fall back to bulan berjalan",
    invalidText.includes(defaultPeriodLabel),
    `want=${defaultPeriodLabel}`,
  );

  // ---------- RP11: filter form submits via GET ----------
  await page.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Laporan" }).waitFor({ timeout: 15000 });
  await page.locator("#year").selectOption("2026");
  await page.locator("#month").selectOption("10");
  await page.locator('button[type="submit"]', { hasText: "Terapkan" }).click();
  await page.waitForURL("**/reports?year=2026&month=10", { timeout: 15000 }).catch(() => {});
  record(
    "RP11 filter form navigates with year & month params",
    page.url().includes("year=2026") && page.url().includes("month=10"),
    `final=${page.url()}`,
  );

  // ---------- RP12: filter select options ----------
  const monthOptions = await page.locator("#month option").count();
  const yearHas2026 = (await page.locator('#year option[value="2026"]').count()) === 1;
  record(
    "RP12 filter selects populated (12 bulan + Semua, tahun 2026)",
    monthOptions === 13 && yearHas2026,
    `monthOptions=${monthOptions} year2026=${yearHas2026}`,
  );

  // ---------- RP13: per-project table (all time) ----------
  const fixtureRow = page.getByRole("row", { name: /RPT-TEST Project/ });
  await fixtureRow.waitFor({ timeout: 15000 }).catch(() => {});
  const fixtureCells = await fixtureRow.locator("td").allTextContents();
  record(
    "RP13 fixture project row values",
    fixtureCells.length === 5 &&
      fixtureCells[0].includes(FIX.projectName) &&
      fixtureCells[1] === idr(FIX.projectValue) &&
      fixtureCells[2] === idr(FIX.paymentAmount) &&
      fixtureCells[3] === idr(FIX.expenseAmount) &&
      fixtureCells[4] === idr(FIX.paymentAmount - FIX.expenseAmount),
    `cells=${fixtureCells.join(" | ")}`,
  );

  const seedRow = page.getByRole("row", { name: /Demo Office Garden/ });
  await seedRow.waitFor({ timeout: 15000 }).catch(() => {});
  const seedCells = await seedRow.locator("td").allTextContents();
  record(
    "RP13b seed project row values",
    seedCells.length === 5 &&
      seedCells[0].includes(SEED.projectName) &&
      seedCells[1] === idr(SEED.projectValue) &&
      seedCells[2] === idr(SEED.paymentAmount) &&
      seedCells[3] === idr(SEED.expenseAmount) &&
      seedCells[4] === idr(SEED.paymentAmount - SEED.expenseAmount),
    `cells=${seedCells.join(" | ")}`,
  );

  // ---------- RP14: isolation — other user sees empty report ----------
  await uiLogout(page);
  await uiLogin(page, isoBEmail, "rp-empty-password");
  await page.goto(`${BASE}/reports?year=2026&month=10`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Laporan" }).waitFor({ timeout: 15000 });
  record(
    "RP14 other user cards all zero",
    (await readCard(page, "rp-income")) === idr(0) &&
      (await readCard(page, "rp-expense")) === idr(0) &&
      (await readCard(page, "rp-diff")) === idr(0),
    `income=${await readCard(page, "rp-income")}`,
  );
  const isoText = await bodyText(page);
  record("RP14b other user table empty state", isoText.includes("Belum ada proyek."));
  record(
    "RP14c other user sees no dev data",
    !isoText.includes(SEED.projectName) &&
      !isoText.includes(idr(SEED.paymentAmount)) &&
      !isoText.includes(FIX.projectName),
  );
  await uiLogout(page);

  // ---------- RP15: DB integrity — seed untouched, fixture intact ----------
  const seedPayment = await prisma.payment.findUnique({ where: { id: BigInt(1) } });
  record(
    "RP15 seed payment intact",
    seedPayment !== null &&
      Number(seedPayment.amount) === SEED.paymentAmount &&
      seedPayment.paymentDate.toISOString().slice(0, 10) === SEED.paymentDate &&
      seedPayment.invoiceId === BigInt(1),
    `amount=${seedPayment?.amount?.toString()}`,
  );
  const seedExpense = await prisma.expense.findUnique({ where: { id: BigInt(1) } });
  record(
    "RP15b seed expense intact",
    seedExpense !== null &&
      Number(seedExpense.amount) === SEED.expenseAmount &&
      seedExpense.date.toISOString().slice(0, 10) === SEED.expenseDate &&
      seedExpense.projectId === BigInt(1),
    `amount=${seedExpense?.amount?.toString()}`,
  );
  const seedProject = await prisma.project.findUnique({
    where: { id: BigInt(1) },
    select: { name: true, projectValue: true, _count: { select: { invoices: true, expenses: true } } },
  });
  record(
    "RP15c seed project intact",
    seedProject?.name === SEED.projectName &&
      Number(seedProject?.projectValue) === SEED.projectValue &&
      seedProject?._count.invoices === 1 &&
      seedProject?._count.expenses === 1,
    `invoices=${seedProject?._count.invoices} expenses=${seedProject?._count.expenses}`,
  );
  const devPayments = await prisma.payment.count({ where: { invoice: { userId: devUser.id } } });
  const devExpenses = await prisma.expense.count({ where: { userId: devUser.id } });
  const devInvoices = await prisma.invoice.count({ where: { userId: devUser.id } });
  record(
    "RP15d read-only: dev row counts = seed + fixture only",
    devPayments === 2 && devExpenses === 2 && devInvoices === 2,
    `payments=${devPayments} expenses=${devExpenses} invoices=${devInvoices}`,
  );

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
