// Browser E2E for BillMate Project Expense Tracking.
// Reads credentials from env; never logs them.
// Creates isolated fixture data (2 test projects + 2 isolation users)
// directly via Prisma, then cleans up in `finally`. Never touches seed data.
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

// Seed expense (prisma/seed.ts): project 1 "Demo Office Garden",
// 18,500,000 Materials, 2026-10-03. Display-only in this suite.
const SEED_EXPENSE = {
  description: "Nursery plant delivery",
  amount: 18500000,
  date: new Date("2026-10-03T00:00:00.000Z"),
  category: "Materials",
  notesMarker: "Development seed data",
  projectName: "Demo Office Garden",
  customerName: "Demo Customer Co.",
};

const PROJ_A = {
  name: "EX-TEST Project",
  value: "40000000",
};
const PROJ_B = {
  name: "EX-TEST Project B",
  value: "30000000",
};

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
const isoAEmail = `exp-isolation-${Date.now()}@billmate-demo.test`;
const isoBEmail = `exp-empty-${Date.now()}@billmate-demo.test`;
let devUser = null;
let testProject = null;
let testProjectB = null;
let isoAUser = null;
let isoACustomer = null;
let isoAProject = null;
let isoAExpense = null;
let isoBUser = null;
let seedExpenseId = null;

async function cleanupFixture() {
  try {
    for (const proj of [testProject, testProjectB]) {
      if (!proj) continue;
      await prisma.expense.deleteMany({ where: { projectId: proj.id } }).catch(() => {});
      await prisma.invoice.deleteMany({ where: { projectId: proj.id } }).catch(() => {});
      await prisma.project.delete({ where: { id: proj.id } }).catch(() => {});
    }
    for (const isoUser of [isoAUser, isoBUser]) {
      if (!isoUser) continue;
      await prisma.expense.deleteMany({ where: { userId: isoUser.id } }).catch(() => {});
      await prisma.project.deleteMany({ where: { userId: isoUser.id } }).catch(() => {});
      await prisma.customer.deleteMany({ where: { userId: isoUser.id } }).catch(() => {});
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
    where: { userId: devUser.id, name: SEED_EXPENSE.customerName },
    select: { id: true },
  });
  if (!seedCustomer) {
    throw new Error("SETUP FAIL: seed customer not found");
  }
  const seedExpense = await prisma.expense.findUnique({
    where: { id: BigInt(1) },
    select: { id: true },
  });
  seedExpenseId = seedExpense?.id ?? null;
  if (!seedExpenseId) {
    throw new Error("SETUP FAIL: seed expense not found");
  }

  // Isolated test projects (under the seed customer, like other suites),
  // so seed project/invoice are never polluted by test rows.
  testProject = await prisma.project.create({
    data: {
      userId: devUser.id,
      customerId: seedCustomer.id,
      name: PROJ_A.name,
      projectValue: PROJ_A.value,
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      status: "IN_PROGRESS",
      notes: "Proyek uji Expense Tracking",
    },
  });
  testProjectB = await prisma.project.create({
    data: {
      userId: devUser.id,
      customerId: seedCustomer.id,
      name: PROJ_B.name,
      projectValue: PROJ_B.value,
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      endDate: new Date("2026-12-15T00:00:00.000Z"),
      status: "PLANNED",
      notes: "Proyek uji Expense Tracking B",
    },
  });

  // Isolation user A: HAS one expense — target for IDOR + hidden-from-dev-list.
  isoAUser = await prisma.user.create({
    data: {
      email: isoAEmail,
      fullName: "Exp Isolation User",
      passwordHash: await Bun.password.hash("exp-isolation-password"),
    },
  });
  isoACustomer = await prisma.customer.create({
    data: {
      userId: isoAUser.id,
      name: "Exp Isolation Customer",
      phone: "+62 812 7777 7777",
      email: "exp-iso@billmate-demo.test",
      address: "Jl. Rahasia No. 8, Jakarta 10000",
    },
  });
  isoAProject = await prisma.project.create({
    data: {
      userId: isoAUser.id,
      customerId: isoACustomer.id,
      name: "Exp Isolation Project",
      projectValue: "5000000",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-30T00:00:00.000Z"),
      status: "PLANNED",
    },
  });
  isoAExpense = await prisma.expense.create({
    data: {
      userId: isoAUser.id,
      projectId: isoAProject.id,
      description: "Biaya perawatan taman",
      amount: "350000.00",
      date: new Date("2026-09-12T00:00:00.000Z"),
      category: "Labor",
      notes: "EX-ISO marker — tidak boleh terlihat",
    },
  });

  // Isolation user B: NO data at all — empty-state + scoping proof.
  isoBUser = await prisma.user.create({
    data: {
      email: isoBEmail,
      fullName: "Exp Empty User",
      passwordHash: await Bun.password.hash("exp-empty-password"),
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

  // ---------- EX1..EX1d: auth guards on all expense routes ----------
  await page.goto(`${BASE}/expenses`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("EX1 /expenses redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("EX1b /expenses/new redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  await page.goto(`${BASE}/expenses/1`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("EX1c /expenses/[id] redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  await page.goto(`${BASE}/expenses/1/edit`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("EX1d /expenses/[id]/edit redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  // ---------- EX2: login ----------
  await uiLogin(page, EMAIL, PASSWORD);
  record("EX2 login navigates to /", page.url().replace(BASE, "").startsWith("/"), `final=${page.url()}`);

  // ---------- EX3: dashboard has Expense link ----------
  const expensesLink = page.locator('a[href="/expenses"]');
  record("EX3 dashboard shows 'Pengeluaran' link", (await expensesLink.count()) >= 1, `count=${await expensesLink.count()}`);

  // ---------- EX4: expense list ----------
  await expensesLink.first().click();
  await page.waitForURL("**/expenses", { timeout: 15000 }).catch(() => {});
  await page.locator("h1", { hasText: "Pengeluaran" }).waitFor({ timeout: 15000 });
  record("EX4 dashboard link navigates to /expenses", page.url().endsWith("/expenses"), `final=${page.url()}`);

  const listText = await bodyText(page);
  record("EX4a list shows seed expense description", listText.includes(SEED_EXPENSE.description));
  record("EX4b list shows seed category", listText.includes(SEED_EXPENSE.category));
  record("EX4c list shows formatted seed date", listText.includes(fmtDate(SEED_EXPENSE.date)), `want=${fmtDate(SEED_EXPENSE.date)}`);
  record("EX4d list shows formatted seed amount", listText.includes("18.500.000"), `found=${listText.includes("18.500.000")}`);
  record("EX4e list shows seed project via relation", listText.includes(SEED_EXPENSE.projectName));
  record("EX4f list shows customer via relation", listText.includes(SEED_EXPENSE.customerName));
  record("EX4g list hides other user's expense", !listText.includes("EX-ISO") && !listText.includes("Biaya perawatan taman"));
  record("EX4h list has 'Tambah Pengeluaran' action", listText.includes("Tambah Pengeluaran"));

  const newSaveBtn = page.locator('button[type="submit"]', { hasText: "Tambah Pengeluaran" });
  const fieldValue = (id) => page.locator(`#${id}`).inputValue();

  // ---------- EX5: server-side validation on create ----------
  // EX5a: empty form
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Proyek wajib dipilih.");
  const noProjErr = await readMessage(page, "alert");
  record("EX5a missing project rejected", /Proyek wajib dipilih/.test(noProjErr), `error=${noProjErr}`);

  // EX5b: project selected, empty description
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").selectOption({ label: PROJ_A.name });
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Deskripsi wajib diisi.");
  const noDescErr = await readMessage(page, "alert");
  record("EX5b empty description rejected", /Deskripsi wajib diisi/.test(noDescErr), `error=${noDescErr}`);

  // EX5c: description ok, empty amount
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").selectOption({ label: PROJ_A.name });
  await page.locator("#description").fill("Material uji");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Jumlah wajib diisi.");
  const emptyAmtErr = await readMessage(page, "alert");
  record("EX5c empty amount rejected", /Jumlah wajib diisi/.test(emptyAmtErr), `error=${emptyAmtErr}`);

  // EX5d: zero amount
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").selectOption({ label: PROJ_A.name });
  await page.locator("#description").fill("Material uji");
  await page.locator("#amount").fill("0");
  await page.locator("#date").fill("2026-11-12");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Jumlah harus lebih besar dari 0.");
  const zeroErr = await readMessage(page, "alert");
  record("EX5d zero amount rejected", /harus lebih besar dari 0/.test(zeroErr), `error=${zeroErr}`);

  // EX5e: negative amount (fails numeric format)
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").selectOption({ label: PROJ_A.name });
  await page.locator("#description").fill("Material uji");
  await page.locator("#amount").fill("-100");
  await page.locator("#date").fill("2026-11-12");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Jumlah tidak valid.");
  const negErr = await readMessage(page, "alert");
  record("EX5e negative amount rejected", /Jumlah tidak valid/.test(negErr), `error=${negErr}`);

  // EX5f: non-numeric amount
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").selectOption({ label: PROJ_A.name });
  await page.locator("#description").fill("Material uji");
  await page.locator("#amount").fill("bukan-angka");
  await page.locator("#date").fill("2026-11-12");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Jumlah tidak valid.");
  const nanErr = await readMessage(page, "alert");
  record("EX5f non-numeric amount rejected", /Jumlah tidak valid/.test(nanErr), `error=${nanErr}`);

  // EX5g: missing date
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").selectOption({ label: PROJ_A.name });
  await page.locator("#description").fill("Material uji");
  await page.locator("#amount").fill("150000");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Tanggal wajib diisi.");
  const dateErr = await readMessage(page, "alert");
  record("EX5g missing date rejected", /Tanggal wajib diisi/.test(dateErr), `error=${dateErr}`);

  // EX5h: invalid calendar date (2026-02-31 doesn't exist).
  // input type=date menyaring nilai tak valid di browser (jadi kosong),
  // jadi tipe input diubah ke text agar nilai mentah sampai ke server.
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").selectOption({ label: PROJ_A.name });
  await page.locator("#description").fill("Material uji");
  await page.locator("#amount").fill("150000");
  await page.locator("#date").evaluate((el) => {
    el.type = "text";
    el.value = "2026-02-31";
  });
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Tanggal tidak valid.");
  const badDateErr = await readMessage(page, "alert");
  record("EX5h invalid calendar date rejected", /Tanggal tidak valid/.test(badDateErr), `error=${badDateErr}`);

  // EX5i: category not in the fixed list (tampered select)
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").selectOption({ label: PROJ_A.name });
  await page.locator("#description").fill("Material uji");
  await page.locator("#amount").fill("150000");
  await page.locator("#date").fill("2026-11-12");
  await page.locator("#category").evaluate((el) => {
    const o = document.createElement("option");
    o.value = "Bogus";
    o.textContent = "Bogus";
    el.appendChild(o);
    el.value = "Bogus";
  });
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Kategori tidak valid.");
  const catErr = await readMessage(page, "alert");
  record("EX5i unknown category rejected", /Kategori tidak valid/.test(catErr), `error=${catErr}`);

  // EX5j: description over 500 chars
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").selectOption({ label: PROJ_A.name });
  await page.locator("#description").evaluate((el, v) => {
    el.value = v;
  }, "D".repeat(501));
  await page.locator("#amount").fill("150000");
  await page.locator("#date").fill("2026-11-12");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Deskripsi maksimal 500 karakter.");
  const descLenErr = await readMessage(page, "alert");
  record("EX5j overlong description rejected", /Deskripsi maksimal 500 karakter/.test(descLenErr), `error=${descLenErr}`);

  // EX5k: notes over 1000 chars
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").selectOption({ label: PROJ_A.name });
  await page.locator("#description").fill("Material uji");
  await page.locator("#amount").fill("150000");
  await page.locator("#date").fill("2026-11-12");
  await page.locator("#notes").evaluate((el, v) => {
    el.value = v;
  }, "N".repeat(1001));
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Catatan maksimal 1000 karakter.");
  const notesLenErr = await readMessage(page, "alert");
  record("EX5k overlong notes rejected", /Catatan maksimal 1000 karakter/.test(notesLenErr), `error=${notesLenErr}`);

  // EX5l: project belonging to another user (tampered select)
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").evaluate(
    (el, id) => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = "Foreign Project";
      el.appendChild(o);
      el.value = id;
    },
    isoAProject.id.toString(),
  );
  await page.locator("#description").fill("Material uji");
  await page.locator("#amount").fill("150000");
  await page.locator("#date").fill("2026-11-12");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Proyek tidak ditemukan.");
  const foreignProjErr = await readMessage(page, "alert");
  record("EX5l other user's project rejected", /Proyek tidak ditemukan/.test(foreignProjErr), `error=${foreignProjErr}`);

  // EX5m: nonexistent project id
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").evaluate((el) => {
    const o = document.createElement("option");
    o.value = "999999999";
    o.textContent = "Ghost Project";
    el.appendChild(o);
    el.value = "999999999";
  });
  await page.locator("#description").fill("Material uji");
  await page.locator("#amount").fill("150000");
  await page.locator("#date").fill("2026-11-12");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Proyek tidak ditemukan.");
  const ghostProjErr = await readMessage(page, "alert");
  record("EX5m nonexistent project rejected", /Proyek tidak ditemukan/.test(ghostProjErr), `error=${ghostProjErr}`);

  // ---------- EX6: valid create on EX-TEST Project ----------
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").selectOption({ label: PROJ_A.name });
  await page.locator("#description").fill("Bibit tanaman hias");
  await page.locator("#amount").fill("2500000");
  await page.locator("#date").fill("2026-11-10");
  await page.locator("#category").selectOption({ label: "Labor" });
  await page.locator("#notes").fill("Catatan uji expense");
  await newSaveBtn.click();
  await page.waitForURL(/\/expenses\/\d+$/, { timeout: 20000 }).catch(() => {});
  record("EX6 create redirects to expense detail", /\/expenses\/\d+$/.test(page.url()), `final=${page.url()}`);

  const exp1Id = page.url().split("/").pop() ?? "";
  const exp1 = exp1Id
    ? await prisma.expense.findUnique({ where: { id: BigInt(exp1Id) } }).catch(() => null)
    : null;
  record("EX6a created expense persisted in DB", exp1 !== null);
  record(
    "EX6b created expense stores header fields",
    exp1?.userId === devUser.id &&
      exp1?.projectId === testProject.id &&
      exp1?.description === "Bibit tanaman hias" &&
      Number(exp1?.amount) === 2500000 &&
      exp1?.date.toISOString().slice(0, 10) === "2026-11-10" &&
      exp1?.category === "Labor" &&
      exp1?.notes === "Catatan uji expense",
    `amount=${exp1?.amount?.toString()}`,
  );

  // Detail page: shows amount/date/category/notes + link back to project
  const detailText1 = await bodyText(page);
  record("EX6c detail shows formatted amount", detailText1.includes("2.500.000"), `found=${detailText1.includes("2.500.000")}`);
  record("EX6d detail shows expense date", detailText1.includes(fmtDate(new Date("2026-11-10T00:00:00.000Z"))));
  record("EX6e detail shows category and notes", detailText1.includes("Labor") && detailText1.includes("Catatan uji expense"));
  record(
    "EX6f detail links back to project",
    (await page.locator(`a[href="/projects/${testProject.id.toString()}"]`).count()) >= 1,
  );

  // ---------- EX7: create with empty optional notes ----------
  await page.goto(`${BASE}/expenses/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").selectOption({ label: PROJ_A.name });
  await page.locator("#description").fill("Ongkos kirim material");
  await page.locator("#amount").fill("500000");
  await page.locator("#date").fill("2026-11-11");
  await page.locator("#category").selectOption({ label: "Transport" });
  await newSaveBtn.click();
  await page.waitForURL(/\/expenses\/\d+$/, { timeout: 20000 }).catch(() => {});
  const exp2Id = page.url().split("/").pop() ?? "";
  const exp2 = exp2Id
    ? await prisma.expense.findUnique({ where: { id: BigInt(exp2Id) } }).catch(() => null)
    : null;
  record(
    "EX7 optional notes may be empty",
    exp2 !== null && exp2?.notes === null && exp2?.category === "Transport",
    `notes=${exp2?.notes}`,
  );

  // ---------- EX8: navigation project <-> expense ----------
  await page.goto(`${BASE}/projects/${testProject.id.toString()}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: PROJ_A.name }).waitFor({ timeout: 15000 });
  const recordExpenseLink = page.locator(`a[href="/expenses/new?project=${testProject.id.toString()}"]`);
  record("EX8 project detail has 'Catat Pengeluaran' link", (await recordExpenseLink.count()) >= 1, `count=${await recordExpenseLink.count()}`);
  await recordExpenseLink.first().click();
  await page.waitForURL(`**/expenses/new?project=${testProject.id.toString()}`, { timeout: 15000 }).catch(() => {});
  record("EX8b Catat Pengeluaran opens prefilled new expense page", (await fieldValue("projectId")) === testProject.id.toString(), `got=${await fieldValue("projectId")}`);

  await page.goto(`${BASE}/projects/${testProject.id.toString()}`, { waitUntil: "domcontentloaded" });
  const rowLink = page.locator(`a[href="/expenses/${exp1Id}"]`);
  record("EX8c project detail lists expense with detail link", (await rowLink.count()) >= 1, `count=${await rowLink.count()}`);
  await rowLink.first().click();
  await page.waitForURL(`**/expenses/${exp1Id}`, { timeout: 15000 }).catch(() => {});
  record("EX8d expense link navigates to expense detail", page.url().endsWith(`/expenses/${exp1Id}`), `final=${page.url()}`);
  const backToProject = page.locator(`a[href="/projects/${testProject.id.toString()}"]`);
  record("EX8e expense detail links back to project", (await backToProject.count()) >= 1);
  await backToProject.first().click();
  await page.waitForURL(`**/projects/${testProject.id.toString()}`, { timeout: 15000 }).catch(() => {});
  record("EX8f project link navigates to project detail", page.url().endsWith(`/projects/${testProject.id.toString()}`), `final=${page.url()}`);

  // ---------- EX9: edit expense (amount + project change) ----------
  await page.goto(`${BASE}/expenses/${exp1Id}/edit`, { waitUntil: "domcontentloaded" });
  const editSaveBtn = page.locator('button[type="submit"]', { hasText: "Simpan Perubahan" });
  record("EX9 edit prefills description", (await fieldValue("description")) === "Bibit tanaman hias", `got=${await fieldValue("description")}`);
  record("EX9b edit prefills amount", (await fieldValue("amount")) === "2500000", `got=${await fieldValue("amount")}`);
  record("EX9c edit prefills date", (await fieldValue("date")) === "2026-11-10", `got=${await fieldValue("date")}`);
  record("EX9d edit prefills category", (await fieldValue("category")) === "Labor", `got=${await fieldValue("category")}`);
  record("EX9e edit prefills notes", (await fieldValue("notes")) === "Catatan uji expense");

  await page.locator("#description").fill("Bibit tanaman hias (diperbarui)");
  await page.locator("#amount").fill("1750000");
  await editSaveBtn.click();
  await waitForMessage(page, "status", "Pengeluaran tersimpan.");
  const okMsg = await readMessage(page, "status");
  record("EX9f edit shows success message", /Pengeluaran tersimpan/.test(okMsg), `msg=${okMsg}`);

  await page.reload({ waitUntil: "domcontentloaded" });
  record("EX9g edited amount persists after reload", (await fieldValue("amount")) === "1750000", `got=${await fieldValue("amount")}`);
  const exp1AfterEdit = await prisma.expense.findUnique({ where: { id: BigInt(exp1Id) } });
  record(
    "EX9h edited fields persisted in DB",
    Number(exp1AfterEdit?.amount) === 1750000 && exp1AfterEdit?.description === "Bibit tanaman hias (diperbarui)",
    `amount=${exp1AfterEdit?.amount?.toString()}`,
  );

  // Move expense to another project (project is editable on expense, unlike invoice on payment).
  await page.locator("#projectId").selectOption({ label: PROJ_B.name });
  await editSaveBtn.click();
  await waitForMessage(page, "status", "Pengeluaran tersimpan.");
  const exp1Moved = await prisma.expense.findUnique({ where: { id: BigInt(exp1Id) } });
  record(
    "EX9i edit may move expense to another project",
    exp1Moved?.projectId === testProjectB.id,
    `projectId=${exp1Moved?.projectId?.toString()}`,
  );

  // ---------- EX10: IDOR — editing another user's expense rejected ----------
  await page.goto(`${BASE}/expenses/${exp2Id}/edit`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="expenseId"]').evaluate((el, v) => {
    el.value = v;
  }, isoAExpense.id.toString());
  await editSaveBtn.click();
  await waitForMessage(page, "alert", "Pengeluaran tidak ditemukan.");
  const idorEditErr = await readMessage(page, "alert");
  record("EX10 tampered edit expenseId rejected", /Pengeluaran tidak ditemukan/.test(idorEditErr), `error=${idorEditErr}`);
  const isoStill = await prisma.expense.findUnique({ where: { id: isoAExpense.id } });
  record("EX10b other user's expense unchanged in DB", Number(isoStill?.amount) === 350000, `amount=${isoStill?.amount?.toString()}`);

  // IDOR: tampering projectId on a legitimate edit must be rejected too.
  await page.goto(`${BASE}/expenses/${exp2Id}/edit`, { waitUntil: "domcontentloaded" });
  await page.locator("#projectId").evaluate(
    (el, id) => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = "Foreign Project";
      el.appendChild(o);
      el.value = id;
    },
    isoAProject.id.toString(),
  );
  await editSaveBtn.click();
  await waitForMessage(page, "alert", "Proyek tidak ditemukan.");
  const idorProjErr = await readMessage(page, "alert");
  record("EX10c tampered projectId rejected on edit", /Proyek tidak ditemukan/.test(idorProjErr), `error=${idorProjErr}`);
  const exp2AfterProjTamper = await prisma.expense.findUnique({ where: { id: BigInt(exp2Id) } });
  record("EX10d expense stays on own project after tampered edit", exp2AfterProjTamper?.projectId === testProject.id, `projectId=${exp2AfterProjTamper?.projectId?.toString()}`);

  // IDOR delete: klik "Hapus" dulu (render konfirmasi → re-render React),
  // baru tamper input hidden — agar reset nilai terkontrol React tidak
  // mengembalikan expenseId asli sebelum form disubmit.
  await page.goto(`${BASE}/expenses/${exp2Id}`, { waitUntil: "domcontentloaded" });
  await page.locator('button', { hasText: "Hapus" }).click();
  await page.locator('button', { hasText: "Ya, Hapus" }).waitFor({ timeout: 15000 });
  await page.locator('input[name="expenseId"]').evaluate((el, v) => {
    el.value = v;
  }, isoAExpense.id.toString());
  await page.locator('button', { hasText: "Ya, Hapus" }).click();
  await waitForMessage(page, "alert", "Pengeluaran tidak ditemukan.");
  const idorDelErr = await readMessage(page, "alert");
  record("EX10e tampered delete expenseId rejected", /Pengeluaran tidak ditemukan/.test(idorDelErr), `error=${idorDelErr}`);
  const isoAfterTamper = await prisma.expense.findUnique({ where: { id: isoAExpense.id } });
  const exp2AfterTamper = await prisma.expense.findUnique({ where: { id: BigInt(exp2Id) } });
  record("EX10f other user's expense still exists", isoAfterTamper !== null);
  record("EX10g own expense not deleted by tampered request", exp2AfterTamper !== null);

  // ---------- EX11: delete expense ----------
  await page.goto(`${BASE}/expenses/${exp2Id}`, { waitUntil: "domcontentloaded" });
  await page.locator('button', { hasText: "Hapus" }).click();
  await page.locator('button', { hasText: "Ya, Hapus" }).click();
  await page.waitForURL("**/expenses", { timeout: 20000 }).catch(() => {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Pengeluaran" }).waitFor({ timeout: 15000 });
  const afterDeleteList = await bodyText(page);
  record("EX11 deleted expense removed from list", !afterDeleteList.includes("Ongkos kirim material"));
  const exp2AfterDelete = await prisma.expense.findUnique({ where: { id: BigInt(exp2Id) } }).catch(() => null);
  record("EX11b deleted expense removed from DB", exp2AfterDelete === null);

  // Delete the remaining test expense (moved to project B earlier).
  await page.goto(`${BASE}/expenses/${exp1Id}`, { waitUntil: "domcontentloaded" });
  await page.locator('button', { hasText: "Hapus" }).click();
  await page.locator('button', { hasText: "Ya, Hapus" }).click();
  await page.waitForURL("**/expenses", { timeout: 20000 }).catch(() => {});
  const exp1AfterDelete = await prisma.expense.findUnique({ where: { id: BigInt(exp1Id) } }).catch(() => null);
  record("EX11c all test expenses deleted from DB", exp1AfterDelete === null);

  // Project detail shows empty expense state again after deletions.
  await page.goto(`${BASE}/projects/${testProject.id.toString()}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: PROJ_A.name }).waitFor({ timeout: 15000 });
  const projBody = await bodyText(page);
  record("EX11d project detail shows empty expense state again", projBody.includes("Belum ada pengeluaran"), `has=${projBody.includes("Belum ada pengeluaran")}`);

  // ---------- EX12: 404 for nonexistent / foreign expense ----------
  const resp404 = await page.goto(`${BASE}/expenses/999999999`, { waitUntil: "domcontentloaded" });
  record("EX12 nonexistent expense returns 404", resp404?.status() === 404, `status=${resp404?.status()}`);
  const respIso = await page.goto(`${BASE}/expenses/${isoAExpense.id.toString()}`, { waitUntil: "domcontentloaded" });
  record("EX12b other user's expense detail returns 404", respIso?.status() === 404, `status=${respIso?.status()}`);
  const respIsoEdit = await page.goto(`${BASE}/expenses/${isoAExpense.id.toString()}/edit`, { waitUntil: "domcontentloaded" });
  record("EX12c other user's expense edit returns 404", respIsoEdit?.status() === 404, `status=${respIsoEdit?.status()}`);

  // ---------- EX13: isolation user sees only (nothing) — empty state ----------
  // Halaman 404 tidak punya header — pindah dulu ke halaman ber-header.
  await page.goto(`${BASE}/expenses`, { waitUntil: "domcontentloaded" });
  await uiLogout(page);
  record("EX13 logout returns to /login", page.url().endsWith("/login"), `final=${page.url()}`);
  await uiLogin(page, isoBEmail, "exp-empty-password");
  await page.goto(`${BASE}/expenses`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Pengeluaran" }).waitFor({ timeout: 15000 });
  const isoBText = await bodyText(page);
  record("EX13b other user's list shows empty state", isoBText.includes("Belum ada pengeluaran"), `has=${isoBText.includes("Belum ada pengeluaran")}`);
  record(
    "EX13c other user's list hides dev's seed expense",
    !isoBText.includes(SEED_EXPENSE.description) && !isoBText.includes("18.500.000"),
  );
  await uiLogout(page);

  // ---------- EX14: DB integrity + seed untouched (before cleanup) ----------
  const devExpenses = await prisma.expense.count({ where: { userId: devUser.id } });
  record("EX14 dev has exactly the 1 seed expense left", devExpenses === 1, `count=${devExpenses}`);
  const seedExpenseFinal = await prisma.expense.findUnique({ where: { id: BigInt(1) } });
  record(
    "EX14b seed expense intact",
    seedExpenseFinal?.description === SEED_EXPENSE.description &&
      Number(seedExpenseFinal?.amount) === SEED_EXPENSE.amount &&
      seedExpenseFinal?.date.toISOString().slice(0, 10) === "2026-10-03" &&
      seedExpenseFinal?.category === SEED_EXPENSE.category &&
      seedExpenseFinal?.projectId === BigInt(1) &&
      seedExpenseFinal?.userId === devUser.id,
    `amount=${seedExpenseFinal?.amount?.toString()}`,
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
    "EX14c seed project and customer intact",
    seedProjectFinal?.name === SEED_EXPENSE.projectName &&
      Number(seedProjectFinal?.projectValue) === 250000000 &&
      seedProjectFinal?.status === "IN_PROGRESS" &&
      seedProjectFinal?._count.invoices === 1 &&
      seedProjectFinal?._count.expenses === 1 &&
      seedCustomerFinal?.name === SEED_EXPENSE.customerName &&
      // Fixture EX-TEST projects menempel sementara pada seed customer
      // (dihapus lagi di cleanup).
      seedCustomerFinal?._count.projects === (testProject && testProjectB ? 3 : 1),
    `project=${seedProjectFinal?.name} projects=${seedCustomerFinal?._count.projects}`,
  );

  const orphanExpenses = await prisma.$queryRawUnsafe(
    `SELECT count(*)::bigint AS c FROM expense e LEFT JOIN project p ON p.id = e.project_id WHERE p.id IS NULL`,
  );
  record("EX14d no orphan expenses", Number(orphanExpenses[0].c) === 0, `orphans=${Number(orphanExpenses[0].c)}`);
  const leftover = await prisma.expense.count({
    where: { projectId: { in: [testProject.id, testProjectB.id] } },
  });
  record("EX14e no leftover test expenses", leftover === 0, `leftover=${leftover}`);
  const isoExpenseFinal = await prisma.expense.findUnique({ where: { id: isoAExpense.id } });
  record("EX14f isolation user's expense untouched", isoExpenseFinal !== null && Number(isoExpenseFinal?.amount) === 350000);

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
