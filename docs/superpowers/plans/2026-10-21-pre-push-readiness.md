# BillMate — Rencana Kesiapan Push & Deploy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (dipilih: inline) untuk mengimplementasikan rencana ini task-per-task. Langkah memakai sintaks checkbox (`- [ ]`) untuk tracking.

**Goal:** semua kerja ter-commit rapi & bersih rahasia, README siap, deps siap-Vercel, lalu push ke `origin/main`.

**Architecture:** rencana 6 task sequential, tiap task diakhiri verifikasi lalu commit; tak ada perubahan skema database.

**Tech Stack:** Next.js 16 · TypeScript · Prisma 7 + PostgreSQL · next-auth 5 beta · Playwright e2e · Bun · Vercel (target deploy).

**Spec:** `PRD.md` (cakupan produk) + audit pra-push di sesi ini (2026-10-21).

**Keputusan user:** deploy = **Vercel** · `docs/` ikut semua · seed = **tetap demo data + password dari env** · ganti background desain = **SESUDAH push** (di luar rencana ini).

## Global Constraints

- Tak pernah menampilkan isi `.env`/secrets; `.env` wajib tetap ter-ignore (`git check-ignore .env` exit 0).
- Baseline verifikasi: `tsc` exit 0 · lint **0 errors / 6 warnings** · `prisma validate` valid · build exit 0 · e2e **451/451**.
- Jangan sentuh `prisma/schema.prisma` & `prisma/migrations/` (tak ada perubahan skema).
- Semua perubahan = task kecil, commit per task, pesan conventional; kerja di branch `main` (persetujuan user: tugasnya memang commit + push `main`).
- Password fixture e2e TIDAK boleh ditulis ke file yang ter-commit (termasuk dokumen ini).

---

### Task 1: Amankan Karya ke Git (4 commit tematik)

**Files:** staging saja (tanpa edit kode). Menyertakan `docs/superpowers/plans/` (file rencana ini) di commit docs.

- [ ] Preflight: `git status --porcelain` + `git check-ignore .env` (exit 0).
- [ ] Commit core app (termasuk `prisma7.config.ts` — wajib untuk prisma CLI):
  ```bash
  git add app proxy.ts prisma types prisma7.config.ts && git add -u
  git commit -m "feat: BillMate MVP — auth, dashboard shell, 10 modul"
  ```
  (`-u` menangkap modifikasi `.gitignore`, `app/layout.tsx`, `app/globals.css`, `bun.lock`, `package.json` + deletions `app/page.tsx`, `public/*.svg`.)
- [ ] Commit test: `git add e2e-*.mjs && git commit -m "test: 10 suite Playwright e2e (451 assertion)"`
- [ ] Commit docs: `git add PRD.md docs/ && git commit -m "docs: PRD, evidence discovery, design dashboard"`
- [ ] Commit tooling: `git add .claude .agents .windsurf opencode.json skills-lock.json && git commit -m "chore: konfigurasi tooling AI (skills & opencode)"` (tak ada `.claude/.gitignore` — add biasa cukup).
- [ ] **Verifikasi:** `git status --porcelain` → kosong; `git log --oneline -6`; `git ls-files | grep -x ".env"` → kosong.

### Task 2: Rahasiakan Password Seed

**Files:** Modify `prisma/seed.ts:7-19`.

- [ ] Edit menjadi:
  ```ts
  const DEV_EMAIL = "dev@billmate.test";
  const DEV_PASSWORD = process.env.BILLMATE_PASSWORD;

  async function main() {
    if (!DEV_PASSWORD) {
      throw new Error(
        "BILLMATE_PASSWORD tidak diset. Isi di .env (lihat .env.example) sebelum menjalankan seed.",
      );
    }
    const passwordHash = await Bun.password.hash(DEV_PASSWORD);
    const user = await prisma.user.upsert({
      where: { email: DEV_EMAIL },
      update: { fullName: "Dev User", passwordHash },
      create: { email: DEV_EMAIL, fullName: "Dev User", passwordHash },
    });
  ```
  (`update` ikut `passwordHash` → seed ulang = rotasi password dari env.)
- [ ] **Red test:** `env -u BILLMATE_PASSWORD bun run prisma/seed.ts` → exit ≠ 0 + pesan BILLMATE_PASSWORD (key itu juga tak ada di `.env`).
- [ ] **Green test:** jalankan seed dengan password fixture harness e2e (nilai sama dengan hash DB saat ini; nilai TIDAK ditulis di dokumen ini) → `Seed completed` + counts.
- [ ] **Regresi:** `bun run e2e-shell.mjs` → **36/36**.
- [ ] Commit: `git add prisma/seed.ts && git commit -m "fix: seed baca BILLMATE_PASSWORD dari env, dukung rotasi password"`.

### Task 3: Siapkan Deploy Vercel

**Files:** `package.json`, `bun.lock`, `.gitignore`, buat `.env.example`.

- [ ] `bun add -d dotenv` (prisma7.config.ts import `dotenv/config` tapi belum terpasang).
- [ ] Edit `package.json`:
  - hapus dependency `"@node-rs/argon2-win32-x64-msvc": "^2.2.2",` (redundan — semua platform sudah `optionalDependencies` `@node-rs/argon2`);
  - tambah scripts: `"db:generate": "prisma generate"`, `"db:migrate": "prisma migrate deploy"`, `"db:seed": "prisma db seed"`.
- [ ] **Uji postinstall (aturan konkret):** `env -u DIRECT_URL -u DATABASE_URL bunx prisma generate`
  - exit 0 → tambah `"postinstall": "prisma generate"`;
  - exit ≠ 0 → JANGAN postinstall; README & Vercel Build Command pakai `bunx prisma generate && next build`.
- [ ] `.gitignore`: tambah `!.env.example` setelah baris `.env*`.
- [ ] Buat `.env.example`:
  ```
  # Salin ke .env lalu isi — JANGAN PERNAH commit .env
  DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require"
  DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require"
  AUTH_SECRET=""   # openssl rand -base64 32
  AUTH_URL="http://localhost:3000"
  BILLMATE_EMAIL="dev@billmate.test"
  BILLMATE_PASSWORD=""   # password akun dev hasil seed — RAHASIA
  ```
- [ ] **Verifikasi:** `bun install` → `bun run db:generate` → `bun run build` exit 0 → `ls node_modules/@node-rs | grep argon2` (linux binding ada) → `bun run e2e-shell.mjs` **36/36**.
- [ ] Commit: `git add package.json bun.lock .gitignore .env.example && git commit -m "build: kesiapan deploy — dotenv, script db, .env.example, hapus binding argon2 win32"`.

### Task 4: Tulis Ulang README

**Files:** `README.md` (replace penuh, ganti template create-next-app).

- [ ] Tulis README BillMate: intro + 10 modul, stack, setup lokal, tabel env vars, testing (10 suite + catatan WSL), panduan Vercel (import repo, env, build command sesuai hasil uji Task 3, sekali jalan migrate+seed, catatan proxy Node runtime), keputusan desain penting (overdue derived, tanpa gateway, strip rolling refresh issue #12909).
- [ ] Spot-check: `bun run db:generate` exit 0; daftar 10 suite lengkap; TANPA literal password fixture.
- [ ] Commit: `git add README.md && git commit -m "docs: tulis README BillMate (setup, env, testing, deploy Vercel)"`.

### Task 5: Gerbang Kualitas Akhir

- [ ] `bunx tsc --noEmit` → 0 · `bun run lint` → 0 err/6 warn · `bunx prisma validate` → valid · `bun run build` → exit 0.
- [ ] Restart server production → 10 suite → **451/451**.
- [ ] Secret scan: `git ls-files | xargs grep -Il "billmate-dev-pass[w]ord" 2>/dev/null` → **KOSONG** (pakai karakter class `[w]` agar literal password fixture tak pernah masuk ke file ter-commit); `git check-ignore .env` → exit 0; `git ls-files | grep -x ".env"` → kosong.
- [ ] `git status --porcelain` → kosong.

### Task 6: Push ke GitHub

- [ ] `git log origin/main..HEAD --oneline` → review commit.
- [ ] `git push origin main` — kalau butuh kredensial/2FA: **berhenti & minta user**.
- [ ] `git status -sb` → in sync.

---

**Self-review:** semua isi audit pra-push terpetakan (T1 commit · T2 password · T3 deps/Vercel · T4 README · T5 bukti akhir · T6 push); tanpa placeholder; nama script konsisten (`db:generate`/`db:migrate`/`db:seed`).
