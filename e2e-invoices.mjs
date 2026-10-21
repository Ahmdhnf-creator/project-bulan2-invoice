// Browser E2E for BillMate Invoice Management.
// Reads credentials from env; never logs them.
// Seeds a second user + customer + project + invoice directly via Prisma
// to verify per-user data isolation, then cleans up in `finally`.
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

// Seed invoice (from prisma/seed.ts) — has 1 payment, so deletion must
// be blocked by the payment relation (ON DELETE RESTRICT).
const SEED_INVOICE = {
  number: "INV-2026-0001",
  project: "Demo Office Garden",
  statusLabel: "Sebagian Dibayar",
  totalText: "166.500.000",
  taxRate: 11,
  subtotal: 150000000,
  taxAmount: 16500000,
  total: 166500000,
  itemCount: 2,
  paymentCount: 1,
};
// Values used to create, then edit, an invoice owned by the dev user.
const NEW_INVOICE = {
  number: "INV-TEST-001",
  project: "IM Test Project",
  issueDate: "2026-11-01",
  dueDate: "2026-11-30",
  status: "UNPAID",
  taxRate: "11",
  notes: "Catatan uji Invoice Management",
  items: [
    { description: "Pembuatan website", quantity: "1", unitPrice: "10000000", amount: 10000000 },
    { description: "Konten 5 halaman", quantity: "5", unitPrice: "500000", amount: 2500000 },
  ],
  subtotal: 12500000,
  taxAmount: 1375000,
  total: 13875000,
};
const EDIT_INVOICE = {
  number: "INV-TEST-002",
  status: "PAID",
  taxRate: "10",
  notes: "Catatan ubah Invoice Management",
  item: { description: "Retainer bulanan", quantity: "3", unitPrice: "2000000", amount: 6000000 },
  subtotal: 6000000,
  taxAmount: 600000,
  total: 6600000,
};

let passCount = 0;
let failCount = 0;
function record(name, ok, detail = "") {
  if (ok) passCount++;
  else failCount++;
  console.log(`${ok ? "PASS" : "FAIL"} [browser] ${name}${detail ? ` — ${detail}` : ""}`);
}

// Poll until a message element with the given role contains the expected text.
// Waiting for the *text* (not mere element existence) avoids reading a stale
// message left over from the previous submission.
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

// --- Test fixture: isolated project for dev's test invoices + second user ---
const isoEmail = `im-isolation-${Date.now()}@billmate-demo.test`;
let devUser = null;
let testProject = null;
let isoUser = null;
let isoCustomer = null;
let isoProject = null;
let isoInvoice = null;
let seedInvoiceId = null;

async function cleanupFixture() {
  try {
    if (devUser) {
      await prisma.invoice.deleteMany({
        where: { userId: devUser.id, invoiceNumber: { startsWith: "INV-TEST" } },
      });
    }
    if (testProject) {
      await prisma.project.delete({ where: { id: testProject.id } }).catch(() => {});
    }
    if (isoUser) {
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
    where: { userId: devUser.id, name: "Demo Customer Co." },
    select: { id: true },
  });
  if (!seedCustomer) {
    throw new Error("SETUP FAIL: seed customer not found");
  }
  // Isolated project for every test invoice so the seed project is never
  // polluted by test rows.
  testProject = await prisma.project.create({
    data: {
      userId: devUser.id,
      customerId: seedCustomer.id,
      name: NEW_INVOICE.project,
      projectValue: "100000000",
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      status: "IN_PROGRESS",
      notes: "Proyek uji Invoice Management",
    },
  });
  isoUser = await prisma.user.create({
    data: {
      email: isoEmail,
      fullName: "IM Isolation User",
      passwordHash: await Bun.password.hash("im-isolation-password"),
    },
  });
  isoCustomer = await prisma.customer.create({
    data: {
      userId: isoUser.id,
      name: "IM Isolation Customer",
      phone: "+62 811 7777 7777",
      email: "im-iso@billmate-demo.test",
      address: "Jl. Rahasia No. 3, Jakarta 10000",
    },
  });
  isoProject = await prisma.project.create({
    data: {
      userId: isoUser.id,
      customerId: isoCustomer.id,
      name: "IM Isolation Project",
      projectValue: "50000000",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-30T00:00:00.000Z"),
      status: "PLANNED",
    },
  });
  isoInvoice = await prisma.invoice.create({
    data: {
      userId: isoUser.id,
      projectId: isoProject.id,
      invoiceNumber: "INV-ISO-0001",
      issueDate: new Date("2026-09-05T00:00:00.000Z"),
      dueDate: new Date("2026-09-20T00:00:00.000Z"),
      status: "UNPAID",
      taxRate: "0",
      subtotal: "1000000",
      taxAmount: "0",
      total: "1000000",
      notes: "Invoice milik pengguna lain — tidak boleh terlihat",
    },
  });
  const seedInvoice = await prisma.invoice.findUnique({
    where: { id: BigInt(1) },
    select: { id: true },
  });
  seedInvoiceId = seedInvoice?.id ?? null;
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

  // ---------- IV1: /invoices without session ----------
  await page.goto(`${BASE}/invoices`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("IV1 /invoices redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  // ---------- IV1b: /invoices/new without session ----------
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("IV1b /invoices/new redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  // ---------- IV2: login ----------
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 20000 }).catch(() => {});
  record("IV2 login navigates to /", page.url().replace(BASE, "").startsWith("/"), `final=${page.url()}`);

  // ---------- IV3: dashboard has Invoice link ----------
  const invoicesLink = page.locator('a[href="/invoices"]');
  record("IV3 dashboard shows 'Invoice' link", (await invoicesLink.count()) >= 1, `count=${await invoicesLink.count()}`);

  // ---------- IV4: invoice list ----------
  await invoicesLink.first().click();
  await page.waitForURL("**/invoices", { timeout: 15000 }).catch(() => {});
  // Wait for page content rather than networkidle: Next.js re-issues RSC
  // prefetches for dynamic routes, which keeps network activity alive.
  await page.locator("h1", { hasText: "Invoice" }).waitFor({ timeout: 15000 });
  record("IV4 dashboard link navigates to /invoices", page.url().endsWith("/invoices"), `final=${page.url()}`);

  const listText = await bodyText(page);
  record("IV4a list shows seed invoice number", listText.includes(SEED_INVOICE.number));
  record("IV4b list shows seed project name", listText.includes(SEED_INVOICE.project));
  record("IV4c list shows seed status label", listText.includes(SEED_INVOICE.statusLabel));
  record("IV4d list shows formatted seed total", listText.includes(SEED_INVOICE.totalText), `found=${listText.includes(SEED_INVOICE.totalText)}`);
  record("IV4e list hides other user's invoice", !listText.includes(isoInvoice.invoiceNumber));
  record("IV4f list has 'Tambah Invoice' action", listText.includes("Tambah Invoice"));

  // ---------- IV5: server-side validation on create ----------
  const newSaveBtn = page.locator('button[type="submit"]', { hasText: "Tambah Invoice" });
  const fieldValue = (id) => page.locator(`#${id}`).inputValue();
  const itemDesc = page.locator('input[name="itemDescription"]');
  const itemQty = page.locator('input[name="itemQuantity"]');
  const itemPrice = page.locator('input[name="itemUnitPrice"]');

  // IV5a: empty invoice number
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Nomor invoice wajib diisi.");
  const numberErr = await readMessage(page, "alert");
  record("IV5a empty invoice number rejected", /Nomor invoice wajib diisi/.test(numberErr), `error=${numberErr}`);

  // IV5b: no project selected
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceNumber").fill(NEW_INVOICE.number);
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Proyek wajib dipilih.");
  const noProjectErr = await readMessage(page, "alert");
  record("IV5b missing project rejected", /Proyek wajib dipilih/.test(noProjectErr), `error=${noProjectErr}`);

  // IV5c: project belonging to another user (tampered select)
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceNumber").fill(NEW_INVOICE.number);
  await page.locator("#projectId").evaluate(
    (el, id) => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = "Foreign Project";
      el.appendChild(o);
      el.value = id;
    },
    isoProject.id.toString(),
  );
  await page.locator("#issueDate").fill(NEW_INVOICE.issueDate);
  await page.locator("#dueDate").fill(NEW_INVOICE.dueDate);
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Proyek tidak ditemukan.");
  const foreignProjectErr = await readMessage(page, "alert");
  record("IV5c other user's project rejected", /Proyek tidak ditemukan/.test(foreignProjectErr), `error=${foreignProjectErr}`);

  // IV5d: missing issue date
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceNumber").fill(NEW_INVOICE.number);
  await page.locator("#projectId").selectOption({ label: NEW_INVOICE.project });
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Tanggal terbit wajib diisi.");
  const issueErr = await readMessage(page, "alert");
  record("IV5d missing issue date rejected", /Tanggal terbit wajib diisi/.test(issueErr), `error=${issueErr}`);

  // IV5e: due date before issue date
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceNumber").fill(NEW_INVOICE.number);
  await page.locator("#projectId").selectOption({ label: NEW_INVOICE.project });
  await page.locator("#issueDate").fill("2026-12-01");
  await page.locator("#dueDate").fill("2026-11-01");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Tanggal jatuh tempo tidak boleh sebelum tanggal terbit.");
  const dueErr = await readMessage(page, "alert");
  record("IV5e due date before issue date rejected", /Tanggal jatuh tempo tidak boleh sebelum tanggal terbit/.test(dueErr), `error=${dueErr}`);

  // IV5f: invalid tax rate
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceNumber").fill(NEW_INVOICE.number);
  await page.locator("#projectId").selectOption({ label: NEW_INVOICE.project });
  await page.locator("#issueDate").fill(NEW_INVOICE.issueDate);
  await page.locator("#dueDate").fill(NEW_INVOICE.dueDate);
  await page.locator("#taxRate").fill("bukan-angka");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Pajak tidak valid.");
  const taxErr = await readMessage(page, "alert");
  record("IV5f invalid tax rate rejected", /Pajak tidak valid/.test(taxErr), `error=${taxErr}`);

  // IV5g: invalid status value (tampered select)
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceNumber").fill(NEW_INVOICE.number);
  await page.locator("#projectId").selectOption({ label: NEW_INVOICE.project });
  await page.locator("#issueDate").fill(NEW_INVOICE.issueDate);
  await page.locator("#dueDate").fill(NEW_INVOICE.dueDate);
  await page.locator("#status").evaluate((el) => {
    const o = document.createElement("option");
    o.value = "HACKED";
    o.textContent = "HACKED";
    el.appendChild(o);
    el.value = "HACKED";
  });
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Status invoice tidak valid.");
  const statusErr = await readMessage(page, "alert");
  record("IV5g invalid status rejected", /Status invoice tidak valid/.test(statusErr), `error=${statusErr}`);

  // IV5h: no items (remove the only row)
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceNumber").fill(NEW_INVOICE.number);
  await page.locator("#projectId").selectOption({ label: NEW_INVOICE.project });
  await page.locator("#issueDate").fill(NEW_INVOICE.issueDate);
  await page.locator("#dueDate").fill(NEW_INVOICE.dueDate);
  await page.locator('button', { hasText: "Hapus Item" }).click();
  record("IV5h0 item row removed in form", (await itemDesc.count()) === 0, `rows=${await itemDesc.count()}`);
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Minimal invoice harus memiliki 1 item.");
  const noItemsErr = await readMessage(page, "alert");
  record("IV5h empty items rejected", /Minimal invoice harus memiliki 1 item/.test(noItemsErr), `error=${noItemsErr}`);

  // IV5i: invalid item quantity
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceNumber").fill(NEW_INVOICE.number);
  await page.locator("#projectId").selectOption({ label: NEW_INVOICE.project });
  await page.locator("#issueDate").fill(NEW_INVOICE.issueDate);
  await page.locator("#dueDate").fill(NEW_INVOICE.dueDate);
  await itemDesc.nth(0).fill("Item uji kuantitas");
  await itemQty.nth(0).fill("bukan-angka");
  await itemPrice.nth(0).fill("1000");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Kuantitas item tidak valid.");
  const qtyErr = await readMessage(page, "alert");
  record("IV5i invalid item quantity rejected", /Kuantitas item tidak valid/.test(qtyErr), `error=${qtyErr}`);

  // IV5j: duplicate invoice number (seed already owns INV-2026-0001)
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceNumber").fill(SEED_INVOICE.number);
  await page.locator("#projectId").selectOption({ label: NEW_INVOICE.project });
  await page.locator("#issueDate").fill(NEW_INVOICE.issueDate);
  await page.locator("#dueDate").fill(NEW_INVOICE.dueDate);
  await itemDesc.nth(0).fill(NEW_INVOICE.items[0].description);
  await itemQty.nth(0).fill(NEW_INVOICE.items[0].quantity);
  await itemPrice.nth(0).fill(NEW_INVOICE.items[0].unitPrice);
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Nomor invoice sudah digunakan.");
  const dupErr = await readMessage(page, "alert");
  record("IV5j duplicate invoice number rejected", /Nomor invoice sudah digunakan/.test(dupErr), `error=${dupErr}`);

  // ---------- IV6: create — valid, 2 items, tax 11% ----------
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceNumber").fill(NEW_INVOICE.number);
  await page.locator("#projectId").selectOption({ label: NEW_INVOICE.project });
  await page.locator("#issueDate").fill(NEW_INVOICE.issueDate);
  await page.locator("#dueDate").fill(NEW_INVOICE.dueDate);
  await page.locator("#status").selectOption(NEW_INVOICE.status);
  await page.locator("#taxRate").fill(NEW_INVOICE.taxRate);
  await page.locator("#notes").fill(NEW_INVOICE.notes);
  await itemDesc.nth(0).fill(NEW_INVOICE.items[0].description);
  await itemQty.nth(0).fill(NEW_INVOICE.items[0].quantity);
  await itemPrice.nth(0).fill(NEW_INVOICE.items[0].unitPrice);
  await page.locator('button', { hasText: "Tambah Item" }).click();
  await itemDesc.nth(1).fill(NEW_INVOICE.items[1].description);
  await itemQty.nth(1).fill(NEW_INVOICE.items[1].quantity);
  await itemPrice.nth(1).fill(NEW_INVOICE.items[1].unitPrice);
  await newSaveBtn.click();
  await page.waitForURL(/\/invoices\/\d+$/, { timeout: 20000 }).catch(() => {});
  await page.locator("h1", { hasText: NEW_INVOICE.number }).waitFor({ timeout: 15000 });
  record("IV6 create redirects to new invoice detail", /\/invoices\/\d+$/.test(page.url()), `final=${page.url()}`);

  const newId = page.url().split("/").pop() ?? "";
  const createdRow = newId
    ? await prisma.invoice.findUnique({ where: { id: BigInt(newId) } }).catch(() => null)
    : null;
  record("IV6a created invoice persisted in DB", createdRow !== null);
  record("IV6b created invoice owned by session user", createdRow?.userId === devUser.id, `userId=${createdRow?.userId?.toString()}`);
  record("IV6c created invoice linked to chosen project", createdRow?.projectId === testProject.id, `projectId=${createdRow?.projectId?.toString()}`);
  record(
    "IV6d created invoice stores header fields",
    createdRow?.invoiceNumber === NEW_INVOICE.number &&
      createdRow?.issueDate.toISOString().slice(0, 10) === NEW_INVOICE.issueDate &&
      createdRow?.dueDate.toISOString().slice(0, 10) === NEW_INVOICE.dueDate &&
      createdRow?.status === NEW_INVOICE.status &&
      createdRow?.notes === NEW_INVOICE.notes,
    `number=${createdRow?.invoiceNumber}`,
  );
  // Financial totals are recomputed on the server, never trusted from client.
  record(
    "IV6e server computed subtotal/tax/total",
    Number(createdRow?.subtotal) === NEW_INVOICE.subtotal &&
      Number(createdRow?.taxAmount) === NEW_INVOICE.taxAmount &&
      Number(createdRow?.total) === NEW_INVOICE.total,
    `subtotal=${createdRow?.subtotal?.toString()} tax=${createdRow?.taxAmount?.toString()} total=${createdRow?.total?.toString()}`,
  );
  record("IV6f stored tax rate", Number(createdRow?.taxRate) === Number(NEW_INVOICE.taxRate), `taxRate=${createdRow?.taxRate?.toString()}`);

  const createdItems = await prisma.invoiceItem.findMany({
    where: { invoiceId: BigInt(newId) },
    orderBy: { sortOrder: "asc" },
  });
  record("IV6g created items count", createdItems.length === 2, `count=${createdItems.length}`);
  record(
    "IV6h created item amounts computed server-side",
    Number(createdItems[0]?.amount) === NEW_INVOICE.items[0].amount &&
      Number(createdItems[1]?.amount) === NEW_INVOICE.items[1].amount,
    `a0=${createdItems[0]?.amount?.toString()} a1=${createdItems[1]?.amount?.toString()}`,
  );
  record(
    "IV6i created item quantities and prices stored",
    Number(createdItems[0]?.quantity) === 1 &&
      Number(createdItems[0]?.unitPrice) === 10000000 &&
      createdItems[0]?.description === NEW_INVOICE.items[0].description &&
      createdItems[1]?.sortOrder === 2,
    `q0=${createdItems[0]?.quantity?.toString()}`,
  );

  // ---------- IV6j: decimal rounding — half-up to 2 decimals ----------
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#invoiceNumber").fill("INV-TEST-ROUND");
  await page.locator("#projectId").selectOption({ label: NEW_INVOICE.project });
  await page.locator("#issueDate").fill(NEW_INVOICE.issueDate);
  await page.locator("#dueDate").fill(NEW_INVOICE.dueDate);
  await page.locator("#taxRate").fill("10.5");
  await itemDesc.nth(0).fill("Item pembulatan");
  await itemQty.nth(0).fill("1.33");
  await itemPrice.nth(0).fill("1.11");
  await newSaveBtn.click();
  await page.waitForURL(/\/invoices\/\d+$/, { timeout: 20000 }).catch(() => {});
  await page.locator("h1", { hasText: "INV-TEST-ROUND" }).waitFor({ timeout: 15000 });
  const roundRow = await prisma.invoice.findFirst({
    where: { invoiceNumber: "INV-TEST-ROUND" },
  });
  // 1.33 × 1.11 = 1.4763 → 1.48 (half-up); 1.48 × 10.5% = 0.1554 → 0.16; total 1.64.
  record(
    "IV6j decimal arithmetic rounds half-up to 2 decimals",
    Number(roundRow?.subtotal) === 1.48 &&
      Number(roundRow?.taxAmount) === 0.16 &&
      Number(roundRow?.total) === 1.64,
    `subtotal=${roundRow?.subtotal?.toString()} tax=${roundRow?.taxAmount?.toString()} total=${roundRow?.total?.toString()}`,
  );
  const roundItemId = page.url().split("/").pop() ?? "";
  if (roundItemId) {
    await prisma.invoice.delete({ where: { id: BigInt(roundItemId) } }).catch(() => {});
  }

  // ---------- IV7: detail page shows fields + items + links ----------
  const detailText = await bodyText(page);
  record("IV7a detail shows seed-style invoice number", detailText.includes("INV-TEST-ROUND") || detailText.includes(NEW_INVOICE.number));

  await page.goto(`${BASE}/invoices/${newId}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: NEW_INVOICE.number }).waitFor({ timeout: 15000 });
  const newDetailText = await bodyText(page);
  record("IV7b detail shows project name", newDetailText.includes(NEW_INVOICE.project));
  record("IV7c detail shows formatted total", newDetailText.includes("13.875.000"), `found=${newDetailText.includes("13.875.000")}`);
  record("IV7d detail shows item description", newDetailText.includes(NEW_INVOICE.items[0].description));
  record("IV7e detail shows second item description", newDetailText.includes(NEW_INVOICE.items[1].description));
  record(
    "IV7f detail links to project page",
    (await page.locator(`a[href="/projects/${testProject.id.toString()}"]`).count()) >= 1,
  );
  record("IV7g detail shows empty payment state", newDetailText.includes("Belum ada pembayaran"));

  // ---------- IV7h: project detail links back to invoice ----------
  await page.goto(`${BASE}/projects/${testProject.id.toString()}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: NEW_INVOICE.project }).waitFor({ timeout: 15000 });
  const invoiceLinks = page.locator(`a[href="/invoices/${newId}"]`);
  record("IV7h project detail links to invoice", (await invoiceLinks.count()) >= 1, `count=${await invoiceLinks.count()}`);
  await invoiceLinks.first().click();
  await page.waitForURL(`**/invoices/${newId}`, { timeout: 15000 }).catch(() => {});
  record("IV7i invoice link navigates to invoice detail", page.url().endsWith(`/invoices/${newId}`), `final=${page.url()}`);

  // ---------- IV8: edit form prefill + persistence ----------
  await page.goto(`${BASE}/invoices/${newId}/edit`, { waitUntil: "domcontentloaded" });
  const editSaveBtn = page.locator('button[type="submit"]', { hasText: "Simpan Perubahan" });
  record("IV8a edit prefills invoice number", (await fieldValue("invoiceNumber")) === NEW_INVOICE.number, `got=${await fieldValue("invoiceNumber")}`);
  record("IV8b edit prefills issue date", (await fieldValue("issueDate")) === NEW_INVOICE.issueDate, `got=${await fieldValue("issueDate")}`);
  record("IV8c edit prefills due date", (await fieldValue("dueDate")) === NEW_INVOICE.dueDate, `got=${await fieldValue("dueDate")}`);
  record("IV8d edit prefills status", (await fieldValue("status")) === NEW_INVOICE.status, `got=${await fieldValue("status")}`);
  record("IV8e edit prefills tax rate", Number(await fieldValue("taxRate")) === Number(NEW_INVOICE.taxRate), `got=${await fieldValue("taxRate")}`);
  record("IV8f edit prefills notes", (await fieldValue("notes")) === NEW_INVOICE.notes);
  record(
    "IV8g edit prefills project",
    (await page.locator("#projectId").locator("option:checked").textContent()) === NEW_INVOICE.project,
    `got=${await page.locator("#projectId").locator("option:checked").textContent()}`,
  );
  record("IV8h edit prefills item rows", (await itemDesc.count()) === 2, `rows=${await itemDesc.count()}`);
  record("IV8i edit prefills first item", (await itemDesc.nth(0).inputValue()) === NEW_INVOICE.items[0].description && (await itemQty.nth(0).inputValue()) === "1", `desc=${await itemDesc.nth(0).inputValue()}`);
  record("IV8j edit prefills second item", (await itemDesc.nth(1).inputValue()) === NEW_INVOICE.items[1].description && (await itemPrice.nth(1).inputValue()) === "500000");

  await page.locator("#invoiceNumber").fill(EDIT_INVOICE.number);
  await page.locator("#status").selectOption(EDIT_INVOICE.status);
  await page.locator("#taxRate").fill(EDIT_INVOICE.taxRate);
  await page.locator("#notes").fill(EDIT_INVOICE.notes);
  await itemDesc.nth(0).fill(EDIT_INVOICE.item.description);
  await itemQty.nth(0).fill(EDIT_INVOICE.item.quantity);
  await itemPrice.nth(0).fill(EDIT_INVOICE.item.unitPrice);
  await page.locator('button', { hasText: "Hapus Item" }).nth(1).click();
  record("IV8k removed second item row", (await itemDesc.count()) === 1, `rows=${await itemDesc.count()}`);
  await editSaveBtn.click();
  await waitForMessage(page, "status", "Invoice tersimpan.");
  const okMsg = await readMessage(page, "status");
  record("IV8l edit shows success message", /Invoice tersimpan/.test(okMsg), `msg=${okMsg}`);

  await page.reload({ waitUntil: "domcontentloaded" });
  record("IV8m edited number persists after reload", (await fieldValue("invoiceNumber")) === EDIT_INVOICE.number, `got=${await fieldValue("invoiceNumber")}`);
  record("IV8n edited status persists after reload", (await fieldValue("status")) === EDIT_INVOICE.status);
  record("IV8o edited tax persists after reload", Number(await fieldValue("taxRate")) === Number(EDIT_INVOICE.taxRate));
  const editedRow = await prisma.invoice.findUnique({ where: { id: BigInt(newId) } }).catch(() => null);
  record(
    "IV8p edited header persisted in DB",
    editedRow?.invoiceNumber === EDIT_INVOICE.number &&
      editedRow?.status === EDIT_INVOICE.status &&
      editedRow?.notes === EDIT_INVOICE.notes,
    `number=${editedRow?.invoiceNumber}`,
  );
  record(
    "IV8q edited totals recomputed on server",
    Number(editedRow?.subtotal) === EDIT_INVOICE.subtotal &&
      Number(editedRow?.taxAmount) === EDIT_INVOICE.taxAmount &&
      Number(editedRow?.total) === EDIT_INVOICE.total,
    `subtotal=${editedRow?.subtotal?.toString()} tax=${editedRow?.taxAmount?.toString()} total=${editedRow?.total?.toString()}`,
  );
  const editedItems = await prisma.invoiceItem.findMany({
    where: { invoiceId: BigInt(newId) },
    orderBy: { sortOrder: "asc" },
  });
  record("IV8r items replaced on edit", editedItems.length === 1, `count=${editedItems.length}`);
  record(
    "IV8s edited item values stored",
    editedItems[0]?.description === EDIT_INVOICE.item.description &&
      Number(editedItems[0]?.quantity) === 3 &&
      Number(editedItems[0]?.unitPrice) === 2000000 &&
      Number(editedItems[0]?.amount) === EDIT_INVOICE.item.amount,
    `amount=${editedItems[0]?.amount?.toString()}`,
  );

  // ---------- IV9: nonexistent invoice → 404 ----------
  const resp404 = await page.goto(`${BASE}/invoices/999999999`, { waitUntil: "domcontentloaded" });
  record("IV9 nonexistent invoice returns 404", resp404?.status() === 404, `status=${resp404?.status()}`);

  // ---------- IV10: other user's invoice → 404 ----------
  const respIso = await page.goto(`${BASE}/invoices/${isoInvoice.id.toString()}`, { waitUntil: "domcontentloaded" });
  record("IV10 other user's invoice detail returns 404", respIso?.status() === 404, `status=${respIso?.status()}`);

  // ---------- IV11: other user's edit page → 404 ----------
  const respIsoEdit = await page.goto(`${BASE}/invoices/${isoInvoice.id.toString()}/edit`, { waitUntil: "domcontentloaded" });
  record("IV11 other user's invoice edit returns 404", respIsoEdit?.status() === 404, `status=${respIsoEdit?.status()}`);

  // ---------- IV12: delete blocked when invoice has payments ----------
  await page.goto(`${BASE}/invoices/${seedInvoiceId.toString()}`, { waitUntil: "domcontentloaded" });
  await page.locator('button', { hasText: "Hapus" }).click();
  await page.locator('button', { hasText: "Ya, Hapus" }).click();
  await waitForMessage(page, "alert", "pembayaran");
  const blockedErr = await readMessage(page, "alert");
  record(
    "IV12 delete blocked with payment warning",
    /masih memiliki.*pembayaran/s.test(blockedErr),
    `error=${blockedErr}`,
  );
  const seedStillExists = await prisma.invoice.findUnique({ where: { id: seedInvoiceId } }).catch(() => null);
  record("IV12b seed invoice still exists in DB", seedStillExists !== null);
  const seedPaymentCount = await prisma.payment.count({ where: { invoiceId: seedInvoiceId } });
  record("IV12c seed payment still exists", seedPaymentCount === SEED_INVOICE.paymentCount, `payments=${seedPaymentCount}`);

  // ---------- IV13: delete invoice without payments ----------
  await page.goto(`${BASE}/invoices/${newId}`, { waitUntil: "domcontentloaded" });
  await page.locator('button', { hasText: "Hapus" }).click();
  await page.locator('button', { hasText: "Ya, Hapus" }).click();
  await page.waitForURL("**/invoices", { timeout: 20000 }).catch(() => {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Invoice" }).waitFor({ timeout: 15000 });
  const afterDeleteText = await bodyText(page);
  record("IV13 deleted invoice removed from list", !afterDeleteText.includes(EDIT_INVOICE.number));
  const deletedRow = await prisma.invoice.findUnique({ where: { id: BigInt(newId) } }).catch(() => null);
  record("IV13a deleted invoice removed from DB", deletedRow === null);
  const orphanItems = await prisma.invoiceItem.count({ where: { invoiceId: BigInt(newId) } });
  record("IV13b deleted invoice items cascade-removed", orphanItems === 0, `items=${orphanItems}`);

  // ---------- IV14: seed data remains intact ----------
  const finalSeedInvoice = await prisma.invoice.findUnique({
    where: { id: BigInt(1) },
    include: { _count: { select: { items: true, payments: true } } },
  });
  const finalSeedProject = await prisma.project.findUnique({
    where: { id: BigInt(1) },
    select: { name: true, projectValue: true, status: true },
  });
  const finalSeedCustomer = await prisma.customer.findUnique({
    where: { id: BigInt(1) },
    select: { name: true },
  });
  const leftoverTestInvoices = await prisma.invoice.count({
    where: { userId: devUser.id, invoiceNumber: { startsWith: "INV-TEST" } },
  });
  record(
    "IV14 seed invoice data intact",
    finalSeedInvoice?.invoiceNumber === SEED_INVOICE.number &&
      Number(finalSeedInvoice?.taxRate) === SEED_INVOICE.taxRate &&
      Number(finalSeedInvoice?.subtotal) === SEED_INVOICE.subtotal &&
      Number(finalSeedInvoice?.taxAmount) === SEED_INVOICE.taxAmount &&
      Number(finalSeedInvoice?.total) === SEED_INVOICE.total &&
      finalSeedInvoice?.status === "PARTIALLY_PAID" &&
      finalSeedInvoice?._count.items === SEED_INVOICE.itemCount &&
      finalSeedInvoice?._count.payments === SEED_INVOICE.paymentCount,
    `items=${finalSeedInvoice?._count.items} payments=${finalSeedInvoice?._count.payments}`,
  );
  record(
    "IV14b seed project and customer intact",
    finalSeedProject?.name === "Demo Office Garden" &&
      Number(finalSeedProject?.projectValue) === 250000000 &&
      finalSeedProject?.status === "IN_PROGRESS" &&
      finalSeedCustomer?.name === "Demo Customer Co.",
    `project=${finalSeedProject?.name}`,
  );
  record("IV14c no leftover test invoices", leftoverTestInvoices === 0, `leftover=${leftoverTestInvoices}`);

  await context.close();
} catch (error) {
  console.error("HARNESS ERROR:", error instanceof Error ? error.message : error);
  failCount++;
} finally {
  // Clean up test fixtures even when a run crashes mid-way.
  await cleanupFixture();
  await prisma.$disconnect();
  await browser?.close();
}

console.log(`--- browser summary: ${passCount} passed, ${failCount} failed ---`);
process.exit(failCount === 0 ? 0 : 1);
