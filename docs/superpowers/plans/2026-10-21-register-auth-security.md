# Registrasi Self-Service + Keamanan Akun — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Halaman daftar mandiri `/register` untuk pembeli produk, plus pengamanan akun (kunci brute-force, normalisasi email, reset password manual) dan perbaikan konsistensi tema `dark:`.

**Architecture:** Mengikuti pola auth yang sudah ada — halaman client + server action `useActionState` di `app/actions/auth.ts`, guard `proxy.ts`, dan JWT NextAuth yang ada tanpa mengubah sesi. Lockout disimpan di kolom baru tabel `user` (tanpa infra tambahan); reset password via script lokal yang dijalankan seller dengan `DATABASE_URL` production (tanpa SMTP).

**Tech Stack:** Next.js 16 (App Router, proxy.ts) · next-auth 5 beta · Prisma 7 + PostgreSQL · argon2 (`@node-rs/argon2` + `Bun.password.hash`) · Playwright e2e · Tailwind 4.

**Spec:** Desain bounded yang disetujui via chat 2026-10-21 (ringkasan "Approved Design" di bawah — brainstorming path = bounded, tanpa spec file terpisah).

**Approved Design (ringkas):**
1. `/register` meniru pola `login/page.tsx`: nama, email, password (min 8, `minLength` hanya di field password), konfirmasi → auto-login → `/`. Tanpa verifikasi email.
2. Lockout: **10 gagal → kunci 15 menit**; sukses → reset counter; pre-check lock sebelum argon2.
3. `db:reset-password <email> <pw>` script untuk seller; README: production **tidak seed**.
4. `@custom-variant dark` → ikut `[data-theme]` (perbaikan inkonsistensi dari keputusan "default terang").
5. Luar cakupan: email verifikasi/reset, invite code, rate-limit per-IP, kompleksitas password selain panjang 8.

## Global Constraints

- Bahasa: pesan error auth baru **Indonesia**; heading login lama `Sign in to BillMate` **tidak diubah** (diasersi `e2e-browser` B8/B10 — regex `/Sign in to BillMate/`).
- Baseline saat ini: lint **0 errors / 6 warnings**, tsc **0**, build **0**, e2e **456/456 (10 suite)**. Target akhir: 11 suite semua hijau (perkiraan **472 assertion** — angka final dibaca dari output summary).
- Server hanya jalur production: kill via scan `/proc/*/cmdline` (skip `$$`, **jangan pkill**), `bun run build`, `AUTH_URL=http://localhost:3000 setsid nohup bun run start > /tmp/opencode/prod-server.log 2>&1 < /dev/null & disown`, poll `/login` 200 (40×2s).
- Playwright: `export LD_LIBRARY_PATH=/tmp/opencode/pwlibs/usr/lib/x86_64-linux-gnu BILLMATE_EMAIL='dev@billmate.test' BILLMATE_PASSWORD='billmate-dev-password'` (creds env-only di command, **tidak pernah** di file ter-commit); pola `record()` + `finally` cleanup; exit 0 iff `failCount===0`.
- TDD ketat: test gagal dulu (alasan kegagalan = fitur belum ada), baru implementasi.
- Commit gaya conventional Indonesia per task; **push oleh user via PowerShell** (WSL tanpa kredensial) — jangan push.
- Prisma CLI: kalau perintah beda dengan Prisma 7, konsultasikan skill `.claude/skills/prisma-cli/SKILL.md`. Next.js API ragu → baca `node_modules/next/dist/docs/` (AGENTS.md).
- Secret scan akhir: `git ls-files -co --exclude-standard | xargs grep -Il "billmate-dev-pass[w]ord"` harus kosong.
- Jangan hapus blok `<!-- BEGIN:nextjs-agent-rules -->` di AGENTS.md.

---

### Task 1: Variant `dark:` ikut `data-theme`

**Files:**
- Modify: `app/globals.css:2` (setelah `@import "tailwindcss";`)
- Test: `e2e-shell.mjs` — blok `SH15f` disisipkan sebelum `await context.close();` (setelah blok SH15e)

**Interfaces:**
- Produces: aturan Tailwind `dark` → `&:where([data-theme="dark"], [data-theme="dark"] *)` sehingga semua kelas `dark:` (~37 file) mengikuti atribut `data-theme` di `<html>` tanpa mengubah komponen mana pun.

- [ ] **Step 1: Tulis test gagal (SH15f)** — sisipkan di `e2e-shell.mjs` tepat sebelum `await context.close();` (setelah blok SH15e):

```js
  // ---------- SH15f: variant dark: ikut data-theme, bukan preferensi OS ----------
  const sysDarkCtx = await browser.newContext({ colorScheme: "dark" });
  const sysDarkPage = await sysDarkCtx.newPage();
  await sysDarkPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await sysDarkPage.locator("#email").waitFor({ timeout: 15000 });
  const loginCardBg = await sysDarkPage.evaluate(
    () => getComputedStyle(document.querySelector("form")).backgroundColor,
  );
  record(
    "SH15f login card tetap terang walau OS gelap (dark: ikut data-theme)",
    loginCardBg === "rgb(255, 255, 255)",
    `bg=${loginCardBg}`,
  );
  await sysDarkCtx.close();
```

- [ ] **Step 2: Jalankan → FAIL** — `bun run e2e-shell.mjs 2>&1 | grep SH15f` → `FAIL ... bg=rgb(0, 0, 0)` (kartu `dark:bg-black` aktif via media query). Build saat ini sudah berisi perubahan tema, jadi RED valid tanpa rebuild.

- [ ] **Step 3: Perbaiki** — `app/globals.css`, tepat setelah baris 1 (`@import "tailwindcss";`), tambahkan baris kosong +:

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

- [ ] **Step 4: Rebuild + restart server** (perintah Global Constraints) lalu `bun run e2e-shell.mjs` → **42 passed, 0 failed**.

- [ ] **Step 5: Commit** — `git add app/globals.css e2e-shell.mjs && git commit -m "fix: variant dark: ikut data-theme sehingga konsisten dengan default terang"`

---

### Task 2: Halaman `/register` + action + proxy + normalisasi email

**Files:**
- Create: `e2e-auth.mjs` (test RED dulu)
- Create: `app/register/page.tsx`
- Modify: `app/actions/auth.ts` (tambah `RegisterState` + `register()`; lokaliskan pesan login)
- Modify: `app/lib/auth.ts:14` (normalisasi email di `authorize`)
- Modify: `app/login/page.tsx` (link "Belum punya akun? Daftar")
- Modify: `proxy.ts:14-22` (`/register` public + redirect authed)

**Interfaces:**
- Consumes: pola `login()`/`LoginState` yang ada; `prisma` export dari `@/app/lib/prisma`; `Prisma` dari `@/app/generated/prisma/client` (pola P2002 lihat `app/actions/invoice.ts:263`).
- Produces:
  - `register(state: RegisterState | null, formData: FormData): Promise<RegisterState | null>`; `export interface RegisterState { error?: string }` (di `app/actions/auth.ts`)
  - ID field: `#fullName`, `#email`, `#password` (punya `minLength={8}` — **hanya** field ini), `#confirmPassword`
  - Pesan error persis (diasersi test): `"Nama lengkap wajib diisi."`, `"Email tidak valid."`, `"Password minimal 8 karakter."`, `"Konfirmasi password tidak sama."`, `"Email sudah terdaftar."`, dan pesan login baru `"Email atau password salah."` (menggantikan "Invalid email or password.")
  - `authorize` menerima email setelah `trim().toLowerCase()`
  - `proxy.ts` menganggap `/register` public; user authed di `/register` → redirect `/`

- [ ] **Step 1: Tulis RED — buat `e2e-auth.mjs` penuh** (konvensi repo: `record()`, creds dari env, `finally` cleanup):

```js
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
```

Catatan desain test:
- `minLength` hanya di `#password` (bukan confirm) supaya R2b bisa membuktikan validasi **server** setelah atribut dibuang.
- `lockEmail`/`lockPassword` dideklarasikan di luar `try` sejak awal (dipakai Task 3, dan `finally` membersihkan keduanya).
- R7 memakai user hasil R3 (sudah terdaftar).

- [ ] **Step 2: Jalankan → FAIL** — `bun run e2e-auth.mjs` (dengan env Playwright) → gagal di R1 (`/register` dialihkan ke `/login` karena proxy belum menganggapnya public → form tak ada) dan R1c.

- [ ] **Step 3: Implementasi**

`app/actions/auth.ts` — tambah import: `import { prisma } from "@/app/lib/prisma";` dan `import { Prisma } from "@/app/generated/prisma/client";`. Ubah pesan login `"Invalid email or password."` → `"Email atau password salah."` (di dalam catch `CredentialsSignin`). Lalu tambah:

```ts
export interface RegisterState {
  error?: string;
}

export async function register(
  _state: RegisterState | null,
  formData: FormData,
): Promise<RegisterState | null> {
  const fullName = ((formData.get("fullName") as string | undefined) ?? "").trim();
  const email = ((formData.get("email") as string | undefined) ?? "").trim().toLowerCase();
  const password = formData.get("password") as string | undefined;
  const confirm = formData.get("confirmPassword") as string | undefined;

  if (fullName.length < 2) return { error: "Nama lengkap wajib diisi." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email tidak valid." };
  if (!password || password.length < 8) return { error: "Password minimal 8 karakter." };
  if (password !== confirm) return { error: "Konfirmasi password tidak sama." };

  try {
    const passwordHash = await Bun.password.hash(password);
    await prisma.user.create({ data: { email, fullName, passwordHash } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "Email sudah terdaftar." };
    }
    throw error;
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch {
    return { error: "Akun berhasil dibuat. Silakan login." };
  }
  redirect("/");
}
```

`app/register/page.tsx` — meniru layout/class `login/page.tsx` persis (kartu `max-w-sm`, class identik, `"use client"`, `useActionState`), perbedaan: judul `"Buat akun BillMate"`, field `fullName` (`autoComplete="name"`, `required`) dan `confirmPassword` (`type="password"`, `required`, `autoComplete="new-password"` — **tanpa** `minLength`), `#password` `minLength={8} autoComplete="new-password" required`, button `Daftar` (pending: `Mendaftar…`), dan setelah button di dalam form:

```tsx
<Link href="/login" className="text-center text-sm text-black hover:underline dark:text-zinc-50">
  Sudah punya akun? Masuk
</Link>
```

(import `Link` dari `next/link`; state error ditampilkan persis pola login: `state?.error` dalam `<p>` merah.)

`app/login/page.tsx` — `import Link from "next/link";` + setelah `<button>` (masih di dalam `<form>`):

```tsx
<Link href="/register" className="text-center text-sm text-black hover:underline dark:text-zinc-50">
  Belum punya akun? Daftar
</Link>
```

`app/lib/auth.ts` baris 14 — ganti menjadi:

```ts
const email = (credentials?.email as string | undefined)?.trim().toLowerCase();
```

`proxy.ts` — `isPublicRoute` menjadi:

```ts
  const isPublicRoute =
    pathname === "/login" || pathname === "/register" || pathname.startsWith("/api/auth");
```

dan redirect authed menjadi:

```ts
  if (req.auth && (pathname === "/login" || pathname === "/register")) {
```

- [ ] **Step 4: Verifikasi statis** — `bun run lint` (0 error/6 warning) + `bunx tsc --noEmit` (0).

- [ ] **Step 5: Rebuild + restart server**, lalu:
  - `bun run e2e-auth.mjs` → **11 passed, 0 failed**
  - `bun run e2e-browser.mjs` + `bun run e2e-shell.mjs` → hijau (penambahan link tak boleh merusak B1b/B8/B10)

- [ ] **Step 6: Commit** — `git add app/register/page.tsx app/actions/auth.ts app/lib/auth.ts app/login/page.tsx proxy.ts e2e-auth.mjs && git commit -m "feat: registrasi self-service /register dengan auto-login dan validasi server"`

---

### Task 3: Lockout brute-force login (10 gagal / 15 menit)

**Files:**
- Modify: `prisma/schema.prisma` (model `User`) → migrasi baru
- Modify: `app/actions/auth.ts` (`login()`)
- Test: `e2e-auth.mjs` — append blok R8

**Interfaces:**
- Consumes: `prisma`, helper `attemptWrong`/`gotoLogin`, dan `regEmail`/`lockEmail`/`lockPassword` yang sudah ada di `e2e-auth.mjs`.
- Produces: kolom `user.failed_attempts INT NOT NULL DEFAULT 0`, `user.locked_until TIMESTAMP(3) NULL`; perilaku `login()`: pre-check lock sebelum `signIn`, increment + set lock saat `failedAttempts >= 10` pada `CredentialsSignin`, reset saat sukses.

- [ ] **Step 1: Tulis RED — append blok R8 di `e2e-auth.mjs`, tepat sebelum `await context.close();`** (urutan suite: setelah R7 keadaan logged-out — `attemptWrong` selalu goto login sendiri):

```js
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
```

(cleanup `finally` Task 2 sudah menghapus `lockEmail` — tidak diubah.)

- [ ] **Step 2: Jalankan → FAIL** — `bun run e2e-auth.mjs` → R8 gagal (kolom `failedAttempts`/`lockedUntil` belum ada di client Prisma → error saat `create` user lockout, atau R8b tetap menampilkan pesan kredensial salah). RED yang sah: fitur belum ada.

- [ ] **Step 3: Schema + migrasi** — `prisma/schema.prisma`, di model `User` setelah `fullName`:

```prisma
  failedAttempts Int       @default(0) @map("failed_attempts")
  lockedUntil    DateTime? @map("locked_until")
```

Jalankan `bunx prisma migrate dev --name login_lockout` (membuat SQL migrasi + menerapkan ke DB dev + regenerate client). Kalau CLI Prisma 7 beda, lihat skill `.claude/skills/prisma-cli/SKILL.md`.

- [ ] **Step 4: Logika `login()`** — ganti isi fungsi `login` di `app/actions/auth.ts` menjadi:

```ts
export async function login(
  _state: LoginState | null,
  formData: FormData,
): Promise<LoginState | null> {
  const email = ((formData.get("email") as string | undefined) ?? "").trim().toLowerCase();
  const password = formData.get("password") as string | undefined;

  if (!email || !password) {
    return { error: "Email atau password salah." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit." };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      if (user) {
        const attempts = user.failedAttempts + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: attempts,
            ...(attempts >= 10 ? { lockedUntil: new Date(Date.now() + 15 * 60_000) } : {}),
          },
        });
      }
      return { error: "Email atau password salah." };
    }
    throw error;
  }

  if (user && (user.failedAttempts > 0 || user.lockedUntil)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }
  redirect("/");
}
```

- [ ] **Step 5: Verifikasi statis** — `bun run lint` + `bunx tsc --noEmit` → 0 error. **Rebuild + restart**, `bun run e2e-auth.mjs` → **15 passed, 0 failed**.

- [ ] **Step 6: Commit** — `git add prisma/schema.prisma prisma/migrations app/actions/auth.ts e2e-auth.mjs && git commit -m "feat: kunci akun 10x login gagal (15 menit) + reset counter saat sukses"`

---

### Task 4: Script reset-password + README

**Files:**
- Create: `scripts/reset-password.ts`
- Modify: `package.json` (tambah script `db:reset-password`)
- Modify: `README.md` (Fitur, Deploy, Testing, bagian Lupa password)

**Interfaces:**
- Consumes: pola adapter Prisma (`prisma/seed.ts` / `e2e-*.mjs`), `dotenv` (sudah devDependency).
- Produces: `bun run db:reset-password <email> <password-baru>` → hash argon2id baru, `failedAttempts=0`, `lockedUntil=null`; exit 1 bila argumen kurang / password <8 / user tidak ditemukan; exit 2 bila `DATABASE_URL` kosong.

- [ ] **Step 1: Tulis `scripts/reset-password.ts`**

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const [, , emailArg, passwordArg] = process.argv;
if (!emailArg || !passwordArg) {
  console.error("Pakai: bun run db:reset-password <email> <password-baru>");
  process.exit(1);
}
if (passwordArg.length < 8) {
  console.error("Password minimal 8 karakter.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL tidak diset (isi .env atau export dulu).");
  process.exit(2);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const email = emailArg.trim().toLowerCase();
const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`User tidak ditemukan: ${email}`);
  process.exit(1);
}

const passwordHash = await Bun.password.hash(passwordArg);
await prisma.user.update({
  where: { id: user.id },
  data: { passwordHash, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() },
});
console.log(`Password di-reset & lockout dibuka untuk ${email}.`);
await prisma.$disconnect();
```

`package.json` — tambah setelah baris `"db:seed"`:

```json
    "db:reset-password": "bun run scripts/reset-password.ts"
```

- [ ] **Step 2: Verifikasi manual (bukan e2e — script CLI)** — tanpa menyentuh akun dev:
  1. `bun run db:reset-password` (tanpa argumen) → output `Pakai: ...` + exit 1.
  2. Buat user temp: `bun -e` yang meng-`import("dotenv/config")`, membuat user `reset-smoke-<timestamp>@billmate-test.test` dengan hash `"lama-password-123"`, cetak emailnya.
  3. `bun run db:reset-password <email-temp> "baru-password-123"` → exit 0 + pesan sukses.
  4. `bun -e` verifikasi: `argon2Verify(hash, "baru-password-123") === true` dan `failedAttempts === 0`, lalu **hapus user temp** — cetak `SMOKE OK`.
  5. Jalankan juga `bun run db:reset-password <email-tidak-ada> "password-baru-123"` → exit 1 + `User tidak ditemukan`.

- [ ] **Step 3: README** — edit persis:
  1. Baris Fitur (bullet pertama): `- Autentikasi kredensial (NextAuth v5, sesi JWT)` → `- Autentikasi kredensial (NextAuth v5, sesi JWT), registrasi mandiri /register, kunci brute-force (10 gagal / 15 menit), reset password via CLI`
  2. Deploy langkah 4 ganti menjadi:

```
4. Production **jangan** seed (seed = data demo + akun dev). Setelah env
   DB siap: `bun run db:migrate`, lalu buka `/register` untuk membuat
   akun pertama. Lupa password? Seller jalankan
   `bun run db:reset-password <email> <password-baru>` dengan env prod.
```

  3. Bagian Testing: ganti `10 suite` menjadi `11 suite: shell, invoices, projects, customers, payments, expenses, business-profile, reports, reminder, browser, auth` (dan tambahkan `auth` ke penyebutan ganti-nama-file), update total assertion ke angka final hasil Task 5 (bila Task 4 dijalankan sebelum Task 5, tulis perkiraan lalu **wajib dikoreksi di Task 5**).
  4. Tambah sub-bagian `### Lupa password` di bawah Deploy: perintah `bun run db:reset-password <email> <password-baru>` + catatan reset juga membuka lockout.

- [ ] **Step 4: Verifikasi statis** — `bun run lint` tetap 0 error / 6 warning (pastikan `scripts/reset-password.ts` tidak memunculkan error eslint baru; jika ada error di scripts/, samakan gaya dengan `prisma/seed.ts`).

- [ ] **Step 5: Commit** — `git add scripts/reset-password.ts package.json README.md && git commit -m "feat: script reset-password CLI + README (production tanpa seed)"`

---

### Task 5: Gate regresi penuh + angka final

**Files:**
- Modify: `README.md` (angka final total assertion, kalau Task 4 memakai perkiraan)

- [ ] **Step 1: Gerbang statis** — `bun run lint` (0 err/6 warn) · `bunx tsc --noEmit` (0) · `bun run build` (0).

- [ ] **Step 2: Restart server produksi**, lalu **11 suite penuh** (loop semua `e2e-*.mjs`, termasuk `e2e-auth.mjs`) → semua `exit=0`, `fail=0` — total ≈ **472** (456 + SH15f + 15 auth; **baca angka final dari output summary**).

- [ ] **Step 3: Secret scan** — `git ls-files -co --exclude-standard | xargs grep -Il "billmate-dev-pass[w]ord"` → kosong; `git status --short` tidak menunjukkan file tak diinginkan.

- [ ] **Step 4: Samakan README** dengan angka final dari Step 2; commit: `git add README.md && git commit -m "docs: baseline e2e 11 suite + total assertion final"` (kalau README sudah benar, langkah ini tidak menghasilkan perubahan — tidak apa-apa).

- [ ] **Step 5: Serahkan push ke user via PowerShell** — daftar commit (urut): 3 commit tema sebelumnya (`0dcb940`, `5f3dd61`, `ed1dbad`) + commit 5 task ini.

---

## Self-Review (plan)

1. **Spec coverage:** registrasi+auto-login → T2; lockout 10/15+reset sukses → T3; reset CLI → T4; `@custom-variant dark` → T1; README no-seed/lupa-password/total → T4+T5; normalisasi email+pesan lokal → T2; proxy `/register` → T2. Semua butir desain terpetakan.
2. **Placeholder scan:** tidak ada TBD/TODO; setiap step berisi kode/perintah persis.
3. **Type consistency:** `RegisterState`, ID field, helper (`gotoLogin`, `attemptWrong`, `bodyText`), variabel fixture (`regEmail`, `lockEmail`, `lockPassword`) didefinisikan di T2 dan dipakai konsisten di T3; pesan error identik antara implementasi dan asersi test.
