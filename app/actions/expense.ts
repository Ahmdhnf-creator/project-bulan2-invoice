"use server";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { EXPENSE_CATEGORIES } from "@/app/lib/format";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface ExpenseState {
  error?: string;
  success?: boolean;
}

const MAX_LENGTHS = {
  description: 500,
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

// Validasi field pengeluaran (kecuali proyek — ditaruh terpisah agar
// urutan pesan error stabil: proyek → deskripsi → jumlah → tanggal →
// kategori → catatan).
function readExpenseFields(formData: FormData): {
  description: string;
  amount: string;
  date: Date | null;
  category: string;
  notes: string | null;
  error: string | null;
} {
  const description = ((formData.get("description") as string) ?? "").trim();
  const amountRaw = ((formData.get("amount") as string) ?? "").trim().replace(/\s+/g, "");
  const dateRaw = ((formData.get("date") as string) ?? "").trim();
  const category = ((formData.get("category") as string) ?? "").trim();
  const notes = ((formData.get("notes") as string) ?? "").trim();

  if (!description) {
    return { description: "", amount: "", date: null, category: "", notes: null, error: "Deskripsi wajib diisi." };
  }
  if (description.length > MAX_LENGTHS.description) {
    return {
      description: "",
      amount: "",
      date: null,
      category: "",
      notes: null,
      error: `Deskripsi maksimal ${MAX_LENGTHS.description} karakter.`,
    };
  }

  if (!amountRaw) {
    return { description: "", amount: "", date: null, category: "", notes: null, error: "Jumlah wajib diisi." };
  }
  // NUMERIC(15,2): maks 13 digit integer + 2 desimal; wajib bilangan bulat
  // positif (tanda minus/titik ganda ditolak format regex).
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(amountRaw)) {
    return { description: "", amount: "", date: null, category: "", notes: null, error: "Jumlah tidak valid." };
  }
  if (new Prisma.Decimal(amountRaw).isZero()) {
    return { description: "", amount: "", date: null, category: "", notes: null, error: "Jumlah harus lebih besar dari 0." };
  }

  if (!dateRaw) {
    return { description: "", amount: "", date: null, category: "", notes: null, error: "Tanggal wajib diisi." };
  }
  const date = parseDateOnly(dateRaw);
  if (!date) {
    return { description: "", amount: "", date: null, category: "", notes: null, error: "Tanggal tidak valid." };
  }

  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
    return { description: "", amount: "", date: null, category: "", notes: null, error: "Kategori tidak valid." };
  }

  if (notes.length > MAX_LENGTHS.notes) {
    return {
      description: "",
      amount: "",
      date: null,
      category: "",
      notes: null,
      error: `Catatan maksimal ${MAX_LENGTHS.notes} karakter.`,
    };
  }

  return {
    description,
    amount: amountRaw,
    date,
    category,
    notes: notes ? notes : null,
    error: null,
  };
}

function revalidateExpensePaths(projectId: bigint): void {
  revalidatePath("/expenses");
  revalidatePath(`/projects/${projectId.toString()}`);
  revalidatePath("/");
}

export async function createExpense(
  _state: ExpenseState | null,
  formData: FormData,
): Promise<ExpenseState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // userId berasal dari session server, bukan dari input client.
  const userId = BigInt(session.user.id);

  // Urutan validasi: proyek → kepemilikan → field. Kepemilikan dicek
  // sebelum field agar pesan "Proyek tidak ditemukan." untuk proyek
  // asing tidak tertutup oleh error field lain.
  const projectId = parseBigInt(formData, "projectId");
  if (!projectId) {
    const raw = ((formData.get("projectId") as string) ?? "").trim();
    return { error: raw ? "Proyek tidak ditemukan." : "Proyek wajib dipilih." };
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) {
    return { error: "Proyek tidak ditemukan." };
  }

  const fields = readExpenseFields(formData);
  if (fields.error || !fields.date) {
    return { error: fields.error ?? "Validasi gagal. Periksa kembali input Anda." };
  }
  // Dekonstruksi di jalur lurus: narrowing `date -> Date` ikut terbawa
  // ke closure (jika ada) — narrowing properti tidak masuk closure.
  const { description, amount, date, category, notes } = fields;

  let expenseId: bigint;
  try {
    const expense = await prisma.expense.create({
      data: {
        userId,
        projectId: project.id,
        description,
        amount,
        date,
        category,
        notes,
      },
    });
    expenseId = expense.id;
  } catch {
    return { error: "Gagal menyimpan pengeluaran. Silakan coba lagi." };
  }

  revalidateExpensePaths(project.id);
  redirect(`/expenses/${expenseId.toString()}`);
}

export async function updateExpense(
  _state: ExpenseState | null,
  formData: FormData,
): Promise<ExpenseState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = BigInt(session.user.id);

  const expenseId = parseBigInt(formData, "expenseId");
  if (!expenseId) {
    return { error: "Pengeluaran tidak ditemukan." };
  }

  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, userId },
    select: { id: true, projectId: true },
  });
  if (!expense) {
    return { error: "Pengeluaran tidak ditemukan." };
  }

  // Pengeluaran boleh dipindah antar proyek lewat edit (tidak ada state
  // turunan yang harus dirawat) — projectId tetap divalidasi kepemilikannya.
  const projectId = parseBigInt(formData, "projectId");
  if (!projectId) {
    const raw = ((formData.get("projectId") as string) ?? "").trim();
    return { error: raw ? "Proyek tidak ditemukan." : "Proyek wajib dipilih." };
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) {
    return { error: "Proyek tidak ditemukan." };
  }

  const fields = readExpenseFields(formData);
  if (fields.error || !fields.date) {
    return { error: fields.error ?? "Validasi gagal. Periksa kembali input Anda." };
  }
  const { description, amount, date, category, notes } = fields;

  try {
    const result = await prisma.expense.updateMany({
      where: { id: expense.id, userId },
      data: {
        projectId: project.id,
        description,
        amount,
        date,
        category,
        notes,
      },
    });
    if (result.count === 0) {
      return { error: "Pengeluaran tidak ditemukan." };
    }
  } catch {
    return { error: "Gagal menyimpan perubahan. Silakan coba lagi." };
  }

  revalidateExpensePaths(project.id);
  if (expense.projectId !== project.id) {
    revalidateExpensePaths(expense.projectId);
  }
  return { success: true };
}

export async function deleteExpense(
  _state: ExpenseState | null,
  formData: FormData,
): Promise<ExpenseState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = BigInt(session.user.id);

  const expenseId = parseBigInt(formData, "expenseId");
  if (!expenseId) {
    return { error: "Pengeluaran tidak ditemukan." };
  }

  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, userId },
    select: { id: true, projectId: true },
  });
  if (!expense) {
    return { error: "Pengeluaran tidak ditemukan." };
  }

  try {
    // Kepemilikan ikut diverifikasi di operasi DB: hanya baris milik
    // session yang boleh terhapus (aman terhadap race).
    const result = await prisma.expense.deleteMany({
      where: { id: expense.id, userId },
    });
    if (result.count === 0) {
      return { error: "Pengeluaran tidak ditemukan." };
    }
  } catch {
    return { error: "Gagal menghapus pengeluaran. Silakan coba lagi." };
  }

  revalidateExpensePaths(expense.projectId);
  redirect("/expenses");
}
