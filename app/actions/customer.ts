"use server";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface CustomerState {
  error?: string;
  success?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_LENGTHS = {
  name: 100,
  address: 200,
  phone: 30,
  email: 100,
} as const;

interface CustomerValues {
  name: string;
  phone: string;
  email: string;
  address: string;
}

function readAndValidate(
  formData: FormData,
): { values: CustomerValues | null; error: string | null } {
  const name = ((formData.get("name") as string) ?? "").trim();
  const phone = ((formData.get("phone") as string) ?? "").trim();
  const email = ((formData.get("email") as string) ?? "").trim();
  const address = ((formData.get("address") as string) ?? "").trim();

  if (!name) {
    return { values: null, error: "Nama pelanggan wajib diisi." };
  }
  if (name.length > MAX_LENGTHS.name) {
    return {
      values: null,
      error: `Nama pelanggan maksimal ${MAX_LENGTHS.name} karakter.`,
    };
  }
  if (phone.length > MAX_LENGTHS.phone) {
    return {
      values: null,
      error: `Telepon maksimal ${MAX_LENGTHS.phone} karakter.`,
    };
  }
  if (email.length > MAX_LENGTHS.email) {
    return {
      values: null,
      error: `Email maksimal ${MAX_LENGTHS.email} karakter.`,
    };
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    return { values: null, error: "Format email tidak valid." };
  }
  if (address.length > MAX_LENGTHS.address) {
    return {
      values: null,
      error: `Alamat maksimal ${MAX_LENGTHS.address} karakter.`,
    };
  }

  return { values: { name, phone, email, address }, error: null };
}

function parseCustomerId(formData: FormData): bigint | null {
  const raw = ((formData.get("customerId") as string) ?? "").trim();
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export async function createCustomer(
  _state: CustomerState | null,
  formData: FormData,
): Promise<CustomerState> {
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

  let customer;
  try {
    customer = await prisma.customer.create({ data: { userId, ...values } });
  } catch {
    return { error: "Gagal menyimpan pelanggan. Silakan coba lagi." };
  }

  revalidatePath("/customers");
  revalidatePath("/");
  redirect(`/customers/${customer.id.toString()}`);
}

export async function updateCustomer(
  _state: CustomerState | null,
  formData: FormData,
): Promise<CustomerState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const customerId = parseCustomerId(formData);
  if (!customerId) {
    return { error: "Pelanggan tidak ditemukan." };
  }

  const { values, error } = readAndValidate(formData);
  if (error || !values) {
    return { error: error ?? "Validasi gagal. Periksa kembali input Anda." };
  }

  // Kepemilikan diverifikasi sebagai bagian dari operasi database:
  // hanya baris dengan id DAN userId milik session yang diperbarui,
  // sehingga manipulasi customerId dari client tidak dapat mengubah
  // pelanggan pengguna lain.
  const userId = BigInt(session.user.id);

  let result;
  try {
    result = await prisma.customer.updateMany({
      where: { id: customerId, userId },
      data: { ...values, updatedAt: new Date() },
    });
  } catch {
    return { error: "Gagal menyimpan perubahan. Silakan coba lagi." };
  }

  if (result.count === 0) {
    return { error: "Pelanggan tidak ditemukan." };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId.toString()}`);
  revalidatePath(`/customers/${customerId.toString()}/edit`);
  revalidatePath("/");
  return { success: true };
}

export async function deleteCustomer(
  _state: CustomerState | null,
  formData: FormData,
): Promise<CustomerState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const customerId = parseCustomerId(formData);
  if (!customerId) {
    return { error: "Pelanggan tidak ditemukan." };
  }

  const userId = BigInt(session.user.id);

  // Verifikasi kepemilikan terlebih dahulu; pelanggan yang tidak dimiliki
  // atau tidak ada menerima pesan yang sama agar tidak bocor.
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId },
    select: { id: true },
  });
  if (!customer) {
    return { error: "Pelanggan tidak ditemukan." };
  }

  // Jangan pernah menghapus pelanggan yang masih memiliki proyek —
  // Project.customerId menggunakan ON DELETE RESTRICT.
  const projectCount = await prisma.project.count({
    where: { customerId, userId },
  });
  if (projectCount > 0) {
    return {
      error: `Pelanggan ini masih memiliki ${projectCount} proyek. Hapus proyek terkait terlebih dahulu sebelum menghapus pelanggan.`,
    };
  }

  try {
    await prisma.customer.delete({ where: { id: customerId } });
  } catch (error) {
    // Perlombaan: proyek baru ditambahkan antara pengecekan dan penghapusan.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return {
        error:
          "Pelanggan ini masih memiliki proyek terkait. Hapus proyek terkait terlebih dahulu sebelum menghapus pelanggan.",
      };
    }
    return { error: "Gagal menghapus pelanggan. Silakan coba lagi." };
  }

  revalidatePath("/customers");
  revalidatePath("/");
  redirect("/customers");
}
