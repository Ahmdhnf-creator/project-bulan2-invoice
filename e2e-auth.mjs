// E2E for self-service registration + auth hardening.
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

let passCount = 0;
let failCount = 0;
function record(name, ok, detail = "") {
  if (ok) passCount++;
  else failCount++;
  console.log(`${ok ? "PASS" : "FAIL"} [auth] ${name}${detail ? ` — ${detail}` : ""}`);
}

const stamp = Date.now();
const regEmail = `auth-${stamp}@billmate-test.test`;
const regPassword = "Register-Pass-123";
const lockEmail = `lock-${stamp}@billmate-test.test`;
const lockPassword = "Lockout-Pass-123";

async function gotoLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").waitFor({ timeout: 15000 });
}

async function bodyText(page) {
  return (await page.locator("main, body").first().textContent().catch(() => "")) ?? "";
}

async function attemptWrong(page, email, password) {
  await gotoLogin(page);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.locator("form p").first().waitFor({ state: "visible", timeout: 20000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  return (await page.locator("form p").first().textContent().catch(() => "")) ?? "";
}

let browser = null;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // ---------- R1: /register tampil + cross-links ----------
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.locator("#fullName").waitFor({ timeout: 15000 });
  record(
    "R1 /register menampilkan form daftar",
    (await page.locator("#fullName").count()) === 1 && (await page.locator("#confirmPassword").count()) === 1,
    `url=${page.url()}`,
  );
  record("R1b register punya link ke /login", (await page.locator('a[href="/login"]').count()) >= 1);
  await gotoLogin(page);
  record("R1c login punya link ke /register", (await page.locator('a[href="/register"]').count()) >= 1);

  // ---------- R2: validasi ----------
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.locator("#fullName").waitFor({ timeout: 15000 });
  await page.locator("#fullName").fill("Auth Tester");
  await page.locator("#email").fill(regEmail);
  await page.locator("#password").fill("short");
  await page.locator("#confirmPassword").fill("short");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(400);
  record("R2a password <8 diblokir client (tetap /register)", page.url().includes("/register"), `url=${page.url()}`);

  await page.evaluate(() => document.querySelector("#password").removeAttribute("minlength"));
  await page.locator('button[type="submit"]').click();
  await page.locator("form p", { hasText: "Password minimal 8 karakter." }).waitFor({ timeout: 20000 });
  record("R2b server tetap tolak password <8", (await bodyText(page)).includes("Password minimal 8 karakter."));

  await page.locator("#password").fill(regPassword);
  await page.locator("#confirmPassword").fill("Berbeda-Lagi-123");
  await page.locator('button[type="submit"]').click();
  await page.locator("form p", { hasText: "Konfirmasi password tidak sama." }).waitFor({ timeout: 20000 });
  record("R2c konfirmasi tidak sama ditolak", (await bodyText(page)).includes("Konfirmasi password tidak sama."));

  // ---------- R3: happy path → auto-login ----------
  await page.locator("#password").fill(regPassword);
  await page.locator("#confirmPassword").fill(regPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 20000 });
  record(
    "R3 register → auto-login dashboard",
    page.url().replace(BASE, "") === "/" && (await page.locator("aside").count()) >= 1,
    `url=${page.url()}`,
  );

  // ---------- R4: /register saat login → redirect / ----------
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/", { timeout: 15000 }).catch(() => {});
  record("R4 /register authed dialihkan ke /", page.url().replace(BASE, "") === "/", `url=${page.url()}`);

  // ---------- R5: logout → login email HURUF BESAR (normalisasi) ----------
  await page.locator('aside button[type="submit"]').click();
  await page.waitForURL("**/login", { timeout: 20000 });
  await page.locator("#email").fill(regEmail.toUpperCase());
  await page.locator("#password").fill(regPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 20000 });
  record("R5 login email huruf besar tetap cocok", page.url().replace(BASE, "") === "/", `url=${page.url()}`);

  // ---------- R6: password salah → pesan lokal ----------
  await page.locator('aside button[type="submit"]').click();
  await page.waitForURL("**/login", { timeout: 20000 });
  const invalidMsg = await attemptWrong(page, regEmail, "wrong-password-x");
  record("R6 pesan kredensial salah (lokal)", invalidMsg.includes("Email atau password salah."), `msg=${invalidMsg}`);

  // ---------- R7: email duplikat ----------
  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
  await page.locator("#fullName").waitFor({ timeout: 15000 });
  await page.locator("#fullName").fill("Auth Tester");
  await page.locator("#email").fill(regEmail);
  await page.locator("#password").fill(regPassword);
  await page.locator("#confirmPassword").fill(regPassword);
  await page.locator('button[type="submit"]').click();
  await page.locator("form p", { hasText: "Email sudah terdaftar." }).waitFor({ timeout: 20000 });
  record("R7 email duplikat ditolak", (await bodyText(page)).includes("Email sudah terdaftar."));

  // ---------- R8: lockout brute-force ----------
  const lockUser = await prisma.user.create({
    data: {
      email: lockEmail,
      fullName: "Lockout Tester",
      passwordHash: await Bun.password.hash(lockPassword),
    },
  });

  let wrongOk = true;
  for (let i = 0; i < 10; i++) {
    const msg = await attemptWrong(page, lockEmail, "wrong-password-x");
    if (!msg.includes("Email atau password salah.")) wrongOk = false;
  }
  record("R8a 10x login salah tetap ditolak sebagai kredensial salah", wrongOk);

  const lockMsg = await attemptWrong(page, lockEmail, lockPassword); // password BENAR
  record(
    "R8b percobaan ke-11 (password benar) → pesan terkunci",
    lockMsg.includes("Terlalu banyak percobaan"),
    `msg=${lockMsg}`,
  );

  await prisma.user.update({
    where: { id: lockUser.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });
  await gotoLogin(page);
  await page.locator("#email").fill(lockEmail);
  await page.locator("#password").fill(lockPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 20000 });
  record("R8c setelah lock dibuka, login normal kembali", page.url().replace(BASE, "") === "/");

  const after = await prisma.user.findUnique({ where: { id: lockUser.id } });
  record(
    "R8d login sukses mereset counter & lock",
    after?.failedAttempts === 0 && after?.lockedUntil === null,
    `attempts=${after?.failedAttempts}`,
  );

  await context.close();
} catch (error) {
  console.error("HARNESS ERROR:", error instanceof Error ? error.message : error);
  failCount++;
} finally {
  await prisma.user.deleteMany({ where: { email: { in: [regEmail, lockEmail] } } });
  await prisma.$disconnect();
  await browser?.close();
}

console.log(`--- auth summary: ${passCount} passed, ${failCount} failed ---`);
process.exit(failCount === 0 ? 0 : 1);
