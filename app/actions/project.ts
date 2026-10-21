"use server";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Prisma, type ProjectStatus } from "@/app/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface ProjectState {
  error?: string;
  success?: boolean;
}

const MAX_LENGTHS = {
  name: 150,
  notes: 1000,
} as const;

const VALID_STATUSES: readonly ProjectStatus[] = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

interface ProjectValues {
  name: string;
  customerId: bigint;
  projectValue: string;
  startDate: Date;
  endDate: Date | null;
  status: ProjectStatus;
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

function readAndValidate(
  formData: FormData,
): { values: ProjectValues | null; error: string | null } {
  const name = ((formData.get("name") as string) ?? "").trim();
  const customerRaw = ((formData.get("customerId") as string) ?? "").trim();
  const valueRaw = ((formData.get("projectValue") as string) ?? "")
    .trim()
    .replace(/\s+/g, "");
  const startRaw = ((formData.get("startDate") as string) ?? "").trim();
  const endRaw = ((formData.get("endDate") as string) ?? "").trim();
  const status = ((formData.get("status") as string) ?? "").trim();
  const notes = ((formData.get("notes") as string) ?? "").trim();

  if (!name) {
    return { values: null, error: "Nama proyek wajib diisi." };
  }
  if (name.length > MAX_LENGTHS.name) {
    return {
      values: null,
      error: `Nama proyek maksimal ${MAX_LENGTHS.name} karakter.`,
    };
  }

  if (!customerRaw) {
    return { values: null, error: "Pelanggan wajib dipilih." };
  }
  let customerId: bigint;
  if (/^\d+$/.test(customerRaw)) {
    try {
      customerId = BigInt(customerRaw);
    } catch {
      return { values: null, error: "Pelanggan tidak ditemukan." };
    }
  } else {
    return { values: null, error: "Pelanggan tidak ditemukan." };
  }

  if (!valueRaw) {
    return { values: null, error: "Nilai proyek wajib diisi." };
  }
  if (
    !/^\d{1,13}(\.\d{1,2})?$/.test(valueRaw) ||
    Number(valueRaw) <= 0
  ) {
    return { values: null, error: "Nilai proyek tidak valid." };
  }

  if (!startRaw) {
    return { values: null, error: "Tanggal mulai wajib diisi." };
  }
  const startDate = parseDateOnly(startRaw);
  if (!startDate) {
    return { values: null, error: "Tanggal mulai tidak valid." };
  }

  let endDate: Date | null = null;
  if (endRaw) {
    endDate = parseDateOnly(endRaw);
    if (!endDate) {
      return { values: null, error: "Tanggal selesai tidak valid." };
    }
    if (endDate.getTime() < startDate.getTime()) {
      return {
        values: null,
        error: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
      };
    }
  }

  if (!VALID_STATUSES.includes(status as ProjectStatus)) {
    return { values: null, error: "Status proyek tidak valid." };
  }

  if (notes.length > MAX_LENGTHS.notes) {
    return {
      values: null,
      error: `Catatan maksimal ${MAX_LENGTHS.notes} karakter.`,
    };
  }

  return {
    values: {
      name,
      customerId,
      projectValue: valueRaw,
      startDate,
      endDate,
      status: status as ProjectStatus,
      notes: notes ? notes : null,
    },
    error: null,
  };
}

// Kepemilikan pelanggan diverifikasi di server: hanya pelanggan milik
// session yang boleh dipakai, sehingga input customerId dari client
// tidak dapat menempelkan proyek ke pelanggan pengguna lain.
async function customerOwnedByUser(
  customerId: bigint,
  userId: bigint,
): Promise<boolean> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId },
    select: { id: true },
  });
  return customer !== null;
}

export async function createProject(
  _state: ProjectState | null,
  formData: FormData,
): Promise<ProjectState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { values, error } = readAndValidate(formData);
  if (error || !values) {
    return { error: error ?? "Validasi gagal. Periksa kembali input Anda." };
  }

  // userId berasal dari session server, bukan dari input client.
  const userId = BigInt(session.user.id);

  if (!(await customerOwnedByUser(values.customerId, userId))) {
    return { error: "Pelanggan tidak ditemukan." };
  }

  let project;
  try {
    project = await prisma.project.create({
      data: {
        userId,
        customerId: values.customerId,
        name: values.name,
        projectValue: values.projectValue,
        startDate: values.startDate,
        endDate: values.endDate,
        status: values.status,
        notes: values.notes,
      },
    });
  } catch {
    return { error: "Gagal menyimpan proyek. Silakan coba lagi." };
  }

  revalidatePath("/projects");
  revalidatePath("/");
  redirect(`/projects/${project.id.toString()}`);
}

export async function updateProject(
  _state: ProjectState | null,
  formData: FormData,
): Promise<ProjectState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const projectId = parseBigInt(formData, "projectId");
  if (!projectId) {
    return { error: "Proyek tidak ditemukan." };
  }

  const { values, error } = readAndValidate(formData);
  if (error || !values) {
    return { error: error ?? "Validasi gagal. Periksa kembali input Anda." };
  }

  const userId = BigInt(session.user.id);

  if (!(await customerOwnedByUser(values.customerId, userId))) {
    return { error: "Pelanggan tidak ditemukan." };
  }

  // Kepemilikan proyek diverifikasi sebagai bagian dari operasi database:
  // hanya baris dengan id DAN userId milik session yang diperbarui.
  let result;
  try {
    result = await prisma.project.updateMany({
      where: { id: projectId, userId },
      data: {
        customerId: values.customerId,
        name: values.name,
        projectValue: values.projectValue,
        startDate: values.startDate,
        endDate: values.endDate,
        status: values.status,
        notes: values.notes,
        updatedAt: new Date(),
      },
    });
  } catch {
    return { error: "Gagal menyimpan perubahan. Silakan coba lagi." };
  }

  if (result.count === 0) {
    return { error: "Proyek tidak ditemukan." };
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId.toString()}`);
  revalidatePath(`/projects/${projectId.toString()}/edit`);
  revalidatePath("/");
  return { success: true };
}

export async function deleteProject(
  _state: ProjectState | null,
  formData: FormData,
): Promise<ProjectState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const projectId = parseBigInt(formData, "projectId");
  if (!projectId) {
    return { error: "Proyek tidak ditemukan." };
  }

  const userId = BigInt(session.user.id);

  // Verifikasi kepemilikan terlebih dahulu; proyek yang tidak dimiliki
  // atau tidak ada menerima pesan yang sama agar tidak bocor.
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) {
    return { error: "Proyek tidak ditemukan." };
  }

  // Jangan pernah menghapus proyek yang masih memiliki invoice atau
  // pengeluaran — keduanya menggunakan ON DELETE RESTRICT.
  const [invoiceCount, expenseCount] = await Promise.all([
    prisma.invoice.count({ where: { projectId } }),
    prisma.expense.count({ where: { projectId } }),
  ]);
  if (invoiceCount > 0 || expenseCount > 0) {
    const parts: string[] = [];
    if (invoiceCount > 0) {
      parts.push(`${invoiceCount} invoice`);
    }
    if (expenseCount > 0) {
      parts.push(`${expenseCount} pengeluaran`);
    }
    return {
      error: `Proyek ini masih memiliki ${parts.join(" dan ")}. Hapus catatan terkait terlebih dahulu sebelum menghapus proyek.`,
    };
  }

  try {
    await prisma.project.delete({ where: { id: projectId } });
  } catch (error) {
    // Perlombaan: invoice/pengeluaran baru ditambahkan antara pengecekan
    // dan penghapusan.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return {
        error:
          "Proyek ini masih memiliki catatan terkait. Hapus catatan terkait terlebih dahulu sebelum menghapus proyek.",
      };
    }
    return { error: "Gagal menghapus proyek. Silakan coba lagi." };
  }

  revalidatePath("/projects");
  revalidatePath("/");
  redirect("/projects");
}
