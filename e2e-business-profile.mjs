// Browser E2E for BillMate Business Profile.
// Reads credentials from env; never logs them.
import { chromium } from "playwright";

const BASE = process.env.BILLMATE_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.BILLMATE_EMAIL;
const PASSWORD = process.env.BILLMATE_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("SETUP FAIL: BILLMATE_EMAIL and BILLMATE_PASSWORD env vars required");
  process.exit(2);
}

// Seed values (from prisma/seed.ts) used to verify display and to restore state.
const SEED = {
  businessName: "Billmate Demo Studio",
  address: "Jl. Contoh No. 1, Jakarta 10110",
  phone: "+62 21 0000 0000",
  email: "studio@billmate-demo.test",
  taxId: "000000000000000",
};
// Temporary edit values used to prove update + persistence.
const EDIT = {
  businessName: "Billmate Edit Test",
  address: "Jl. Edit No. 99, Jakarta 12110",
  phone: "+62 21 8888 8888",
  email: "edit@billmate-demo.test",
  taxId: "123456789012345",
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

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();

  // ---------- BP1: /business-profile without session ----------
  await page.goto(`${BASE}/business-profile`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("BP1 /business-profile redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  // ---------- BP2: login ----------
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 20000 }).catch(() => {});
  record("BP2 login navigates to /", page.url().replace(BASE, "").startsWith("/"), `final=${page.url()}`);

  // ---------- BP3: dashboard has Profil Bisnis link ----------
  const profileLink = page.locator('a[href="/business-profile"]');
  record("BP3 dashboard shows 'Profil Bisnis' link", (await profileLink.count()) === 1);

  // ---------- BP4: navigate to /business-profile ----------
  await profileLink.click();
  await page.waitForURL("**/business-profile", { timeout: 15000 }).catch(() => {});
  record("BP4 dashboard link navigates to /business-profile", page.url().endsWith("/business-profile"), `final=${page.url()}`);

  // ---------- BP5: form displays existing seed profile ----------
  const val = async (id) => page.locator(`#${id}`).inputValue();
  // The business-profile page has two submit buttons (Logout + Simpan);
  // target the form's save button explicitly.
  const saveBtn = page.locator('button[type="submit"]', { hasText: "Simpan" });
  record("BP5a businessName shows seed value", (await val("businessName")) === SEED.businessName, `got=${await val("businessName")}`);
  record("BP5b address shows seed value", (await val("address")) === SEED.address);
  record("BP5c phone shows seed value", (await val("phone")) === SEED.phone);
  record("BP5d email shows seed value", (await val("email")) === SEED.email);
  record("BP5e taxId shows seed value", (await val("taxId")) === SEED.taxId);

  // ---------- BP6: validation — empty businessName ----------
  await page.locator("#businessName").fill("");
  await saveBtn.click();
  await waitForMessage(page, "alert", "Nama bisnis wajib diisi.");
  const emptyErr = await readMessage(page, "alert");
  record("BP6 empty businessName rejected", /Nama bisnis wajib diisi/.test(emptyErr), `error=${emptyErr}`);
  // Stabilize: reload so the next submission starts from a clean, settled form.
  await page.reload({ waitUntil: "domcontentloaded" });

  // ---------- BP7: validation — invalid email ----------
  await page.locator("#email").fill("not-an-email");
  await saveBtn.click();
  await waitForMessage(page, "alert", "Format email tidak valid.");
  const emailErr = await readMessage(page, "alert");
  record("BP7 invalid email rejected", /Format email tidak valid/.test(emailErr), `error=${emailErr}`);
  await page.reload({ waitUntil: "domcontentloaded" });

  // ---------- BP8: successful edit + save ----------
  await page.locator("#businessName").fill(EDIT.businessName);
  await page.locator("#address").fill(EDIT.address);
  await page.locator("#phone").fill(EDIT.phone);
  await page.locator("#email").fill(EDIT.email);
  await page.locator("#taxId").fill(EDIT.taxId);
  await saveBtn.click();
  await waitForMessage(page, "status", "Profil bisnis tersimpan.");
  const okMsg = await readMessage(page, "status");
  record("BP8 save shows success message", /Profil bisnis tersimpan/.test(okMsg), `msg=${okMsg}`);

  // ---------- BP9: persisted after reload ----------
  await page.reload({ waitUntil: "domcontentloaded" });
  record("BP9a businessName persisted", (await val("businessName")) === EDIT.businessName, `got=${await val("businessName")}`);
  record("BP9b address persisted", (await val("address")) === EDIT.address);
  record("BP9c phone persisted", (await val("phone")) === EDIT.phone);
  record("BP9d email persisted", (await val("email")) === EDIT.email);
  record("BP9e taxId persisted", (await val("taxId")) === EDIT.taxId);

  // ---------- BP10: restore seed data ----------
  await page.locator("#businessName").fill(SEED.businessName);
  await page.locator("#address").fill(SEED.address);
  await page.locator("#phone").fill(SEED.phone);
  await page.locator("#email").fill(SEED.email);
  await page.locator("#taxId").fill(SEED.taxId);
  await saveBtn.click();
  await waitForMessage(page, "status", "Profil bisnis tersimpan.");
  await page.reload({ waitUntil: "domcontentloaded" });
  record("BP10 restore seed data saved", (await val("businessName")) === SEED.businessName, `got=${await val("businessName")}`);

  await context.close();
} catch (error) {
  console.error("HARNESS ERROR:", error instanceof Error ? error.message : error);
  failCount++;
} finally {
  await browser.close();
}

console.log(`--- browser summary: ${passCount} passed, ${failCount} failed ---`);
process.exit(failCount === 0 ? 0 : 1);
