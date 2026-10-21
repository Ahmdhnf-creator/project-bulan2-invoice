// Browser E2E for BillMate Customer Management.
// Reads credentials from env; never logs them.
// Seeds a second user + customer directly via Prisma to verify
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

// Seed customer (from prisma/seed.ts) — has 1 project, so deletion must be blocked.
const SEED_CUSTOMER = {
  name: "Demo Customer Co.",
  phone: "+62 812 0000 0000",
  email: "contact@demo-customer.test",
  address: "Jl. Contoh No. 2, Jakarta 10110",
};
// Values used to create, then edit, a customer owned by the dev user.
const NEW_CUSTOMER = {
  name: "CM Test Customer",
  phone: "+62 813 1111 1111",
  email: "cm-test@billmate-demo.test",
  address: "Jl. Uji No. 5, Jakarta 10510",
};
const EDIT_CUSTOMER = {
  name: "CM Test Customer Updated",
  phone: "+62 813 2222 2222",
  email: "cm-edited@billmate-demo.test",
  address: "Jl. Uji No. 99, Jakarta 12110",
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

// --- Test fixture: second user + customer for ownership-isolation checks ---
const isoEmail = `cm-isolation-${Date.now()}@billmate-demo.test`;
let devUser = null;
let isoUser = null;
let isoCustomer = null;

async function cleanupFixture() {
  try {
    if (devUser) {
      await prisma.customer.deleteMany({
        where: { userId: devUser.id, name: { startsWith: "CM Test" } },
      });
    }
    if (isoUser) {
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
      fullName: "CM Isolation User",
      passwordHash: await Bun.password.hash("cm-isolation-password"),
    },
  });
  isoCustomer = await prisma.customer.create({
    data: {
      userId: isoUser.id,
      name: "CM Isolation Customer",
      phone: "+62 811 9999 9999",
      email: "iso@billmate-demo.test",
      address: "Jl. Rahasia No. 1, Jakarta 10000",
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

  // ---------- CM1: /customers without session ----------
  await page.goto(`${BASE}/customers`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("CM1 /customers redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  // ---------- CM2: login ----------
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 20000 }).catch(() => {});
  record("CM2 login navigates to /", page.url().replace(BASE, "").startsWith("/"), `final=${page.url()}`);

  // ---------- CM3: dashboard has Pelanggan link ----------
  const customersLink = page.locator('a[href="/customers"]');
  record("CM3 dashboard shows 'Pelanggan' link", (await customersLink.count()) === 1);

  // ---------- CM4: customer list ----------
  await customersLink.click();
  await page.waitForURL("**/customers", { timeout: 15000 }).catch(() => {});
  // Wait for page content rather than networkidle: Next.js re-issues RSC
  // prefetches for dynamic routes, which keeps network activity alive.
  await page.locator("h1", { hasText: "Pelanggan" }).waitFor({ timeout: 15000 });
  record("CM4 dashboard link navigates to /customers", page.url().endsWith("/customers"), `final=${page.url()}`);

  const listText = (await page.locator("main, body").first().textContent().catch(() => "")) ?? "";
  record("CM4a list shows seed customer name", listText.includes(SEED_CUSTOMER.name));
  record("CM4b list shows seed customer phone", listText.includes(SEED_CUSTOMER.phone));
  record("CM4c list shows seed customer email", listText.includes(SEED_CUSTOMER.email));
  record("CM4d list hides other user's customer", !listText.includes(isoCustomer.name));
  record("CM4e list has 'Tambah Pelanggan' action", listText.includes("Tambah Pelanggan"));

  // ---------- CM5: create — empty name ----------
  await page.goto(`${BASE}/customers/new`, { waitUntil: "domcontentloaded" });
  const newSaveBtn = page.locator('button[type="submit"]', { hasText: "Tambah Pelanggan" });
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Nama pelanggan wajib diisi.");
  const emptyErr = await readMessage(page, "alert");
  record("CM5 empty name rejected", /Nama pelanggan wajib diisi/.test(emptyErr), `error=${emptyErr}`);
  await page.reload({ waitUntil: "domcontentloaded" });

  // ---------- CM6: create — invalid email ----------
  await page.locator("#name").fill(NEW_CUSTOMER.name);
  await page.locator("#email").fill("bukan-email");
  await newSaveBtn.click();
  await waitForMessage(page, "alert", "Format email tidak valid.");
  const emailErr = await readMessage(page, "alert");
  record("CM6 invalid email rejected", /Format email tidak valid/.test(emailErr), `error=${emailErr}`);
  await page.reload({ waitUntil: "domcontentloaded" });

  // ---------- CM7: create — valid ----------
  await page.locator("#name").fill(NEW_CUSTOMER.name);
  await page.locator("#phone").fill(NEW_CUSTOMER.phone);
  await page.locator("#email").fill(NEW_CUSTOMER.email);
  await page.locator("#address").fill(NEW_CUSTOMER.address);
  await newSaveBtn.click();
  await page.waitForURL(/\/customers\/\d+$/, { timeout: 20000 }).catch(() => {});
  // Wait for the detail page heading (customer name) instead of networkidle.
  await page
    .locator("h1", { hasText: NEW_CUSTOMER.name })
    .waitFor({ timeout: 15000 });
  record("CM7 create redirects to new customer detail", /\/customers\/\d+$/.test(page.url()), `final=${page.url()}`);

  const newId = page.url().split("/").pop() ?? "";
  const createdRow = newId ? await prisma.customer.findUnique({ where: { id: BigInt(newId) } }).catch(() => null) : null;
  record("CM7a created customer persisted in DB", createdRow !== null);
  record("CM7b created customer owned by session user", createdRow?.userId === devUser.id, `userId=${createdRow?.userId?.toString()}`);
  record("CM7c created customer stores submitted values", createdRow?.name === NEW_CUSTOMER.name && createdRow?.email === NEW_CUSTOMER.email);

  // ---------- CM8: detail page shows fields ----------
  const detailText = (await page.locator("main, body").first().textContent().catch(() => "")) ?? "";
  record("CM8a detail shows name", detailText.includes(NEW_CUSTOMER.name));
  record("CM8b detail shows phone", detailText.includes(NEW_CUSTOMER.phone));
  record("CM8c detail shows email", detailText.includes(NEW_CUSTOMER.email));
  record("CM8d detail shows address", detailText.includes(NEW_CUSTOMER.address));

  // ---------- CM9: edit ----------
  await page.goto(`${BASE}/customers/${newId}/edit`, { waitUntil: "domcontentloaded" });
  const editSaveBtn = page.locator('button[type="submit"]', { hasText: "Simpan Perubahan" });
  const editVal = (id) => page.locator(`#${id}`).inputValue();
  record("CM9a edit prefills name", (await editVal("name")) === NEW_CUSTOMER.name, `got=${await editVal("name")}`);
  record("CM9b edit prefills phone", (await editVal("phone")) === NEW_CUSTOMER.phone);
  record("CM9c edit prefills email", (await editVal("email")) === NEW_CUSTOMER.email);
  record("CM9d edit prefills address", (await editVal("address")) === NEW_CUSTOMER.address);

  await page.locator("#name").fill(EDIT_CUSTOMER.name);
  await page.locator("#phone").fill(EDIT_CUSTOMER.phone);
  await page.locator("#email").fill(EDIT_CUSTOMER.email);
  await page.locator("#address").fill(EDIT_CUSTOMER.address);
  await editSaveBtn.click();
  await waitForMessage(page, "status", "Pelanggan tersimpan.");
  const okMsg = await readMessage(page, "status");
  record("CM9e edit shows success message", /Pelanggan tersimpan/.test(okMsg), `msg=${okMsg}`);

  await page.reload({ waitUntil: "domcontentloaded" });
  record("CM9f edited name persists after reload", (await editVal("name")) === EDIT_CUSTOMER.name, `got=${await editVal("name")}`);
  record("CM9g edited email persists after reload", (await editVal("email")) === EDIT_CUSTOMER.email);
  const editedRow = await prisma.customer.findUnique({ where: { id: BigInt(newId) } }).catch(() => null);
  record("CM9h edited values persisted in DB", editedRow?.name === EDIT_CUSTOMER.name && editedRow?.phone === EDIT_CUSTOMER.phone);

  // ---------- CM10: nonexistent customer → 404 ----------
  const resp404 = await page.goto(`${BASE}/customers/999999999`, { waitUntil: "domcontentloaded" });
  record("CM10 nonexistent customer returns 404", resp404?.status() === 404, `status=${resp404?.status()}`);

  // ---------- CM11: other user's customer → 404 ----------
  const respIso = await page.goto(`${BASE}/customers/${isoCustomer.id.toString()}`, { waitUntil: "domcontentloaded" });
  record("CM11 other user's customer detail returns 404", respIso?.status() === 404, `status=${respIso?.status()}`);

  // ---------- CM12: other user's edit page → 404 ----------
  const respIsoEdit = await page.goto(`${BASE}/customers/${isoCustomer.id.toString()}/edit`, { waitUntil: "domcontentloaded" });
  record("CM12 other user's customer edit returns 404", respIsoEdit?.status() === 404, `status=${respIsoEdit?.status()}`);

  // ---------- CM13: delete blocked when customer has projects ----------
  const seedRow = await prisma.customer.findFirst({
    where: { userId: devUser.id, name: SEED_CUSTOMER.name },
    select: { id: true },
  });
  if (!seedRow) {
    record("CM13 seed customer exists", false, "seed customer not found");
  } else {
    await page.goto(`${BASE}/customers/${seedRow.id.toString()}`, { waitUntil: "domcontentloaded" });
    await page.locator('button', { hasText: "Hapus" }).click();
    await page.locator('button', { hasText: "Ya, Hapus" }).click();
    await waitForMessage(page, "alert", "masih memiliki");
    const blockedErr = await readMessage(page, "alert");
    record("CM13 delete blocked with project warning", /masih memiliki.*proyek/s.test(blockedErr), `error=${blockedErr}`);
    const stillExists = await prisma.customer.findUnique({ where: { id: seedRow.id } }).catch(() => null);
    record("CM13b customer with projects still exists in DB", stillExists !== null);
  }

  // ---------- CM14: delete customer without projects ----------
  await page.goto(`${BASE}/customers/${newId}`, { waitUntil: "domcontentloaded" });
  await page.locator('button', { hasText: "Hapus" }).click();
  await page.locator('button', { hasText: "Ya, Hapus" }).click();
  await page.waitForURL("**/customers", { timeout: 20000 }).catch(() => {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("h1", { hasText: "Pelanggan" }).waitFor({ timeout: 15000 });
  const afterDeleteText = (await page.locator("main, body").first().textContent().catch(() => "")) ?? "";
  record("CM14 deleted customer removed from list", !afterDeleteText.includes(EDIT_CUSTOMER.name));
  const deletedRow = await prisma.customer.findUnique({ where: { id: BigInt(newId) } }).catch(() => null);
  record("CM14a deleted customer removed from DB", deletedRow === null);

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
