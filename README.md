# BillMate

Sistem administrasi & keuangan untuk bisnis berbasis proyek bernilai tinggi.
MVP dengan **Proyek sebagai objek utama**: Customer → Proyek → Invoice →
Pembayaran, plus Pengeluaran per proyek.

## Fitur (10 modul PRD)

- Autentikasi kredensial (NextAuth v5, sesi JWT)
- Profil usaha, Pelanggan, Proyek, Invoice (pajak per invoice), Pembayaran,
  Pengeluaran
- Dashboard (arus kas 6 bulan, status invoice, kartu ringkasan)
- Laporan dasar per periode bulanan
- Pengingat WhatsApp manual (salin pesan / buka `wa.me` — tanpa API)

## Stack

Next.js 16 (App Router + `proxy.ts`) · TypeScript · Tailwind 4 · Prisma 7 +
PostgreSQL · next-auth 5 (beta) · Playwright (e2e)

## Setup lokal

```bash
bun install              # postinstall otomatis menjalankan prisma generate
cp .env.example .env      # lalu isi nilainya
bun run db:migrate        # terapkan migrasi
BILLMATE_PASSWORD=<rahasia> bun run db:seed
bun run build && AUTH_URL=http://localhost:3000 bun run start
```

Login: `dev@billmate.test` + password = nilai `BILLMATE_PASSWORD` saat seed.

## Environment variables

| Variabel | Wajib | Keterangan |
|---|---|---|
| DATABASE_URL | ✓ | Koneksi app (pg adapter) |
| DIRECT_URL | ✓ | Untuk prisma migrate & seed |
| AUTH_SECRET | ✓ | `openssl rand -base64 32` |
| AUTH_URL | - | URL publik (default `http://localhost:3000`) |
| BILLMATE_EMAIL | saat e2e | Akun e2e (default `dev@billmate.test`) |
| BILLMATE_PASSWORD | saat seed/e2e | **Rahasia** — jangan pernah commit |

## Perintah

| Perintah | Fungsi |
|---|---|
| `bun run dev` | server dev (bukan jalur verifikasi) |
| `bun run build` / `bun run start` | build & server production |
| `bun run lint` / `bunx tsc --noEmit` | lint & typecheck |
| `bun run db:generate` / `db:migrate` / `db:seed` | prisma generate / migrate deploy / seed |

## Testing (e2e)

```bash
bun run lint && bunx tsc --noEmit
bun run build && AUTH_URL=http://localhost:3000 bun run start &
export BILLMATE_EMAIL=dev@billmate.test BILLMATE_PASSWORD=<rahasia>
bun run e2e-shell.mjs
```

10 suite: `shell`, `invoices`, `projects`, `customers`, `payments`,
`expenses`, `business-profile`, `reports`, `reminder`, `browser`
(ganti nama file pada perintah di atas). Total **451 assertion**.

Catatan WSL/Linux: bila browser Playwright gagal memuat library sistem,
arahkan `LD_LIBRARY_PATH` ke direktori library yang sudah diekstrak
(contoh: `export LD_LIBRARY_PATH=/tmp/opencode/pwlibs/usr/lib/x86_64-linux-gnu`).

## Deploy (Vercel)

1. Push ke GitHub → Import repo di Vercel (Bun terdeteksi otomatis via
   `packageManager` + `bun.lock`; `postinstall` menjalankan `prisma generate`).
2. Set env: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL` (opsional).
3. Build command: default Vercel (`bun run build`).
4. Sekali di awal, dari mesin lokal dengan env produksi:
   `bun run db:migrate && BILLMATE_PASSWORD=<rahasia> bun run db:seed`.
5. Proxy (Next 16) default Node.js runtime — jangan set runtime edge
   (auth memakai argon2 native).

## Keputusan desain penting

- Overdue invoice dihitung saat dibaca, tidak disimpan.
- Tanpa payment gateway — pembayaran dicatat manual.
- Rolling-refresh cookie sesi next-auth dibuang di `proxy.ts`
  (race logout — next-auth issue #12909).
