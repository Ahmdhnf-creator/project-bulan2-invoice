"use server";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface PaymentState {
  error?: string;
  success?: boolean;
}

const MAX_LENGTHS = {
  method: 50,
  notes: 1000,
} as const;

// Parse "YYYY-MM-DD" menjadi Date (UTC) dan pastikan tanggalnya valid
// (mis. 2026-02-31 ditolak, bukan digeser ke Maret).
function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date;
}

function parseBigInt(formData: FormData, field: string): bigint | null {
  const raw = ((formData.get(field) as string) ?? "").trim();
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

// Validasi field pembayaran (kecuali invoice — ditaruh terpisah agar
// urutan pesan error stabil).
function readPaymentFields(formData: FormData): {
  amount: string;
  paymentDate: Date | null;
  method: string | null;
  notes: string | null;
  error: string | null;
} {
  const amountRaw = ((formData.get("amount") as string) ?? "").trim().replace(/\s+/g, "");
  const dateRaw = ((formData.get("paymentDate") as string) ?? "").trim();
  const method = ((formData.get("method") as string) ?? "").trim();
  const notes = ((formData.get("notes") as string) ?? "").trim();

  if (!amountRaw) {
    return { amount: "", paymentDate: null, method: null, notes: null, error: "Jumlah pembayaran wajib diisi." };
  }
  // NUMERIC(15,2): maks 13 digit integer + 2 desimal; wajib bilangan bulat
  // positif (tanda minus/titik ganda ditolak format regex).
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(amountRaw)) {
    return { amount: "", paymentDate: null, method: null, notes: null, error: "Jumlah pembayaran tidak valid." };
  }
  if (new Prisma.Decimal(amountRaw).isZero()) {
    return { amount: "", paymentDate: null, method: null, notes: null, error: "Jumlah pembayaran harus lebih besar dari 0." };
  }

  if (!dateRaw) {
    return { amount: "", paymentDate: null, method: null, notes: null, error: "Tanggal pembayaran wajib diisi." };
  }
  const paymentDate = parseDateOnly(dateRaw);
  if (!paymentDate) {
    return { amount: "", paymentDate: null, method: null, notes: null, error: "Tanggal pembayaran tidak valid." };
  }

  if (method.length > MAX_LENGTHS.method) {
    return {
      amount: "",
      paymentDate: null,
      method: null,
      notes: null,
      error: `Metode pembayaran maksimal ${MAX_LENGTHS.method} karakter.`,
    };
  }
  if (notes.length > MAX_LENGTHS.notes) {
    return {
      amount: "",
      paymentDate: null,
      method: null,
      notes: null,
      error: `Catatan maksimal ${MAX_LENGTHS.notes} karakter.`,
    };
  }

  return {
    amount: amountRaw,
    paymentDate,
    method: method ? method : null,
    notes: notes ? notes : null,
    error: null,
  };
}

// === Rekap status invoice (semua di server, Prisma.Decimal) ===
// Aturan status (InvoiceStatus hanya UNPAID / PARTIALLY_PAID / PAID):
//   total pembayaran == 0        -> UNPAID
//   0 < total < total invoice    -> PARTIALLY_PAID
//   total >= total invoice       -> PAID   (pembayaran berlebih diizinkan)
// Dipanggil di dalam transaksi yang sama dengan perubahan payment agar
// payment dan status invoice tidak pernah tidak konsisten.
async function recalcInvoiceStatus(
  tx: Prisma.TransactionClient,
  invoiceId: bigint,
  userId: bigint,
): Promise<void> {
  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, userId },
    select: { id: true, total: true },
  });
  if (!invoice) {
    return;
  }
  const agg = await tx.payment.aggregate({
    where: { invoiceId },
    _sum: { amount: true },
  });
  const paid = agg._sum.amount ?? new Prisma.Decimal(0);
  const status = paid.isZero()
    ? "UNPAID"
    : paid.gte(invoice.total)
      ? "PAID"
      : "PARTIALLY_PAID";

  await tx.invoice.update({
    where: { id: invoice.id },
    data: { status, updatedAt: new Date() },
  });
}

function revalidatePaymentPaths(invoiceId: bigint, projectId: bigint): void {
  revalidatePath("/payments");
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId.toString()}`);
  revalidatePath(`/projects/${projectId.toString()}`);
  revalidatePath("/");
}

export async function createPayment(
  _state: PaymentState | null,
  formData: FormData,
): Promise<PaymentState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // userId berasal dari session server, bukan dari input client.
  const userId = BigInt(session.user.id);

  // Urutan validasi: invoice → kepemilikan → field. Kepemilikan dicek
  // sebelum field agar pesan "Invoice tidak ditemukan." untuk invoice
  // asing tidak tertutup oleh error field lain.
  const invoiceId = parseBigInt(formData, "invoiceId");
  if (!invoiceId) {
    const raw = ((formData.get("invoiceId") as string) ?? "").trim();
    return { error: raw ? "Invoice tidak ditemukan." : "Invoice wajib dipilih." };
  }

  // Kepemilikan invoice diverifikasi di server: input select dari client
  // dapat dimanipulasi, hanya invoice milik session yang boleh dibayar.
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    select: { id: true, projectId: true },
  });
  if (!invoice) {
    return { error: "Invoice tidak ditemukan." };
  }

  const fields = readPaymentFields(formData);
  if (fields.error || !fields.paymentDate) {
    return { error: fields.error ?? "Validasi gagal. Periksa kembali input Anda." };
  }
  // Dekonstruksi di jalur lurus: narrowing `paymentDate -> Date` ikut
  // terbawa ke closure transaksi (narrowing properti tidak masuk closure).
  const { amount, paymentDate, method, notes } = fields;

  let paymentId: bigint;
  try {
    paymentId = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount,
          paymentDate,
          method,
          notes,
        },
      });
      await recalcInvoiceStatus(tx, invoice.id, userId);
      return payment.id;
    });
  } catch {
    return { error: "Gagal menyimpan pembayaran. Silakan coba lagi." };
  }

  revalidatePaymentPaths(invoice.id, invoice.projectId);
  redirect(`/payments/${paymentId.toString()}`);
}

export async function updatePayment(
  _state: PaymentState | null,
  formData: FormData,
): Promise<PaymentState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = BigInt(session.user.id);

  const paymentId = parseBigInt(formData, "paymentId");
  if (!paymentId) {
    return { error: "Pembayaran tidak ditemukan." };
  }

  // Kepemilikan via relasi: payment milik session hanya jika invoice-nya
  // milik session. Pengecekan di server, bukan dari input client.
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, invoice: { userId } },
    select: { id: true, invoiceId: true, invoice: { select: { projectId: true } } },
  });
  if (!payment) {
    return { error: "Pembayaran tidak ditemukan." };
  }

  const fields = readPaymentFields(formData);
  if (fields.error || !fields.paymentDate) {
    return { error: fields.error ?? "Validasi gagal. Periksa kembali input Anda." };
  }
  const { amount, paymentDate, method, notes } = fields;

  // Invoice tidak dapat dipindahkan antar-invoice lewat edit (status kedua
  // invoice akan sulit dirawat) — invoiceId tidak dibaca dari form.
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.payment.updateMany({
        where: { id: payment.id, invoice: { userId } },
        data: {
          amount,
          paymentDate,
          method,
          notes,
        },
      });
      if (result.count === 0) {
        return false;
      }
      await recalcInvoiceStatus(tx, payment.invoiceId, userId);
      return true;
    });
    if (!updated) {
      return { error: "Pembayaran tidak ditemukan." };
    }
  } catch {
    return { error: "Gagal menyimpan perubahan. Silakan coba lagi." };
  }

  revalidatePaymentPaths(payment.invoiceId, payment.invoice.projectId);
  return { success: true };
}

export async function deletePayment(
  _state: PaymentState | null,
  formData: FormData,
): Promise<PaymentState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = BigInt(session.user.id);

  const paymentId = parseBigInt(formData, "paymentId");
  if (!paymentId) {
    return { error: "Pembayaran tidak ditemukan." };
  }

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, invoice: { userId } },
    select: { id: true, invoiceId: true, invoice: { select: { projectId: true } } },
  });
  if (!payment) {
    return { error: "Pembayaran tidak ditemukan." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Kepemilikan ikut diverifikasi di operasi DB: hanya baris yang
      // invoice-nya milik session yang boleh terhapus.
      const result = await tx.payment.deleteMany({
        where: { id: payment.id, invoice: { userId } },
      });
      if (result.count === 0) {
        throw new Error("PAYMENT_NOT_OWNED");
      }
      await recalcInvoiceStatus(tx, payment.invoiceId, userId);
    });
  } catch (err) {
    // Baris sudah terhapus oleh pihak lain (race) — perlakukan sebagai
    // tidak ditemukan, jangan menyentuh data lain.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return { error: "Pembayaran tidak ditemukan." };
    }
    if (err instanceof Error && err.message === "PAYMENT_NOT_OWNED") {
      return { error: "Pembayaran tidak ditemukan." };
    }
    return { error: "Gagal menghapus pembayaran. Silakan coba lagi." };
  }

  revalidatePaymentPaths(payment.invoiceId, payment.invoice.projectId);
  redirect("/payments");
}
