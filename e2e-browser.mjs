// Browser E2E for BillMate auth + dashboard + logout button.
// Reads credentials from env; never logs them.
import { chromium } from "playwright";

const BASE = process.env.BILLMATE_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.BILLMATE_EMAIL;
const PASSWORD = process.env.BILLMATE_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("SETUP FAIL: BILLMATE_EMAIL and BILLMATE_PASSWORD env vars required");
  process.exit(2);
}

let passCount = 0;
let failCount = 0;
function record(name, ok, detail = "") {
  if (ok) passCount++;
  else failCount++;
  console.log(`${ok ? "PASS" : "FAIL"} [browser] ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
try {
  // ---------- B1: clean session ----------
  const context = await browser.newContext(); // fresh: no cookies
  const page = await context.newPage();

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 });
  record("B1a / redirects to /login without session", page.url().endsWith("/login"), `final=${page.url()}`);

  const emailField = page.locator("#email");
  const passwordField = page.locator("#password");
  const submitBtn = page.locator('button[type="submit"]');
  record(
    "B1b /login shows sign-in form",
    (await emailField.count()) === 1 && (await passwordField.count()) === 1 && (await submitBtn.count()) === 1
  );

  // ---------- B2: login with dev credentials ----------
  await emailField.fill(EMAIL);
  await passwordField.fill(PASSWORD);
  await submitBtn.click();
  await page.waitForURL("**/", { timeout: 20000 }).catch(() => {});
  const afterLoginUrl = page.url();
  record("B2 login navigates to /", afterLoginUrl.replace(BASE, "") === "/" || afterLoginUrl.replace(BASE, "").startsWith("/?"), `final=${afterLoginUrl}`);

  // ---------- B3: dashboard + seed data + Logout button ----------
  await page.goto(`${BASE}/?period=2026-10`, { waitUntil: "domcontentloaded" });
  const bodyText = await page.textContent("body");
  const has = (re) => re.test(bodyText ?? "");
  record("B3a dashboard shows business name", has(/Billmate Demo Studio/));
  record("B3b dashboard shows greeting", has(/Halo,\s*Dev User/));
  record("B3c dashboard shows project name", has(/Demo Office Garden/));
  record("B3d dashboard shows customer", has(/Demo Customer Co\./));
  record("B3e dashboard shows status badge", has(/Berjalan/));
  record("B3f dashboard shows project value (IDR, NBSP)", has(/Rp\u00A0250\.000\.000/));
  record("B3g dashboard shows invoice total (IDR, NBSP)", has(/Rp\u00A0166\.500\.000/));
  record("B3h dashboard shows expense total (IDR, NBSP)", has(/Rp\u00A018\.500\.000/));
  record("B3i dashboard shows project dates", has(/1 Okt 2026/) && has(/15 Nov 2026/));
  const logoutBtn = page.locator('button[type="submit"]', { hasText: "Logout" });
  record("B3j logged-in user sees Logout button", (await logoutBtn.count()) === 1);

  // ---------- B4: refresh dashboard ----------
  await page.reload({ waitUntil: "domcontentloaded" });
  const afterReloadUrl = page.url();
  const reloadText = await page.textContent("body");
  record(
    "B4 refresh keeps session + dashboard data",
    (afterReloadUrl.replace(BASE, "") === "/" || afterReloadUrl.replace(BASE, "").startsWith("/?")) &&
      /Demo Office Garden/.test(reloadText ?? "") &&
      /Billmate Demo Studio/.test(reloadText ?? "")
  );

  // ---------- B5: new tab, open / ----------
  const page2 = await context.newPage();
  await page2.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page2.waitForURL("**/", { timeout: 15000 }).catch(() => {});
  const tab2Text = await page2.textContent("body");
  record(
    "B5 new tab / shows dashboard (shared session)",
    page2.url().replace(BASE, "").startsWith("/") && /Demo Office Garden/.test(tab2Text ?? ""),
    `final=${page2.url()}`
  );
  await page2.close();

  // ---------- B6: click the Logout button in the dashboard UI ----------
  await logoutBtn.click();
  await page.waitForURL("**/login", { timeout: 20000 }).catch(() => {});
  record("B6a clicking Logout redirects to /login", page.url().endsWith("/login"), `final=${page.url()}`);
  const sessionAfter = await page.evaluate(async () => {
    const res = await fetch("/api/auth/session");
    return res.json();
  });
  record("B6b logout clears session", sessionAfter === null || (sessionAfter && !sessionAfter.user), `session=${sessionAfter === null ? "null" : "present"}`);

  // ---------- B7: / redirects to /login after logout ----------
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 15000 }).catch(() => {});
  record("B7 / redirects to /login after logout", page.url().endsWith("/login"), `final=${page.url()}`);

  // ---------- B8: Back navigation after logout ----------
  // History now: /login (initial) -> / (dashboard) -> /login (logout) -> / (redirected to /login).
  // Press Back to revisit the dashboard URL; the server must send us back to /login.
  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  const backUrl = page.url();
  const backText = await page.textContent("body").catch(() => "");
  const backAtLogin = backUrl.endsWith("/login") || /Sign in to BillMate/.test(backText ?? "");
  const backHasPrivateData = /Demo Office Garden/.test(backText ?? "");
  record(
    "B8 back navigation does not grant live private access",
    backAtLogin || !backHasPrivateData,
    `final=${backUrl} privateData=${backHasPrivateData}`
  );

  // ---------- B9: callback / error paths ----------
  const cbResp = await context.request.get(`${BASE}/api/auth/callback/credentials`);
  record(
    "B9a GET /api/auth/callback/credentials does not authenticate",
    cbResp.status() !== 200 || !/dashboard|Demo Office Garden/.test((await cbResp.text()).catch(() => "") ?? ""),
    `status=${cbResp.status()}`
  );
  const errResp = await context.request.get(`${BASE}/api/auth/error`);
  record("B9b /api/auth/error reachable without session", errResp.status() === 200 || errResp.status() === 302, `status=${errResp.status()}`);
  const anonSession = await context.request.get(`${BASE}/api/auth/session`).then((r) => r.json()).catch(() => "err");
  record("B9c /api/auth/session is null without cookies", anonSession === null, `value=${anonSession === null ? "null" : "non-null"}`);

  // ---------- B10: re-login after logout still works ----------
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/", { timeout: 20000 }).catch(() => {});
  const reloginText = await page.textContent("body");
  record(
    "B10 re-login after logout works",
    page.url().replace(BASE, "").startsWith("/") && /Demo Office Garden/.test(reloginText ?? ""),
    `final=${page.url()}`
  );

  await context.close();
} catch (error) {
  console.error("HARNESS ERROR:", error instanceof Error ? error.message : error);
  failCount++;
} finally {
  await browser.close();
}

console.log(`--- browser summary: ${passCount} passed, ${failCount} failed ---`);
process.exit(failCount === 0 ? 0 : 1);
