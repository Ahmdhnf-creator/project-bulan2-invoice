// Browser E2E for BillMate Payment Tracking.
// Reads credentials from env; never logs them.
// Creates isolated fixture data (2 test invoices + 2 isolation users)
// directly via Prisma, then cleans up in `finally`. Never touches seed data.
import { chromium } from "playwright";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "./app/generated/prisma/client";

const BASE = process.env.BILLMATE_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.BILLMATE_EMAIL;
const PASSWORD = process.env.BILLMATE_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("SETUP FAIL: BILLMATE_EMAIL and BILLMATE_PASSWORD env vars required");
  process.exit(2);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Seed payment (prisma/seed.ts): invoice INV-2026-0001, 66,000,000 of
// 166,500,000 -> invoice stays PARTIALLY_PAID. Display-only in this suite.
const SEED_PAYMENT = {
  amount: 66000000,
  paymentDate: new Date("2026-10-06T00:00:00.000Z"),
  method: "Bank transfer",
  notesMarker: "Development seed data",
  invoiceNumber: "INV-2026-0001",
  customerName: "Demo Customer Co.",
};

const INV_A = {
  number: "PAY-TEST-A",
  project: "PAY-TEST Project",
  total: 1000000,
  issueDate: "2026-11-01",
  dueDate: "2026-11-30",
};
const INV_B = {
  number: "PAY-TEST-B",
  total: 500000,
};

// Expected status rules (InvoiceStatus enum has only these 3 values):
// paid == 0 -> UNPAID; 0 < paid < total -> PARTIALLY_PAID; paid >= total -> PAID.
const statusFor = (paid, total) =>
  paid.isZero() ? "UNPAID" : paid.gte(total) ? "PAID" : "PARTIALLY_PAID";

// Same formatter as app/lib/format.ts formatDate (same machine/TZ as server).
const fmtDate = (d) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(d);

let passCount = 0;
let failCount = 0;
function record(name, ok, detail = "") {
  if (ok) passCount++;
  else failCount++;
  console.log(`${ok ? "PASS" : "FAIL"} [browser] ${name}${detail ? ` — ${detail}` : ""}`);
}

// Poll until a message element with the given role contains the expected text.
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

async function readMessage(page, role) {
  return (
    (await page.locator(`p[role="${role}"]`).first().textContent().catch(() => "")) ?? ""
  );
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

// --- Test fixture ---
const isoAEmail = `pay-isolation-${Date.now()}@billmate-demo.test`;
const isoBEmail = `pay-empty-${Date.now()}@billmate-demo.test`;
let devUser = null;
let testProject = null;
let invARow = null;
let invBRow = null;
let isoAUser = null;
let isoACustomer = null;
let isoAProject = null;
let isoAInvoice = null;
let isoAPayment = null;
let isoBUser = null;
let seedInvoiceId = null;

async function cleanupFixture() {
  try {
    if (devUser) {
      await prisma.payment.deleteMany({
        where: { invoice: { userId: devUser.id, invoiceNumber: { startsWith: "PAY-TEST" } } },
      });
      const devFixInvoices = await prisma.invoice.findMany({
        where: { userId: devUser.id, invoiceNumber: { startsWith: "PAY-TEST" } },
        select: { id: true },
      });
      for (const inv of devFixInvoices) {
        await prisma.invoiceItem.deleteMany({ where: { invoiceId: inv.id } }).catch(() => {});
      }
      await prisma.invoice.deleteMany({
        where: { userId: devUser.id, invoiceNumber: { startsWith: "PAY-TEST" } },
      });
    }
    if (testProject) {
      await prisma.project.delete({ where: { id: testProject.id } }).catch(() => {});
    }
    for (const isoUser of [isoAUser, isoBUser]) {
      if (!isoUser) continue;
      await prisma.payment.deleteMany({ where: { invoice: { userId: isoUser.id } } });
      const isoInvoices = await prisma.invoice.findMany({
        where: { userId: isoUser.id },
        select: { id: true },
      });
      for (const inv of isoInvoices) {
        await prisma.invoiceItem.deleteMany({ where: { invoiceId: inv.id } }).catch(() => {});
      }
      await prisma.invoice.deleteMany({ where: { userId: isoUser.id } });
      await prisma.project.deleteMany({ where: { userId: isoUser.id } });
      await prisma.customer.deleteMany({ where: { userId: isoUser.id } });
      await prisma.user.delete({ where: { id: isoUser.id } }).catch(() => {});
    }
  } catch {
    // best-effort cleanup
  }
}

try {
  devUser = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!devUser) {
    throw new Error("SETUP FAIL: dev user not found in database");
  }
  const seedCustomer = await prisma.customer.findFirst({
    where: { userId: devUser.id, name: SEED_PAYMENT.customerName },
    select: { id: true },
  });
  if (!seedCustomer) {
    throw new Error("SETUP FAIL: seed customer not found");
  }
  const seedInvoice = await prisma.invoice.findUnique({
    where: { id: BigInt(1) },
    select: { id: true },
  });
  seedInvoiceId = seedInvoice?.id ?? null;
  if (!seedInvoiceId) {
    throw new Error("SETUP FAIL: seed invoice not found");
  }

  // Isolated project + 2 test invoices for every payment created via UI,
  // so seed project/invoice are never polluted by test rows.
  testProject = await prisma.project.create({
    data: {
      userId: devUser.id,
      customerId: seedCustomer.id,
      name: INV_A.project,
      projectValue: "50000000",
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      status: "IN_PROGRESS",
      notes: "Proyek uji Payment Tracking",
    },
  });
  const mkInvoice = (number, total, desc) =>
    prisma.invoice.create({
      data: {
        userId: devUser.id,
        projectId: testProject.id,
        invoiceNumber: number,
        issueDate: new Date(`${INV_A.issueDate}T00:00:00.000Z`),
        dueDate: new Date(`${INV_A.dueDate}T00:00:00.000Z`),
        status: "UNPAID",
        taxRate: "0",
        subtotal: String(total),
        taxAmount: "0",
        total: String(total),
        notes: desc,
        items: {
          create: {
            description: `Item uji ${number}`,
            quantity: "1",
            unitPrice: String(total),
            amount: String(total),
            sortOrder: 1,
          },
        },
      },
    });
  invARow = await mkInvoice(INV_A.number, INV_A.total, "Invoice uji Payment Tracking A");
  invBRow = await mkInvoice(INV_B.number, INV_B.total, "Invoice uji Payment Tracking B");

  // Isolation user A: HAS one payment — target for IDOR + hidden-from-dev-list.
  isoAUser = await prisma.user.create({
    data: {
      email: isoAEmail,
      fullName: "Pay Isolation User",
      passwordHash: await Bun.password.hash("pay-isolation-password"),
    },
  });
  isoACustomer = await prisma.customer.create({
    data: {
      userId: isoAUser.id,
      name: "Pay Isolation Customer",
      phone: "+62 812 8888 8888",
      email: "pay-iso@billmate-demo.test",
      address: "Jl. Rahasia No. 9, Jakarta 10000",
    },
  });
  isoAProject = await prisma.project.create({
    data: {
      userId: isoAUser.id,
      customerId: isoACustomer.id,
      name: "Pay Isolation Project",
      projectValue: "700000",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-30T00:00:00.000Z"),
      status: "PLANNED",
    },
  });
  isoAInvoice = await prisma.invoice.create({
    data: {
      userId: isoAUser.id,
      projectId: isoAProject.id,
      invoiceNumber: "PAY-ISO-0001",
      issueDate: new Date("2026-09-05T00:00:00.000Z"),
      dueDate: new Date("2026-09-20T00:00:00.000Z"),
      status: "UNPAID",
      taxRate: "0",
      subtotal: "700000",
      taxAmount: "0",
      total: "700000",
      notes: "Invoice milik pengguna lain — tidak boleh terlihat",
    },
  });
  isoAPayment = await prisma.payment.create({
    data: {
      invoiceId: isoAInvoice.id,
      amount: "200000.00",
      paymentDate: new Date("2026-09-10T00:00:00.000Z"),
      method: "Transfer",
      notes: "PAY-ISO marker — tidak boleh terlihat",
    },
  });

  // Isolation user B: NO data at all — empty-state + scoping proof.
  isoBUser = await prisma.user.create({
    data: {
      email: isoBEmail,
      fullName: "Pay Empty User",
      passwordHash: await Bun.password.hash("pay-empty-password"),
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

  // ---------- PT1..PT1d: auth guards on all payment routes ----------
  await page.goto(`${BASE}/payments`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("PT1 /payments redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("PT1b /payments/new redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  await page.goto(`${BASE}/payments/1`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("PT1c /payments/[id] redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  await page.goto(`${BASE}/payments/1/edit`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("PT1d /payments/[id]/edit redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  // ---------- PT2: login ----------
  await uiLogin(page, EMAIL, PASSWORD);
  record("PT2 login navigates to /", page.url().replace(BASE, "").startsWith("/"), `final=${page.url()}`);

  // ---------- PT3: dashboard has Payment link ----------
  const paymentsLink = page.locator('a[href="/payments"]');
  record("PT3 dashboard shows 'Pembayaran' link", (await paymentsLink.count()) >= 1, `count=${await paymentsLink.count()}`);

  // ---------- PT4: payment list ----------
  await paymentsLink.first().click();
  await page.waitForURL("**/payments", { timeout: 15000 }).catch(() => {});
  await page.locator("h1", { hasText: "Pembayaran" }).waitFor({ timeout: 15000 });
  record("PT4 dashboard link navigates to /payments", page.url().endsWith("/payments"), `final=${page.url()}`);

  const listText = await bodyText(page);
  record("PT4a list shows seed payment's invoice number", listText.includes(SEED_PAYMENT.invoiceNumber));
  record("PT4b list shows customer via relation", listText.includes(SEED_PAYMENT.customerName));
  record("PT4c list shows formatted seed payment date", listText.includes(fmtDate(SEED_PAYMENT.paymentDate)), `want=${fmtDate(SEED_PAYMENT.paymentDate)}`);
  record("PT4d list shows formatted seed amount", listText.includes("66.000.000"), `found=${listText.includes("66.000.000")}`);
  record("PT4e list shows payment method", listText.includes(SEED_PAYMENT.method));
  record("PT4f list shows payment notes", listText.includes(SEED_PAYMENT.notesMarker));
  record("PT4g list hides other user's payment and invoice", !listText.includes("PAY-ISO") && !listText.includes("PAY-ISO-0001"));
  record("PT4h list has 'Tambah Pembayaran' action", listText.includes("Tambah Pembayaran"));

  const newSaveBtn = page.locator('button[type="submit"]', { hasText: "Tambah Pembayaran" });
  const fieldValue = (id) => page.locator(`#${id}`).inputValue();

  // ---------- PT5: server-side validation on create ----------
  // PT5a: empty form
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Invoice wajib dipilih.");
  const noInvErr = await readMessage(page, "alert");
  record("PT5a missing invoice rejected", /Invoice wajib dipilih/.test(noInvErr), `error=${noInvErr}`);

  // PT5b: invoice selected, empty amount
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").selectOption({ label: INV_A.number });
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Jumlah pembayaran wajib diisi.");
  const emptyAmtErr = await readMessage(page, "alert");
  record("PT5b empty amount rejected", /Jumlah pembayaran wajib diisi/.test(emptyAmtErr), `error=${emptyAmtErr}`);

  // PT5c: zero amount
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").selectOption({ label: INV_A.number });
  await page.locator("#amount").fill("0");
  await page.locator("#paymentDate").fill("2026-11-12");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Jumlah pembayaran harus lebih besar dari 0.");
  const zeroErr = await readMessage(page, "alert");
  record("PT5c zero amount rejected", /harus lebih besar dari 0/.test(zeroErr), `error=${zeroErr}`);

  // PT5d: negative amount (fails numeric format)
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").selectOption({ label: INV_A.number });
  await page.locator("#amount").fill("-100");
  await page.locator("#paymentDate").fill("2026-11-12");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Jumlah pembayaran tidak valid.");
  const negErr = await readMessage(page, "alert");
  record("PT5d negative amount rejected", /Jumlah pembayaran tidak valid/.test(negErr), `error=${negErr}`);

  // PT5e: non-numeric amount
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").selectOption({ label: INV_A.number });
  await page.locator("#amount").fill("bukan-angka");
  await page.locator("#paymentDate").fill("2026-11-12");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Jumlah pembayaran tidak valid.");
  const nanErr = await readMessage(page, "alert");
  record("PT5e non-numeric amount rejected", /Jumlah pembayaran tidak valid/.test(nanErr), `error=${nanErr}`);

  // PT5f: missing payment date
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").selectOption({ label: INV_A.number });
  await page.locator("#amount").fill("400000");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Tanggal pembayaran wajib diisi.");
  const dateErr = await readMessage(page, "alert");
  record("PT5f missing payment date rejected", /Tanggal pembayaran wajib diisi/.test(dateErr), `error=${dateErr}`);

  // PT5g: method over 50 chars (schema: method is String?, limit by convention)
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").selectOption({ label: INV_A.number });
  await page.locator("#amount").fill("400000");
  await page.locator("#paymentDate").fill("2026-11-12");
  await page.locator("#method").evaluate((el, v) => {
    el.value = v;
  }, "M".repeat(51));
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Metode pembayaran maksimal 50 karakter.");
  const methodErr = await readMessage(page, "alert");
  record("PT5g overlong method rejected", /Metode pembayaran maksimal 50 karakter/.test(methodErr), `error=${methodErr}`);

  // PT5h: invoice belonging to another user (tampered select)
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").evaluate(
    (el, id) => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = "Foreign Invoice";
      el.appendChild(o);
      el.value = id;
    },
    isoAInvoice.id.toString(),
  );
  await page.locator("#amount").fill("100000");
  await page.locator("#paymentDate").fill("2026-11-12");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Invoice tidak ditemukan.");
  const foreignInvErr = await readMessage(page, "alert");
  record("PT5h other user's invoice rejected", /Invoice tidak ditemukan/.test(foreignInvErr), `error=${foreignInvErr}`);

  // PT5i: nonexistent invoice id
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").evaluate((el) => {
    const o = document.createElement("option");
    o.value = "999999999";
    o.textContent = "Ghost Invoice";
    el.appendChild(o);
    el.value = "999999999";
  });
  await page.locator("#amount").fill("100000");
  await page.locator("#paymentDate").fill("2026-11-12");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Invoice tidak ditemukan.");
  const ghostInvErr = await readMessage(page, "alert");
  record("PT5i nonexistent invoice rejected", /Invoice tidak ditemukan/.test(ghostInvErr), `error=${ghostInvErr}`);

  // ---------- PT6: valid create — first payment on INV_A ----------
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").selectOption({ label: INV_A.number });
  await page.locator("#amount").fill("400000");
  await page.locator("#paymentDate").fill("2026-11-10");
  await page.locator("#method").fill("Transfer Bank");
  await page.locator("#notes").fill("DP pertama");
  await newSaveBtn.click();
  await page.waitForURL(/\/payments\/\d+$/, { timeout: 20000 }).catch(() => {});
  record("PT6 create redirects to payment detail", /\/payments\/\d+$/.test(page.url()), `final=${page.url()}`);

  const pay1Id = page.url().split("/").pop() ?? "";
  const pay1 = pay1Id
    ? await prisma.payment.findUnique({ where: { id: BigInt(pay1Id) } }).catch(() => null)
    : null;
  record("PT6a created payment persisted in DB", pay1 !== null);
  record(
    "PT6b created payment stores header fields",
    pay1?.invoiceId === invARow.id &&
      Number(pay1?.amount) === 400000 &&
      pay1?.paymentDate.toISOString().slice(0, 10) === "2026-11-10" &&
      pay1?.method === "Transfer Bank" &&
      pay1?.notes === "DP pertama",
    `amount=${pay1?.amount?.toString()}`,
  );
  const invAAfter1 = await prisma.invoice.findUnique({ where: { id: invARow.id }, select: { status: true } });
  record("PT6c invoice status becomes PARTIALLY_PAID after first payment", invAAfter1?.status === "PARTIALLY_PAID", `status=${invAAfter1?.status}`);

  // Detail page: shows amount/date/method/notes + link back to invoice
  const detailText1 = await bodyText(page);
  record("PT6d detail shows formatted amount", detailText1.includes("400.000"), `found=${detailText1.includes("400.000")}`);
  record("PT6e detail shows payment date", detailText1.includes(fmtDate(new Date("2026-11-10T00:00:00.000Z"))));
  record("PT6f detail shows method and notes", detailText1.includes("Transfer Bank") && detailText1.includes("DP pertama"));
  record(
    "PT6g detail links back to invoice",
    (await page.locator(`a[href="/invoices/${invARow.id.toString()}"]`).count()) >= 1,
  );

  // ---------- PT7: create with empty optional fields ----------
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").selectOption({ label: INV_A.number });
  await page.locator("#amount").fill("300000");
  await page.locator("#paymentDate").fill("2026-11-15");
  await newSaveBtn.click();
  await page.waitForURL(/\/payments\/\d+$/, { timeout: 20000 }).catch(() => {});
  const pay2Id = page.url().split("/").pop() ?? "";
  const pay2 = pay2Id
    ? await prisma.payment.findUnique({ where: { id: BigInt(pay2Id) } }).catch(() => null)
    : null;
  record(
    "PT7 optional method/notes may be empty",
    pay2 !== null && pay2?.method === null && pay2?.notes === null,
    `method=${pay2?.method}`,
  );
  const invAAfter2 = await prisma.invoice.findUnique({ where: { id: invARow.id }, select: { status: true } });
  record("PT7b status stays PARTIALLY_PAID on partial payments", invAAfter2?.status === "PARTIALLY_PAID", `status=${invAAfter2?.status}`);

  // ---------- PT8: exact repayment -> PAID, Decimal consistency ----------
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").selectOption({ label: INV_A.number });
  await page.locator("#amount").fill("300000");
  await page.locator("#paymentDate").fill("2026-11-20");
  await page.locator("#method").fill("Tunai");
  await page.locator("#notes").fill("Pelunasan terakhir");
  await newSaveBtn.click();
  await page.waitForURL(/\/payments\/\d+$/, { timeout: 20000 }).catch(() => {});
  const pay3Id = page.url().split("/").pop() ?? "";

  const invAAfter3 = await prisma.invoice.findUnique({ where: { id: invARow.id } });
  const pay1Row = await prisma.payment.findUnique({ where: { id: BigInt(pay1Id) } });
  const pay3Row = pay3Id ? await prisma.payment.findUnique({ where: { id: BigInt(pay3Id) } }) : null;
  const paidSum = [pay1Row, pay2, pay3Row]
    .filter(Boolean)
    .reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
  record("PT8 invoice becomes PAID when payments cover total", invAAfter3?.status === "PAID", `status=${invAAfter3?.status}`);
  record(
    "PT8b payment sums use Decimal consistently with invoice total",
    paidSum.eq(invAAfter3?.total ?? -1) && paidSum.eq(INV_A.total),
    `sum=${paidSum.toString()} total=${invAAfter3?.total?.toString()}`,
  );
  record(
    "PT8c stored amounts keep 2-decimal money precision",
    pay1Row?.amount.toString().includes("400000") && pay3Row?.amount.toString().includes("300000"),
    `p1=${pay1Row?.amount.toString()} p3=${pay3Row?.amount.toString()}`,
  );

  // ---------- PT9: navigation invoice <-> payment ----------
  await page.goto(`${BASE}/invoices/${invARow.id.toString()}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: INV_A.number }).waitFor({ timeout: 15000 });
  const recordPaymentLink = page.locator(`a[href="/payments/new?invoice=${invARow.id.toString()}"]`);
  record("PT9 invoice detail has 'Catat Pembayaran' link", (await recordPaymentLink.count()) >= 1, `count=${await recordPaymentLink.count()}`);
  await recordPaymentLink.first().click();
  await page.waitForURL(`**/payments/new?invoice=${invARow.id.toString()}`, { timeout: 15000 }).catch(() => {});
  record("PT9b Catat Pembayaran opens prefilled new payment page", (await fieldValue("invoiceId")) === invARow.id.toString(), `got=${await fieldValue("invoiceId")}`);

  await page.goto(`${BASE}/invoices/${invARow.id.toString()}`, { waitUntil: "domcontentloaded" });
  const rowLink = page.locator(`a[href="/payments/${pay1Id}"]`);
  record("PT9c invoice detail lists payment with detail link", (await rowLink.count()) >= 1, `count=${await rowLink.count()}`);
  await rowLink.first().click();
  await page.waitForURL(`**/payments/${pay1Id}`, { timeout: 15000 }).catch(() => {});
  record("PT9d payment link navigates to payment detail", page.url().endsWith(`/payments/${pay1Id}`), `final=${page.url()}`);
  const backToInvoice = page.locator(`a[href="/invoices/${invARow.id.toString()}"]`);
  record("PT9e payment detail links back to invoice", (await backToInvoice.count()) >= 1);
  await backToInvoice.first().click();
  await page.waitForURL(`**/invoices/${invARow.id.toString()}`, { timeout: 15000 }).catch(() => {});
  record("PT9f invoice link navigates to invoice detail", page.url().endsWith(`/invoices/${invARow.id.toString()}`), `final=${page.url()}`);

  // ---------- PT10: edit payment + status recalc ----------
  await page.goto(`${BASE}/payments/${pay3Id}/edit`, { waitUntil: "domcontentloaded" });
  const editSaveBtn = page.locator('button[type="submit"]', { hasText: "Simpan Perubahan" });
  record("PT10 edit prefills amount", (await fieldValue("amount")) === "300000", `got=${await fieldValue("amount")}`);
  record("PT10b edit prefills date", (await fieldValue("paymentDate")) === "2026-11-20", `got=${await fieldValue("paymentDate")}`);
  record("PT10c edit prefills method", (await fieldValue("method")) === "Tunai");
  record("PT10d edit prefills notes", (await fieldValue("notes")) === "Pelunasan terakhir");
  const editBody = await bodyText(page);
  record("PT10e edit shows related invoice number", editBody.includes(INV_A.number));

  await page.locator("#amount").fill("100000");
  await editSaveBtn.click();
  await waitForMessage(page, "status", "Pembayaran tersimpan.");
  const okMsg = await readMessage(page, "status");
  record("PT10f edit shows success message", /Pembayaran tersimpan/.test(okMsg), `msg=${okMsg}`);

  await page.reload({ waitUntil: "domcontentloaded" });
  record("PT10g edited amount persists after reload", (await fieldValue("amount")) === "100000", `got=${await fieldValue("amount")}`);
  const pay3AfterEdit = await prisma.payment.findUnique({ where: { id: BigInt(pay3Id) } });
  const invAAfterEdit = await prisma.invoice.findUnique({ where: { id: invARow.id }, select: { status: true } });
  record("PT10h edited amount persisted in DB", Number(pay3AfterEdit?.amount) === 100000, `amount=${pay3AfterEdit?.amount?.toString()}`);
  record("PT10i status recalculated to PARTIALLY_PAID after edit", invAAfterEdit?.status === "PARTIALLY_PAID", `status=${invAAfterEdit?.status}`);

  // restore full payment -> PAID again (round trip)
  await page.locator("#amount").fill("300000");
  await editSaveBtn.click();
  await waitForMessage(page, "status", "Pembayaran tersimpan.");
  const invAAfterRestore = await prisma.invoice.findUnique({ where: { id: invARow.id }, select: { status: true } });
  record("PT10j status back to PAID after restoring amount", invAAfterRestore?.status === "PAID", `status=${invAAfterRestore?.status}`);

  // ---------- PT11: IDOR — editing/deleting another user's payment rejected ----------
  await page.goto(`${BASE}/payments/${pay1Id}/edit`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="paymentId"]').evaluate((el, v) => {
    el.value = v;
  }, isoAPayment.id.toString());
  await editSaveBtn.click();
  await waitForMessage(page, "alert", "Pembayaran tidak ditemukan.");
  const idorEditErr = await readMessage(page, "alert");
  record("PT11 tampered edit paymentId rejected", /Pembayaran tidak ditemukan/.test(idorEditErr), `error=${idorEditErr}`);
  const isoStill = await prisma.payment.findUnique({ where: { id: isoAPayment.id } });
  record("PT11b other user's payment unchanged in DB", Number(isoStill?.amount) === 200000, `amount=${isoStill?.amount?.toString()}`);

  await page.goto(`${BASE}/payments/${pay1Id}`, { waitUntil: "domcontentloaded" });
  // Klik "Hapus" dulu (render state konfirmasi → re-render React), baru
  // tamper input hidden — agar reset nilai terkontrol React tidak
  // mengembalikan paymentId asli sebelum form disubmit.
  await page.locator('button', { hasText: "Hapus" }).click();
  await page.locator('button', { hasText: "Ya, Hapus" }).waitFor({ timeout: 15000 });
  await page.locator('input[name="paymentId"]').evaluate((el, v) => {
    el.value = v;
  }, isoAPayment.id.toString());
  await page.locator('button', { hasText: "Ya, Hapus" }).click();
  await waitForMessage(page, "alert", "Pembayaran tidak ditemukan.");
  const idorDelErr = await readMessage(page, "alert");
  record("PT11c tampered delete paymentId rejected", /Pembayaran tidak ditemukan/.test(idorDelErr), `error=${idorDelErr}`);
  const isoAfterTamper = await prisma.payment.findUnique({ where: { id: isoAPayment.id } });
  const pay1AfterTamper = await prisma.payment.findUnique({ where: { id: BigInt(pay1Id) } });
  record("PT11d other user's payment still exists", isoAfterTamper !== null);
  record("PT11e own payment not deleted by tampered request", pay1AfterTamper !== null);

  // ---------- PT12: delete payment -> status recalculated ----------
  await page.goto(`${BASE}/payments/${pay3Id}`, { waitUntil: "domcontentloaded" });
  await page.locator('button', { hasText: "Hapus" }).click();
  await page.locator('button', { hasText: "Ya, Hapus" }).click();
  await page.waitForURL("**/payments", { timeout: 20000 }).catch(() => {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Pembayaran" }).waitFor({ timeout: 15000 });
  const afterDeleteList = await bodyText(page);
  record("PT12 deleted payment removed from list", !afterDeleteList.includes("Pelunasan terakhir"));
  const pay3AfterDelete = await prisma.payment.findUnique({ where: { id: BigInt(pay3Id) } }).catch(() => null);
  record("PT12b deleted payment removed from DB", pay3AfterDelete === null);
  const invAAfterDelete = await prisma.invoice.findUnique({ where: { id: invARow.id }, select: { status: true } });
  record("PT12c status back to PARTIALLY_PAID after delete", invAAfterDelete?.status === "PARTIALLY_PAID", `status=${invAAfterDelete?.status}`);

  // ---------- PT13: delete remaining payments -> UNPAID ----------
  for (const pid of [pay1Id, pay2Id]) {
    await page.goto(`${BASE}/payments/${pid}`, { waitUntil: "domcontentloaded" });
    await page.locator('button', { hasText: "Hapus" }).click();
    await page.locator('button', { hasText: "Ya, Hapus" }).click();
    await page.waitForURL("**/payments", { timeout: 20000 }).catch(() => {});
  }
  const invAFinal = await prisma.invoice.findUnique({ where: { id: invARow.id }, select: { status: true } });
  const invAPaymentCount = await prisma.payment.count({ where: { invoiceId: invARow.id } });
  record("PT13 status back to UNPAID after deleting all payments", invAFinal?.status === "UNPAID", `status=${invAFinal?.status}`);
  record("PT13b all test payments removed from invoice A", invAPaymentCount === 0, `count=${invAPaymentCount}`);
  await page.goto(`${BASE}/invoices/${invARow.id.toString()}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: INV_A.number }).waitFor({ timeout: 15000 });
  const invABody = await bodyText(page);
  record("PT13c invoice detail shows empty payment state again", invABody.includes("Belum ada pembayaran"));

  // ---------- PT14: decimal amount + overpayment allowed (-> PAID) ----------
  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").selectOption({ label: INV_B.number });
  await page.locator("#amount").fill("1234.56");
  await page.locator("#paymentDate").fill("2026-11-12");
  await newSaveBtn.click();
  await page.waitForURL(/\/payments\/\d+$/, { timeout: 20000 }).catch(() => {});
  const decPayId = page.url().split("/").pop() ?? "";
  const decPay = decPayId
    ? await prisma.payment.findUnique({ where: { id: BigInt(decPayId) } }).catch(() => null)
    : null;
  record(
    "PT14 decimal amount stored with 2-decimal precision",
    decPay !== null && Number(decPay?.amount) === 1234.56 && (decPay?.amount.toString() ?? "").includes("1234.56"),
    `amount=${decPay?.amount?.toString()}`,
  );
  const invBAfterDec = await prisma.invoice.findUnique({ where: { id: invBRow.id }, select: { status: true } });
  record("PT14b invoice B PARTIALLY_PAID after decimal payment", invBAfterDec?.status === "PARTIALLY_PAID", `status=${invBAfterDec?.status}`);

  await page.goto(`${BASE}/payments/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceId").selectOption({ label: INV_B.number });
  await page.locator("#amount").fill("600000");
  await page.locator("#paymentDate").fill("2026-11-25");
  await newSaveBtn.click();
  await page.waitForURL(/\/payments\/\d+$/, { timeout: 20000 }).catch(() => {});
  const overPayId = page.url().split("/").pop() ?? "";
  const invBAfterOver = await prisma.invoice.findUnique({ where: { id: invBRow.id }, select: { status: true } });
  record(
    "PT14c overpayment allowed and marks invoice PAID",
    invBAfterOver?.status === "PAID",
    `status=${invBAfterOver?.status} overPayId=${overPayId}`,
  );

  // delete both invoice-B payments -> status walks back down
  if (overPayId) {
    await page.goto(`${BASE}/payments/${overPayId}`, { waitUntil: "domcontentloaded" });
    await page.locator('button', { hasText: "Hapus" }).click();
    await page.locator('button', { hasText: "Ya, Hapus" }).click();
    await page.waitForURL("**/payments", { timeout: 20000 }).catch(() => {});
  }
  const invBAfterDel1 = await prisma.invoice.findUnique({ where: { id: invBRow.id }, select: { status: true } });
  record("PT14d invoice B PARTIALLY_PAID after overpayment deleted", invBAfterDel1?.status === "PARTIALLY_PAID", `status=${invBAfterDel1?.status}`);
  await page.goto(`${BASE}/payments/${decPayId}`, { waitUntil: "domcontentloaded" });
  await page.locator('button', { hasText: "Hapus" }).click();
  await page.locator('button', { hasText: "Ya, Hapus" }).click();
  await page.waitForURL("**/payments", { timeout: 20000 }).catch(() => {});
  const invBAfterDel2 = await prisma.invoice.findUnique({ where: { id: invBRow.id }, select: { status: true } });
  record("PT14e invoice B UNPAID after last payment deleted", invBAfterDel2?.status === "UNPAID", `status=${invBAfterDel2?.status}`);

  // ---------- PT15: 404 for nonexistent / foreign payment ----------
  const resp404 = await page.goto(`${BASE}/payments/999999999`, { waitUntil: "domcontentloaded" });
  record("PT15 nonexistent payment returns 404", resp404?.status() === 404, `status=${resp404?.status()}`);
  const respIso = await page.goto(`${BASE}/payments/${isoAPayment.id.toString()}`, { waitUntil: "domcontentloaded" });
  record("PT15b other user's payment detail returns 404", respIso?.status() === 404, `status=${respIso?.status()}`);
  const respIsoEdit = await page.goto(`${BASE}/payments/${isoAPayment.id.toString()}/edit`, { waitUntil: "domcontentloaded" });
  record("PT15c other user's payment edit returns 404", respIsoEdit?.status() === 404, `status=${respIsoEdit?.status()}`);

  // ---------- PT16: isolation user sees only (nothing) — empty state ----------
  // Halaman 404 tidak punya header — pindah dulu ke halaman ber-header.
  await page.goto(`${BASE}/payments`, { waitUntil: "domcontentloaded" });
  await uiLogout(page);
  record("PT16 logout returns to /login", page.url().endsWith("/login"), `final=${page.url()}`);
  await uiLogin(page, isoBEmail, "pay-empty-password");
  await page.goto(`${BASE}/payments`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Pembayaran" }).waitFor({ timeout: 15000 });
  const isoBText = await bodyText(page);
  record("PT16b other user's list shows empty state", isoBText.includes("Belum ada pembayaran"), `has=${isoBText.includes("Belum ada pembayaran")}`);
  record(
    "PT16c other user's list hides dev's seed payment",
    !isoBText.includes(SEED_PAYMENT.invoiceNumber) && !isoBText.includes("66.000.000"),
  );
  await uiLogout(page);

  // ---------- PT17: DB integrity + seed untouched (before cleanup) ----------
  const devPayments = await prisma.payment.count({ where: { invoice: { userId: devUser.id } } });
  record("PT17 dev has exactly the 1 seed payment left", devPayments === 1, `count=${devPayments}`);
  const seedPayment = await prisma.payment.findUnique({ where: { id: BigInt(1) } });
  record(
    "PT17b seed payment intact",
    Number(seedPayment?.amount) === SEED_PAYMENT.amount &&
      seedPayment?.paymentDate.toISOString().slice(0, 10) === "2026-10-06" &&
      seedPayment?.method === SEED_PAYMENT.method &&
      seedPayment?.invoiceId === BigInt(1),
    `amount=${seedPayment?.amount?.toString()}`,
  );
  const seedInvoiceFinal = await prisma.invoice.findUnique({
    where: { id: BigInt(1) },
    include: { _count: { select: { payments: true, items: true } } },
  });
  const seedPaidSum = (
    await prisma.payment.aggregate({ where: { invoiceId: BigInt(1) }, _sum: { amount: true } })
  )._sum.amount;
  record(
    "PT17c seed invoice status consistent with its payments",
    seedInvoiceFinal?.status === "PARTIALLY_PAID" &&
      seedInvoiceFinal?._count.payments === 1 &&
      statusFor(seedPaidSum ?? new Prisma.Decimal(0), seedInvoiceFinal?.total ?? 0).toString() ===
        seedInvoiceFinal?.status.toString(),
    `status=${seedInvoiceFinal?.status}`,
  );
  const seedProjectFinal = await prisma.project.findUnique({
    where: { id: BigInt(1) },
    select: { name: true, projectValue: true, status: true, _count: { select: { invoices: true, expenses: true } } },
  });
  const seedCustomerFinal = await prisma.customer.findUnique({
    where: { id: BigInt(1) },
    select: { name: true, _count: { select: { projects: true } } },
  });
  record(
    "PT17d seed project and customer intact",
    seedProjectFinal?.name === "Demo Office Garden" &&
      Number(seedProjectFinal?.projectValue) === 250000000 &&
      seedProjectFinal?.status === "IN_PROGRESS" &&
      seedProjectFinal?._count.invoices === 1 &&
      seedProjectFinal?._count.expenses === 1 &&
      seedCustomerFinal?.name === "Demo Customer Co." &&
      // Fixture PAY-TEST Project sementara menempel pada seed customer
      // (dihapus lagi di cleanup), jadi jumlahnya 1 seed + 1 fixture.
      seedCustomerFinal?._count.projects === (testProject ? 2 : 1),
    `project=${seedProjectFinal?.name}`,
  );

  // Recompute every dev invoice status from stored payments (Decimal math).
  const devInvoices = await prisma.invoice.findMany({ where: { userId: devUser.id } });
  let statusesConsistent = true;
  let statusDetail = "";
  for (const inv of devInvoices) {
    const sum =
      (await prisma.payment.aggregate({ where: { invoiceId: inv.id }, _sum: { amount: true } }))
        ._sum.amount ?? new Prisma.Decimal(0);
    const expected = statusFor(sum, inv.total);
    if (expected !== inv.status) {
      statusesConsistent = false;
      statusDetail = `${inv.invoiceNumber}: paid=${sum.toString()} total=${inv.total.toString()} want=${expected} got=${inv.status}`;
      break;
    }
  }
  record("PT17e all dev invoice statuses consistent with stored payments", statusesConsistent, statusDetail);

  const orphanPayments = await prisma.$queryRawUnsafe(
    `SELECT count(*)::bigint AS c FROM payment p LEFT JOIN invoice i ON i.id = p.invoice_id WHERE i.id IS NULL`,
  );
  record("PT17f no orphan payments", Number(orphanPayments[0].c) === 0, `orphans=${Number(orphanPayments[0].c)}`);
  const leftover = await prisma.payment.count({
    where: { invoice: { invoiceNumber: { startsWith: "PAY-TEST" } } },
  });
  record("PT17g no leftover test payments", leftover === 0, `leftover=${leftover}`);

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
