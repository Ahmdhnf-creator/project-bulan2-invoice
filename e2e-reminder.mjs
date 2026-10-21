// Browser E2E for BillMate WhatsApp Payment Reminder (manual flow).
// Reads credentials from env; never logs them.
// Creates isolated fixture data (2 customers/projects + 3 invoices under dev,
// 1 isolation user + invoice) directly via Prisma, then cleans up in `finally`.
// Reminder flow is read-only — no rows should change.
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

// Seed anchors (prisma/seed.ts): invoice 1 PARTIALLY_PAID 166,500,000,
// paid 66,000,000 → remaining 100,500,000; due 2026-11-04.
const SEED = {
  invoiceId: BigInt(1),
  invoiceNumber: "INV-2026-0001",
  projectName: "Demo Office Garden",
  customerName: "Demo Customer Co.",
  customerPhone: "+62 812 0000 0000", // digits → 6281200000000
  businessName: "Billmate Demo Studio",
  total: 166500000,
  paid: 66000000,
  remaining: 100500000,
  dueLabel: "4 Nov 2026",
};

// Same formatters as app/lib/format.ts (same machine/locale as server).
const idr = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

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

async function waitForMessage(page, role, expected) {
  await page
    .waitForFunction(
      ([r, t]) =>
        Array.from(document.querySelectorAll(`p[role="${r}"]`)).some((el) =>
          (el.textContent || "").includes(t),
        ),
      [role, expected],
      { timeout: 15000 },
    )
    .catch(() => {});
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

// --- Test fixture ---
const isoEmail = `rv-iso-${Date.now()}@billmate-demo.test`;
let devUser = null;
let noPhoneCustomer = null;
let noPhoneProject = null;
let noPhoneInvoice = null; // INV-2026-RVN01 UNPAID, customer tanpa phone
let localPhoneCustomer = null;
let localPhoneProject = null;
let localPhoneInvoice = null; // INV-2026-RVL01 UNPAID, phone 0812-…
let paidInvoice = null; // INV-2026-RVPAID status PAID
let isoUser = null;
let isoProject = null;
let isoInvoice = null;

async function cleanupFixture() {
  try {
    for (const inv of [noPhoneInvoice, localPhoneInvoice, paidInvoice, isoInvoice]) {
      if (!inv) continue;
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: inv.id } }).catch(() => {});
      await prisma.payment.deleteMany({ where: { invoiceId: inv.id } }).catch(() => {});
      await prisma.invoice.delete({ where: { id: inv.id } }).catch(() => {});
    }
    for (const proj of [noPhoneProject, localPhoneProject, isoProject]) {
      if (!proj) continue;
      await prisma.project.delete({ where: { id: proj.id } }).catch(() => {});
    }
    for (const cust of [noPhoneCustomer, localPhoneCustomer]) {
      if (!cust) continue;
      await prisma.customer.delete({ where: { id: cust.id } }).catch(() => {});
    }
    if (isoUser) {
      await prisma.customer.deleteMany({ where: { userId: isoUser.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: isoUser.id } }).catch(() => {});
    }
  } catch (error) {
    console.error("CLEANUP:", error instanceof Error ? error.message : error);
  }
}

try {
  devUser = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!devUser) throw new Error("dev user not found");

  // Customer WITHOUT phone — copy stays, wa.me link must not appear.
  noPhoneCustomer = await prisma.customer.create({
    data: { userId: devUser.id, name: "RV No Phone Co." },
  });
  noPhoneProject = await prisma.project.create({
    data: {
      userId: devUser.id,
      customerId: noPhoneCustomer.id,
      name: "RV-TEST NoPhone",
      projectValue: "5000000.00",
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      status: "PLANNED",
      notes: "Reminder fixture — cleaned up by e2e-reminder.mjs",
    },
  });
  noPhoneInvoice = await prisma.invoice.create({
    data: {
      userId: devUser.id,
      projectId: noPhoneProject.id,
      invoiceNumber: "INV-2026-RVN01",
      issueDate: new Date("2026-11-01T00:00:00.000Z"),
      dueDate: new Date("2026-11-30T00:00:00.000Z"),
      status: "UNPAID",
      taxRate: "0",
      subtotal: "5000000.00",
      taxAmount: "0",
      total: "5000000.00",
      notes: "Reminder fixture",
    },
  });
  await prisma.invoiceItem.create({
    data: {
      invoiceId: noPhoneInvoice.id,
      description: "RV no-phone item",
      quantity: "1.00",
      unitPrice: "5000000.00",
      amount: "5000000.00",
      sortOrder: 1,
    },
  });

  // Customer with LOCAL-format phone — must normalize to 62… for wa.me.
  localPhoneCustomer = await prisma.customer.create({
    data: { userId: devUser.id, name: "RV Local Phone Co.", phone: "0812-9999-8888" },
  });
  localPhoneProject = await prisma.project.create({
    data: {
      userId: devUser.id,
      customerId: localPhoneCustomer.id,
      name: "RV-TEST LocalPhone",
      projectValue: "2000000.00",
      startDate: new Date("2026-11-02T00:00:00.000Z"),
      status: "PLANNED",
      notes: "Reminder fixture — cleaned up by e2e-reminder.mjs",
    },
  });
  localPhoneInvoice = await prisma.invoice.create({
    data: {
      userId: devUser.id,
      projectId: localPhoneProject.id,
      invoiceNumber: "INV-2026-RVL01",
      issueDate: new Date("2026-11-02T00:00:00.000Z"),
      dueDate: new Date("2026-12-02T00:00:00.000Z"),
      status: "UNPAID",
      taxRate: "0",
      subtotal: "2000000.00",
      taxAmount: "0",
      total: "2000000.00",
      notes: "Reminder fixture",
    },
  });
  await prisma.invoiceItem.create({
    data: {
      invoiceId: localPhoneInvoice.id,
      description: "RV local-phone item",
      quantity: "1.00",
      unitPrice: "2000000.00",
      amount: "2000000.00",
      sortOrder: 1,
    },
  });

  // PAID invoice — reminder section must be hidden.
  paidInvoice = await prisma.invoice.create({
    data: {
      userId: devUser.id,
      projectId: noPhoneProject.id,
      invoiceNumber: "INV-2026-RVPAID",
      issueDate: new Date("2026-11-01T00:00:00.000Z"),
      dueDate: new Date("2026-11-15T00:00:00.000Z"),
      status: "PAID",
      taxRate: "0",
      subtotal: "3000000.00",
      taxAmount: "0",
      total: "3000000.00",
      notes: "Reminder fixture",
    },
  });
  await prisma.invoiceItem.create({
    data: {
      invoiceId: paidInvoice.id,
      description: "RV paid item",
      quantity: "1.00",
      unitPrice: "3000000.00",
      amount: "3000000.00",
      sortOrder: 1,
    },
  });

  // Isolation user with own unpaid invoice — must 404 for dev.
  isoUser = await prisma.user.create({
    data: {
      email: isoEmail,
      fullName: "RV Iso User",
      passwordHash: await Bun.password.hash("rv-iso-password"),
    },
  });
  const isoCustomer = await prisma.customer.create({
    data: { userId: isoUser.id, name: "RV Iso Customer", phone: "+62 811 1111 1111" },
  });
  isoProject = await prisma.project.create({
    data: {
      userId: isoUser.id,
      customerId: isoCustomer.id,
      name: "RV-TEST Iso",
      projectValue: "1000000.00",
      startDate: new Date("2026-11-03T00:00:00.000Z"),
      status: "PLANNED",
    },
  });
  isoInvoice = await prisma.invoice.create({
    data: {
      userId: isoUser.id,
      projectId: isoProject.id,
      invoiceNumber: "INV-2026-RV0001",
      issueDate: new Date("2026-11-03T00:00:00.000Z"),
      dueDate: new Date("2026-12-03T00:00:00.000Z"),
      status: "UNPAID",
      taxRate: "0",
      subtotal: "1000000.00",
      taxAmount: "0",
      total: "1000000.00",
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
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  await uiLogin(page, EMAIL, PASSWORD);
  record("RV1 login navigates to /", page.url().replace(BASE, "").startsWith("/"), `final=${page.url()}`);

  // ---------- RV2..: seed invoice (PARTIALLY_PAID + phone) ----------
  await page.goto(`${BASE}/invoices/1`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: SEED.invoiceNumber }).waitFor({ timeout: 15000 });
  const seedText = await bodyText(page);
  record("RV2 reminder section shown for unpaid invoice", seedText.includes("Pengingat Pembayaran"));

  const copyBtn = page.locator("button", { hasText: "Salin Pengingat" });
  const waLink = page.locator('a[href^="https://wa.me/"]');
  record("RV2b 'Salin Pengingat' button present", (await copyBtn.count()) === 1, `count=${await copyBtn.count()}`);
  record("RV2c 'Buka WhatsApp' link present", (await waLink.count()) === 1, `count=${await waLink.count()}`);

  if ((await copyBtn.count()) === 1) {
    await copyBtn.click();
    await waitForMessage(page, "status", "Pengingat tersalin.");
    const statusText = (await page.locator('p[role="status"]').first().textContent().catch(() => "")) ?? "";
    record("RV2d copy shows 'Pengingat tersalin.'", statusText.includes("Pengingat tersalin."), `got=${statusText}`);

    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    record(
      "RV2e clipboard contains greeting + business + invoice",
      clip.includes(`Halo ${SEED.customerName},`) &&
        clip.includes(SEED.businessName) &&
        clip.includes(SEED.invoiceNumber),
      `clip=${JSON.stringify(clip.slice(0, 80))}`,
    );
    record(
      "RV2f clipboard amounts (total / terbayar / sisa)",
      clip.includes(idr(SEED.total)) && clip.includes(idr(SEED.paid)) && clip.includes(idr(SEED.remaining)),
      `total=${clip.includes(idr(SEED.total))} paid=${clip.includes(idr(SEED.paid))} sisa=${clip.includes(idr(SEED.remaining))}`,
    );
    record(
      "RV2g clipboard due date + project name",
      clip.includes(SEED.dueLabel) && clip.includes(SEED.projectName),
      `due=${clip.includes(SEED.dueLabel)}`,
    );
  }

  if ((await waLink.count()) === 1) {
    const href = (await waLink.first().getAttribute("href")) ?? "";
    const target = await waLink.first().getAttribute("target");
    record(
      "RV3 wa.me link uses normalized +62 phone",
      href.startsWith("https://wa.me/6281200000000?text="),
      `href=${href.slice(0, 60)}`,
    );
    const decoded = decodeURIComponent(href.split("?text=")[1] ?? "");
    record(
      "RV3b wa.me text contains invoice number + sisa tagihan",
      decoded.includes(SEED.invoiceNumber) && decoded.includes(idr(SEED.remaining)),
      `decoded=${JSON.stringify(decoded.slice(0, 60))}`,
    );
    record("RV3c wa.me link opens in new tab", target === "_blank", `target=${target}`);
  }

  // ---------- RV4..: customer WITHOUT phone ----------
  await page.goto(`${BASE}/invoices/${noPhoneInvoice.id.toString()}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "INV-2026-RVN01" }).waitFor({ timeout: 15000 });
  const noPhoneText = await bodyText(page);
  record(
    "RV4 copy still available without phone",
    (await page.locator("button", { hasText: "Salin Pengingat" }).count()) === 1,
  );
  record(
    "RV5 no wa.me link without phone",
    (await page.locator('a[href^="https://wa.me/"]').count()) === 0,
  );
  record("RV5b hint about missing phone shown", noPhoneText.includes("Nomor WhatsApp pelanggan belum diisi."));

  // ---------- RV6: LOCAL phone normalization 0812… → 62812… ----------
  await page.goto(`${BASE}/invoices/${localPhoneInvoice.id.toString()}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "INV-2026-RVL01" }).waitFor({ timeout: 15000 });
  const localLink = page.locator('a[href^="https://wa.me/"]');
  const localHref = (await localLink.first().getAttribute("href").catch(() => "")) ?? "";
  record(
    "RV6 local 0812 phone normalized to 62812 in wa.me link",
    localHref.startsWith("https://wa.me/6281299998888?text="),
    `href=${localHref.slice(0, 60)}`,
  );

  // ---------- RV7: PAID invoice hides reminder ----------
  await page.goto(`${BASE}/invoices/${paidInvoice.id.toString()}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "INV-2026-RVPAID" }).waitFor({ timeout: 15000 });
  const paidText = await bodyText(page);
  record("RV7 reminder hidden for PAID invoice", !paidText.includes("Pengingat Pembayaran"));
  record(
    "RV7b no copy button / wa link on PAID invoice",
    (await page.locator("button", { hasText: "Salin Pengingat" }).count()) === 0 &&
      (await page.locator('a[href^="https://wa.me/"]').count()) === 0,
  );

  // ---------- RV8: other user's invoice → 404 ----------
  const resp = await page.goto(`${BASE}/invoices/${isoInvoice.id.toString()}`, {
    waitUntil: "domcontentloaded",
  });
  record("RV8 other user's invoice returns 404", resp !== null && resp.status() === 404, `status=${resp?.status()}`);

  // ---------- RV9: read-only — row counts unchanged ----------
  const devInvoices = await prisma.invoice.count({ where: { userId: devUser.id } });
  const devPayments = await prisma.payment.count({ where: { invoice: { userId: devUser.id } } });
  record(
    "RV9 read-only: dev invoices/payments unchanged (4 invoices, 1 seed payment)",
    devInvoices === 4 && devPayments === 1,
    `invoices=${devInvoices} payments=${devPayments}`,
  );
  const seedInvoiceFinal = await prisma.invoice.findUnique({
    where: { id: SEED.invoiceId },
    select: { status: true, total: true },
  });
  record(
    "RV9b seed invoice untouched",
    seedInvoiceFinal?.status === "PARTIALLY_PAID" && Number(seedInvoiceFinal?.total) === SEED.total,
    `status=${seedInvoiceFinal?.status}`,
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
