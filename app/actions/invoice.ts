"use server";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Prisma, type InvoiceStatus } from "@/app/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface InvoiceState {
  error?: string;
  success?: boolean;
}

const MAX_LENGTHS = {
  invoiceNumber: 50,
  itemDescription: 500,
  notes: 1000,
} as const;

const VALID_STATUSES: readonly InvoiceStatus[] = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
];

interface ItemValues {
  description: string;
  quantity: string;
  unitPrice: string;
}

interface HeaderValues {
  invoiceNumber: string;
  projectId: bigint;
  issueDate: Date;
  dueDate: Date;
  status: InvoiceStatus;
  taxRate: string;
  notes: string | null;
}

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

// Item diposting sebagai tiga array paralel (description, quantity,
// unitPrice) sehingga baris dinamis di form sederhana.
function readHeader(formData: FormData): {
  values: HeaderValues | null;
  error: string | null;
} {
  const invoiceNumber = ((formData.get("invoiceNumber") as string) ?? "").trim();
  const projectRaw = ((formData.get("projectId") as string) ?? "").trim();
  const issueRaw = ((formData.get("issueDate") as string) ?? "").trim();
  const dueRaw = ((formData.get("dueDate") as string) ?? "").trim();
  const status = ((formData.get("status") as string) ?? "").trim();
  const taxRaw = ((formData.get("taxRate") as string) ?? "").trim().replace(/\s+/g, "");
  const notes = ((formData.get("notes") as string) ?? "").trim();

  if (!invoiceNumber) {
    return { values: null, error: "Nomor invoice wajib diisi." };
  }
  if (invoiceNumber.length > MAX_LENGTHS.invoiceNumber) {
    return {
      values: null,
      error: `Nomor invoice maksimal ${MAX_LENGTHS.invoiceNumber} karakter.`,
    };
  }

  if (!projectRaw) {
    return { values: null, error: "Proyek wajib dipilih." };
  }
  let projectId: bigint;
  if (/^\d+$/.test(projectRaw)) {
    try {
      projectId = BigInt(projectRaw);
    } catch {
      return { values: null, error: "Proyek tidak ditemukan." };
    }
  } else {
    return { values: null, error: "Proyek tidak ditemukan." };
  }

  if (!issueRaw) {
    return { values: null, error: "Tanggal terbit wajib diisi." };
  }
  const issueDate = parseDateOnly(issueRaw);
  if (!issueDate) {
    return { values: null, error: "Tanggal terbit tidak valid." };
  }

  if (!dueRaw) {
    return { values: null, error: "Tanggal jatuh tempo wajib diisi." };
  }
  const dueDate = parseDateOnly(dueRaw);
  if (!dueDate) {
    return { values: null, error: "Tanggal jatuh tempo tidak valid." };
  }
  if (dueDate.getTime() < issueDate.getTime()) {
    return {
      values: null,
      error: "Tanggal jatuh tempo tidak boleh sebelum tanggal terbit.",
    };
  }

  if (!VALID_STATUSES.includes(status as InvoiceStatus)) {
    return { values: null, error: "Status invoice tidak valid." };
  }

  // Pajak opsional; kosong berarti 0. Batas atas 100% mengikuti
  // Decimal(5,2) dan makna persen pajak.
  let taxRate = "0";
  if (taxRaw) {
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(taxRaw) || Number(taxRaw) > 100) {
      return { values: null, error: "Pajak tidak valid." };
    }
    taxRate = taxRaw;
  }

  if (notes.length > MAX_LENGTHS.notes) {
    return {
      values: null,
      error: `Catatan maksimal ${MAX_LENGTHS.notes} karakter.`,
    };
  }

  return {
    values: {
      invoiceNumber,
      projectId,
      issueDate,
      dueDate,
      status: status as InvoiceStatus,
      taxRate,
      notes: notes ? notes : null,
    },
    error: null,
  };
}

// Item divalidasi terpisah setelah kepemilikan proyek dicek, agar
// pesan "Proyek tidak ditemukan." tidak tertutup oleh error item
// pada form yang belum diisi lengkap.
function readItems(formData: FormData): {
  items: ItemValues[] | null;
  error: string | null;
} {
  const descriptions = formData
    .getAll("itemDescription")
    .map((v) => String(v).trim());
  const quantities = formData.getAll("itemQuantity").map((v) => String(v).trim());
  const unitPrices = formData
    .getAll("itemUnitPrice")
    .map((v) => String(v).trim().replace(/\s+/g, ""));

  if (descriptions.length === 0) {
    return {
      items: null,
      error: "Minimal invoice harus memiliki 1 item.",
    };
  }

  const items: ItemValues[] = [];
  for (let i = 0; i < descriptions.length; i++) {
    const description = descriptions[i] ?? "";
    const quantity = quantities[i] ?? "";
    const unitPrice = unitPrices[i] ?? "";

    if (!description) {
      return { items: null, error: "Deskripsi item wajib diisi." };
    }
    if (description.length > MAX_LENGTHS.itemDescription) {
      return {
        items: null,
        error: `Deskripsi item maksimal ${MAX_LENGTHS.itemDescription} karakter.`,
      };
    }
    if (
      !/^\d{1,10}(\.\d{1,2})?$/.test(quantity) ||
      Number(quantity) <= 0
    ) {
      return { items: null, error: "Kuantitas item tidak valid." };
    }
    if (!/^\d{1,13}(\.\d{1,2})?$/.test(unitPrice)) {
      return { items: null, error: "Harga satuan item tidak valid." };
    }

    items.push({ description, quantity, unitPrice });
  }

  return { items, error: null };
}

// Kepemilikan proyek diverifikasi di server: hanya proyek milik session
// yang boleh dipakai, sehingga input projectId dari client tidak dapat
// menempelkan invoice ke proyek pengguna lain.
async function projectOwnedByUser(
  projectId: bigint,
  userId: bigint,
): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  return project !== null;
}

// === Perhitungan keuangan (semua di server, tidak pernah dari client) ===
// Asumsi pembulatan: ROUND_HALF_UP ke 2 desimal (rupiah), memakai
// Prisma.Decimal sehingga tidak ada aritmetika floating-point.
// subtotal  = Σ round(kuantitas × harga_satuan, 2)
// pajak     = round(subtotal × tax_rate / 100, 2)
// total     = subtotal + pajak
function computeAmounts(
  items: ItemValues[],
  taxRate: string,
): {
  itemAmounts: Prisma.Decimal[];
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
} {
  const itemAmounts = items.map((item) =>
    new Prisma.Decimal(item.quantity)
      .times(new Prisma.Decimal(item.unitPrice))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
  );
  const subtotal = itemAmounts.reduce(
    (sum, amount) => sum.plus(amount),
    new Prisma.Decimal(0),
  );
  const taxAmount = subtotal
    .times(new Prisma.Decimal(taxRate))
    .div(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const total = subtotal.plus(taxAmount);
  return { itemAmounts, subtotal, taxAmount, total };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createInvoice(
  _state: InvoiceState | null,
  formData: FormData,
): Promise<InvoiceState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Urutan validasi: header → kepemilikan proyek → item → duplikat nomor.
  // Kepemilikan dicek sebelum item agar pesan "Proyek tidak ditemukan."
  // tidak tertutup oleh error item yang belum diisi.
  const header = readHeader(formData);
  if (header.error || !header.values) {
    return {
      error: header.error ?? "Validasi gagal. Periksa kembali input Anda.",
    };
  }
  const values = header.values;

  // userId berasal dari session server, bukan dari input client.
  const userId = BigInt(session.user.id);

  if (!(await projectOwnedByUser(values.projectId, userId))) {
    return { error: "Proyek tidak ditemukan." };
  }

  const itemsResult = readItems(formData);
  if (itemsResult.error || !itemsResult.items) {
    return {
      error: itemsResult.error ?? "Validasi gagal. Periksa kembali input Anda.",
    };
  }
  const items = itemsResult.items;

  const duplicate = await prisma.invoice.findFirst({
    where: { userId, invoiceNumber: values.invoiceNumber },
    select: { id: true },
  });
  if (duplicate) {
    return { error: "Nomor invoice sudah digunakan." };
  }

  const { itemAmounts, subtotal, taxAmount, total } = computeAmounts(
    items,
    values.taxRate,
  );

  let invoiceId: bigint;
  try {
    invoiceId = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          userId,
          projectId: values.projectId,
          invoiceNumber: values.invoiceNumber,
          issueDate: values.issueDate,
          dueDate: values.dueDate,
          status: values.status,
          taxRate: values.taxRate,
          subtotal,
          taxAmount,
          total,
          notes: values.notes,
        },
      });
      await tx.invoiceItem.createMany({
        data: items.map((item, index) => ({
          invoiceId: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: itemAmounts[index] ?? new Prisma.Decimal(0),
          sortOrder: index + 1,
        })),
      });
      return invoice.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Nomor invoice sudah digunakan." };
    }
    return { error: "Gagal menyimpan invoice. Silakan coba lagi." };
  }

  revalidatePath("/invoices");
  revalidatePath(`/projects/${values.projectId.toString()}`);
  revalidatePath("/");
  redirect(`/invoices/${invoiceId.toString()}`);
}

export async function updateInvoice(
  _state: InvoiceState | null,
  formData: FormData,
): Promise<InvoiceState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const invoiceId = parseBigInt(formData, "invoiceId");
  if (!invoiceId) {
    return { error: "Invoice tidak ditemukan." };
  }

  // Urutan validasi sama dengan create: header → kepemilikan proyek →
  // item → duplikat nomor.
  const header = readHeader(formData);
  if (header.error || !header.values) {
    return {
      error: header.error ?? "Validasi gagal. Periksa kembali input Anda.",
    };
  }
  const values = header.values;

  const userId = BigInt(session.user.id);

  if (!(await projectOwnedByUser(values.projectId, userId))) {
    return { error: "Proyek tidak ditemukan." };
  }

  const itemsResult = readItems(formData);
  if (itemsResult.error || !itemsResult.items) {
    return {
      error: itemsResult.error ?? "Validasi gagal. Periksa kembali input Anda.",
    };
  }
  const items = itemsResult.items;

  const duplicate = await prisma.invoice.findFirst({
    where: {
      userId,
      invoiceNumber: values.invoiceNumber,
      NOT: { id: invoiceId },
    },
    select: { id: true },
  });
  if (duplicate) {
    return { error: "Nomor invoice sudah digunakan." };
  }

  const { itemAmounts, subtotal, taxAmount, total } = computeAmounts(
    items,
    values.taxRate,
  );

  // Kepemilikan invoice diverifikasi sebagai bagian dari operasi database:
  // hanya baris dengan id DAN userId milik session yang diperbarui, lalu
  // item lama diganti seluruhnya dengan input terbaru.
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.invoice.updateMany({
        where: { id: invoiceId, userId },
        data: {
          projectId: values.projectId,
          invoiceNumber: values.invoiceNumber,
          issueDate: values.issueDate,
          dueDate: values.dueDate,
          status: values.status,
          taxRate: values.taxRate,
          subtotal,
          taxAmount,
          total,
          notes: values.notes,
          updatedAt: new Date(),
        },
      });
      if (result.count === 0) {
        return false;
      }
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });
      await tx.invoiceItem.createMany({
        data: items.map((item, index) => ({
          invoiceId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: itemAmounts[index] ?? new Prisma.Decimal(0),
          sortOrder: index + 1,
        })),
      });
      return true;
    });
    if (!updated) {
      return { error: "Invoice tidak ditemukan." };
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Nomor invoice sudah digunakan." };
    }
    return { error: "Gagal menyimpan perubahan. Silakan coba lagi." };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId.toString()}`);
  revalidatePath(`/invoices/${invoiceId.toString()}/edit`);
  revalidatePath(`/projects/${values.projectId.toString()}`);
  revalidatePath("/");
  return { success: true };
}

export async function deleteInvoice(
  _state: InvoiceState | null,
  formData: FormData,
): Promise<InvoiceState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const invoiceId = parseBigInt(formData, "invoiceId");
  if (!invoiceId) {
    return { error: "Invoice tidak ditemukan." };
  }

  const userId = BigInt(session.user.id);

  // Verifikasi kepemilikan terlebih dahulu; invoice yang tidak dimiliki
  // atau tidak ada menerima pesan yang sama agar tidak bocor.
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    select: { id: true, projectId: true },
  });
  if (!invoice) {
    return { error: "Invoice tidak ditemukan." };
  }

  // Jangan pernah menghapus invoice yang masih memiliki pembayaran —
  // Payment.invoiceId menggunakan ON DELETE RESTRICT.
  const paymentCount = await prisma.payment.count({
    where: { invoiceId },
  });
  if (paymentCount > 0) {
    return {
      error: `Invoice ini masih memiliki ${paymentCount} pembayaran. Hapus pembayaran terlebih dahulu sebelum menghapus invoice.`,
    };
  }

  try {
    // Item ikut terhapus otomatis (InvoiceItem.invoiceId = ON DELETE CASCADE).
    await prisma.invoice.delete({ where: { id: invoiceId } });
  } catch (error) {
    // Perlombaan: pembayaran baru ditambahkan antara pengecekan dan
    // penghapusan.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return {
        error:
          "Invoice ini masih memiliki pembayaran. Hapus pembayaran terlebih dahulu sebelum menghapus invoice.",
      };
    }
    return { error: "Gagal menghapus invoice. Silakan coba lagi." };
  }

  revalidatePath("/invoices");
  revalidatePath(`/projects/${invoice.projectId.toString()}`);
  revalidatePath("/");
  redirect("/invoices");
}
