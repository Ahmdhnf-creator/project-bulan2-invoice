// Browser E2E for BillMate Project Management.
// Reads credentials from env; never logs them.
// Seeds a second user + customer + project directly via Prisma to verify
// per-user data isolation, then cleans up in `finally`.
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

// Seed project (from prisma/seed.ts) — has 1 invoice + 1 expense, so
// deletion must be blocked by related-record constraints.
const SEED_PROJECT = {
  name: "Demo Office Garden",
  customerName: "Demo Customer Co.",
  value: 250000000,
  startDate: "2026-10-01",
  endDate: "2026-11-15",
  statusLabel: "Berjalan",
};
// Values used to create, then edit, a project owned by the dev user.
const NEW_PROJECT = {
  name: "PM Test Project Alpha",
  value: "150000000",
  startDate: "2026-11-01",
  endDate: "2026-12-15",
  status: "COMPLETED",
  notes: "Catatan uji Project Management",
};
const EDIT_PROJECT = {
  name: "PM Test Project Alpha Edited",
  value: "175000000",
  startDate: "2026-11-05",
  endDate: "2026-12-20",
  status: "CANCELLED",
  notes: "Catatan ubah Project Management",
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

// --- Test fixture: second user + customer + project for isolation checks ---
const isoEmail = `pm-isolation-${Date.now()}@billmate-demo.test`;
let devUser = null;
let isoUser = null;
let isoCustomer = null;
let isoProject = null;
let seedProjectId = null;

async function cleanupFixture() {
  try {
    if (devUser) {
      await prisma.project.deleteMany({
        where: { userId: devUser.id, name: { startsWith: "PM Test" } },
      });
    }
    if (isoUser) {
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
  isoUser = await prisma.user.create({
    data: {
      email: isoEmail,
      fullName: "PM Isolation User",
      passwordHash: await Bun.password.hash("pm-isolation-password"),
    },
  });
  isoCustomer = await prisma.customer.create({
    data: {
      userId: isoUser.id,
      name: "PM Isolation Customer",
      phone: "+62 811 8888 8888",
      email: "pm-iso@billmate-demo.test",
      address: "Jl. Rahasia No. 2, Jakarta 10000",
    },
  });
  isoProject = await prisma.project.create({
    data: {
      userId: isoUser.id,
      customerId: isoCustomer.id,
      name: "PM Isolation Project",
      projectValue: "99000000",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-30T00:00:00.000Z"),
      status: "PLANNED",
      notes: "Proyek milik pengguna lain — tidak boleh terlihat",
    },
  });
  const seedProject = await prisma.project.findUnique({
    where: { id: BigInt(1) },
    select: { id: true },
  });
  seedProjectId = seedProject?.id ?? null;
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

  // ---------- PR1: /projects without session ----------
  await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("PR1 /projects redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  // ---------- PR1b: /projects/new without session ----------
  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("PR1b /projects/new redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  // ---------- PR2: login ----------
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 20000 }).catch(() => {});
  record("PR2 login navigates to /", page.url().replace(BASE, "").startsWith("/"), `final=${page.url()}`);

  // ---------- PR3: dashboard has Proyek link ----------
  const projectsLink = page.locator('a[href="/projects"]');
  record("PR3 dashboard shows 'Proyek' link", (await projectsLink.count()) >= 1, `count=${await projectsLink.count()}`);

  // ---------- PR4: project list ----------
  await projectsLink.first().click();
  await page.waitForURL("**/projects", { timeout: 15000 }).catch(() => {});
  // Wait for page content rather than networkidle: Next.js re-issues RSC
  // prefetches for dynamic routes, which keeps network activity alive.
  await page.locator("h1", { hasText: "Proyek" }).waitFor({ timeout: 15000 });
  record("PR4 dashboard link navigates to /projects", page.url().endsWith("/projects"), `final=${page.url()}`);

  const listText = await bodyText(page);
  record("PR4a list shows seed project name", listText.includes(SEED_PROJECT.name));
  record("PR4b list shows seed customer name", listText.includes(SEED_PROJECT.customerName));
  record("PR4c list shows seed status label", listText.includes(SEED_PROJECT.statusLabel));
  record("PR4d list shows formatted project value", listText.includes("250.000.000"), `valueFound=${listText.includes("250.000.000")}`);
  record("PR4e list hides other user's project", !listText.includes(isoProject.name));
  record("PR4f list has 'Tambah Proyek' action", listText.includes("Tambah Proyek"));

  // ---------- PR5: server-side validation on create ----------
  const newSaveBtn = page.locator('button[type="submit"]', { hasText: "Tambah Proyek" });
  const selectValue = (id) => page.locator(`#${id}`).inputValue();

  // PR5a: empty name
  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded" });
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Nama proyek wajib diisi.");
  const nameErr = await readMessage(page, "alert");
  record("PR5a empty project name rejected", /Nama proyek wajib diisi/.test(nameErr), `error=${nameErr}`);

  // PR5b: invalid numeric value
  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#name").fill(NEW_PROJECT.name);
  await page.locator("#customerId").selectOption({ label: SEED_PROJECT.customerName });
  await page.locator("#projectValue").fill("bukan-angka");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Nilai proyek tidak valid.");
  const valueErr = await readMessage(page, "alert");
  record("PR5b non-numeric project value rejected", /Nilai proyek tidak valid/.test(valueErr), `error=${valueErr}`);

  // PR5c: missing start date
  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#name").fill(NEW_PROJECT.name);
  await page.locator("#customerId").selectOption({ label: SEED_PROJECT.customerName });
  await page.locator("#projectValue").fill(NEW_PROJECT.value);
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Tanggal mulai wajib diisi.");
  const startErr = await readMessage(page, "alert");
  record("PR5c missing start date rejected", /Tanggal mulai wajib diisi/.test(startErr), `error=${startErr}`);

  // PR5d: end date before start date
  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#name").fill(NEW_PROJECT.name);
  await page.locator("#customerId").selectOption({ label: SEED_PROJECT.customerName });
  await page.locator("#projectValue").fill(NEW_PROJECT.value);
  await page.locator("#startDate").fill("2026-12-01");
  await page.locator("#endDate").fill("2026-11-01");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Tanggal selesai tidak boleh sebelum tanggal mulai.");
  const rangeErr = await readMessage(page, "alert");
  record("PR5d end date before start date rejected", /Tanggal selesai tidak boleh sebelum tanggal mulai/.test(rangeErr), `error=${rangeErr}`);

  // PR5e: invalid status value (tampered select)
  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#name").fill(NEW_PROJECT.name);
  await page.locator("#customerId").selectOption({ label: SEED_PROJECT.customerName });
  await page.locator("#projectValue").fill(NEW_PROJECT.value);
  await page.locator("#startDate").fill(NEW_PROJECT.startDate);
  await page.locator("#endDate").fill(NEW_PROJECT.endDate);
  await page.locator("#status").evaluate((el) => {
    const o = document.createElement("option");
    o.value = "HACKED";
    o.textContent = "HACKED";
    el.appendChild(o);
    el.value = "HACKED";
  });
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Status proyek tidak valid.");
  const statusErr = await readMessage(page, "alert");
  record("PR5e invalid status rejected", /Status proyek tidak valid/.test(statusErr), `error=${statusErr}`);

  // PR5f: customer belonging to another user (tampered select)
  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#name").fill(NEW_PROJECT.name);
  await page.locator("#customerId").evaluate(
    (el, id) => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = "Foreign Customer";
      el.appendChild(o);
      el.value = id;
    },
    isoCustomer.id.toString(),
  );
  await page.locator("#projectValue").fill(NEW_PROJECT.value);
  await page.locator("#startDate").fill(NEW_PROJECT.startDate);
  await page.locator("#endDate").fill(NEW_PROJECT.endDate);
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Pelanggan tidak ditemukan.");
  const foreignCustomerErr = await readMessage(page, "alert");
  record("PR5f other user's customer rejected", /Pelanggan tidak ditemukan/.test(foreignCustomerErr), `error=${foreignCustomerErr}`);

  // ---------- PR6: create — valid ----------
  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#name").fill(NEW_PROJECT.name);
  await page.locator("#customerId").selectOption({ label: SEED_PROJECT.customerName });
  await page.locator("#projectValue").fill(NEW_PROJECT.value);
  await page.locator("#startDate").fill(NEW_PROJECT.startDate);
  await page.locator("#endDate").fill(NEW_PROJECT.endDate);
  await page.locator("#status").selectOption(NEW_PROJECT.status);
  await page.locator("#notes").fill(NEW_PROJECT.notes);
  await newSaveBtn.click();
  await page.waitForURL(/\/projects\/\d+$/, { timeout: 20000 }).catch(() => {});
  // Wait for the detail page heading (project name) instead of networkidle.
  await page.locator("h1", { hasText: NEW_PROJECT.name }).waitFor({ timeout: 15000 });
  record("PR6 create redirects to new project detail", /\/projects\/\d+$/.test(page.url()), `final=${page.url()}`);

  const newId = page.url().split("/").pop() ?? "";
  const createdRow = newId
    ? await prisma.project.findUnique({ where: { id: BigInt(newId) } }).catch(() => null)
    : null;
  const seedCustomerRow = await prisma.customer.findFirst({
    where: { userId: devUser.id, name: SEED_PROJECT.customerName },
    select: { id: true },
  });
  record("PR6a created project persisted in DB", createdRow !== null);
  record("PR6b created project owned by session user", createdRow?.userId === devUser.id, `userId=${createdRow?.userId?.toString()}`);
  record("PR6c created project linked to chosen customer", createdRow?.customerId === seedCustomerRow?.id, `customerId=${createdRow?.customerId?.toString()}`);
  record(
    "PR6d created project stores submitted values",
    createdRow?.name === NEW_PROJECT.name &&
      Number(createdRow?.projectValue) === Number(NEW_PROJECT.value) &&
      createdRow?.startDate.toISOString().slice(0, 10) === NEW_PROJECT.startDate &&
      createdRow?.endDate?.toISOString().slice(0, 10) === NEW_PROJECT.endDate &&
      createdRow?.status === NEW_PROJECT.status &&
      createdRow?.notes === NEW_PROJECT.notes,
    `value=${createdRow?.projectValue?.toString()}`,
  );

  // ---------- PR7: detail page shows fields + customer info ----------
  const detailText = await bodyText(page);
  record("PR7a detail shows project name", detailText.includes(NEW_PROJECT.name));
  record("PR7b detail shows customer name", detailText.includes(SEED_PROJECT.customerName));
  record("PR7c detail shows formatted value", detailText.includes("150.000.000"));
  record("PR7d detail shows status label", detailText.includes("Selesai"));
  record("PR7e detail shows notes", detailText.includes(NEW_PROJECT.notes));
  record(
    "PR7f detail links to customer page",
    (await page.locator(`a[href="/customers/${seedCustomerRow?.id.toString()}"]`).count()) >= 1,
  );

  // Empty related records for the freshly created project.
  record("PR7g detail shows empty invoice state", detailText.includes("Belum ada invoice"));
  record("PR7h detail shows empty expense state", detailText.includes("Belum ada pengeluaran"));

  // ---------- PR7i: seed project detail shows related records ----------
  await page.goto(`${BASE}/projects/${seedProjectId.toString()}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: SEED_PROJECT.name }).waitFor({ timeout: 15000 });
  const seedDetailText = await bodyText(page);
  record("PR7i seed detail shows related invoice", seedDetailText.includes("INV-2026-0001"));
  record("PR7j seed detail shows related expense", seedDetailText.includes("Nursery plant delivery"));

  // ---------- PR8: edit form prefill + persistence ----------
  await page.goto(`${BASE}/projects/${newId}/edit`, { waitUntil: "domcontentloaded" });
  const editSaveBtn = page.locator('button[type="submit"]', { hasText: "Simpan Perubahan" });
  record("PR8a edit prefills name", (await selectValue("name")) === NEW_PROJECT.name, `got=${await selectValue("name")}`);
  record("PR8b edit prefills project value", Number(await selectValue("projectValue")) === Number(NEW_PROJECT.value), `got=${await selectValue("projectValue")}`);
  record("PR8c edit prefills start date", (await selectValue("startDate")) === NEW_PROJECT.startDate, `got=${await selectValue("startDate")}`);
  record("PR8d edit prefills end date", (await selectValue("endDate")) === NEW_PROJECT.endDate, `got=${await selectValue("endDate")}`);
  record("PR8e edit prefills status", (await selectValue("status")) === NEW_PROJECT.status, `got=${await selectValue("status")}`);
  record("PR8f edit prefills notes", (await selectValue("notes")) === NEW_PROJECT.notes);
  record(
    "PR8g edit prefills customer",
    (await page.locator("#customerId").locator("option:checked").textContent()) === SEED_PROJECT.customerName,
    `got=${await page.locator("#customerId").locator("option:checked").textContent()}`,
  );

  await page.locator("#name").fill(EDIT_PROJECT.name);
  await page.locator("#projectValue").fill(EDIT_PROJECT.value);
  await page.locator("#startDate").fill(EDIT_PROJECT.startDate);
  await page.locator("#endDate").fill(EDIT_PROJECT.endDate);
  await page.locator("#status").selectOption(EDIT_PROJECT.status);
  await page.locator("#notes").fill(EDIT_PROJECT.notes);
  await editSaveBtn.click();
  await waitForMessage(page, "status", "Proyek tersimpan.");
  const okMsg = await readMessage(page, "status");
  record("PR8h edit shows success message", /Proyek tersimpan/.test(okMsg), `msg=${okMsg}`);

  await page.reload({ waitUntil: "domcontentloaded" });
  record("PR8i edited name persists after reload", (await selectValue("name")) === EDIT_PROJECT.name, `got=${await selectValue("name")}`);
  record("PR8j edited status persists after reload", (await selectValue("status")) === EDIT_PROJECT.status);
  const editedRow = await prisma.project.findUnique({ where: { id: BigInt(newId) } }).catch(() => null);
  record(
    "PR8k edited values persisted in DB",
    editedRow?.name === EDIT_PROJECT.name &&
      Number(editedRow?.projectValue) === Number(EDIT_PROJECT.value) &&
      editedRow?.startDate.toISOString().slice(0, 10) === EDIT_PROJECT.startDate &&
      editedRow?.endDate?.toISOString().slice(0, 10) === EDIT_PROJECT.endDate &&
      editedRow?.status === EDIT_PROJECT.status &&
      editedRow?.notes === EDIT_PROJECT.notes,
    `name=${editedRow?.name}`,
  );

  // ---------- PR9: nonexistent project → 404 ----------
  const resp404 = await page.goto(`${BASE}/projects/999999999`, { waitUntil: "domcontentloaded" });
  record("PR9 nonexistent project returns 404", resp404?.status() === 404, `status=${resp404?.status()}`);

  // ---------- PR10: other user's project → 404 ----------
  const respIso = await page.goto(`${BASE}/projects/${isoProject.id.toString()}`, { waitUntil: "domcontentloaded" });
  record("PR10 other user's project detail returns 404", respIso?.status() === 404, `status=${respIso?.status()}`);

  // ---------- PR11: other user's edit page → 404 ----------
  const respIsoEdit = await page.goto(`${BASE}/projects/${isoProject.id.toString()}/edit`, { waitUntil: "domcontentloaded" });
  record("PR11 other user's project edit returns 404", respIsoEdit?.status() === 404, `status=${respIsoEdit?.status()}`);

  // ---------- PR12: delete blocked when project has related records ----------
  await page.goto(`${BASE}/projects/${seedProjectId.toString()}`, { waitUntil: "domcontentloaded" });
  await page.locator('button', { hasText: "Hapus" }).click();
  await page.locator('button', { hasText: "Ya, Hapus" }).click();
  await waitForMessage(page, "alert", "masih memiliki");
  const blockedErr = await readMessage(page, "alert");
  record(
    "PR12 delete blocked with related-record warning",
    /masih memiliki.*invoice.*pengeluaran/s.test(blockedErr),
    `error=${blockedErr}`,
  );
  const seedStillExists = await prisma.project.findUnique({ where: { id: seedProjectId } }).catch(() => null);
  record("PR12b seed project still exists in DB", seedStillExists !== null);
  const seedInvoiceCount = await prisma.invoice.count({ where: { projectId: seedProjectId } });
  const seedExpenseCount = await prisma.expense.count({ where: { projectId: seedProjectId } });
  record("PR12c seed related records still exist", seedInvoiceCount === 1 && seedExpenseCount === 1, `invoices=${seedInvoiceCount} expenses=${seedExpenseCount}`);

  // ---------- PR13: delete project without related records ----------
  await page.goto(`${BASE}/projects/${newId}`, { waitUntil: "domcontentloaded" });
  await page.locator('button', { hasText: "Hapus" }).click();
  await page.locator('button', { hasText: "Ya, Hapus" }).click();
  await page.waitForURL("**/projects", { timeout: 20000 }).catch(() => {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Proyek" }).waitFor({ timeout: 15000 });
  const afterDeleteText = await bodyText(page);
  record("PR13 deleted project removed from list", !afterDeleteText.includes(EDIT_PROJECT.name));
  const deletedRow = await prisma.project.findUnique({ where: { id: BigInt(newId) } }).catch(() => null);
  record("PR13a deleted project removed from DB", deletedRow === null);

  // ---------- PR14: seed data remains intact ----------
  const finalSeedProject = await prisma.project.findUnique({
    where: { id: BigInt(1) },
    include: { _count: { select: { invoices: true, expenses: true } } },
  });
  const finalSeedCustomer = await prisma.customer.findUnique({
    where: { id: BigInt(1) },
    include: { _count: { select: { projects: true } } },
  });
  const leftoverTestProjects = await prisma.project.count({
    where: { userId: devUser.id, name: { startsWith: "PM Test" } },
  });
  record(
    "PR14 seed project data intact",
    finalSeedProject?.name === SEED_PROJECT.name &&
      Number(finalSeedProject?.projectValue) === SEED_PROJECT.value &&
      finalSeedProject?.status === "IN_PROGRESS" &&
      finalSeedProject?.customerId === BigInt(1) &&
      finalSeedProject?._count.invoices === 1 &&
      finalSeedProject?._count.expenses === 1,
    `invoices=${finalSeedProject?._count.invoices} expenses=${finalSeedProject?._count.expenses}`,
  );
  record(
    "PR14b seed customer intact with 1 project",
    finalSeedCustomer?.name === SEED_PROJECT.customerName && finalSeedCustomer?._count.projects === 1,
    `projects=${finalSeedCustomer?._count.projects}`,
  );
  record("PR14c no leftover test projects", leftoverTestProjects === 0, `leftover=${leftoverTestProjects}`);

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
