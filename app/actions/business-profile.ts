"use server";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface BusinessProfileState {
  error?: string;
  success?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_LENGTHS = {
  businessName: 100,
  address: 200,
  phone: 30,
  email: 100,
  taxId: 50,
} as const;

interface ProfileValues {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
}

function readAndValidate(
  formData: FormData,
): { values: ProfileValues | null; error: string | null } {
  const businessName = ((formData.get("businessName") as string) ?? "").trim();
  const address = ((formData.get("address") as string) ?? "").trim();
  const phone = ((formData.get("phone") as string) ?? "").trim();
  const email = ((formData.get("email") as string) ?? "").trim();
  const taxId = ((formData.get("taxId") as string) ?? "").trim();

  if (!businessName) {
    return { values: null, error: "Nama bisnis wajib diisi." };
  }
  if (businessName.length > MAX_LENGTHS.businessName) {
    return {
      values: null,
      error: `Nama bisnis maksimal ${MAX_LENGTHS.businessName} karakter.`,
    };
  }
  if (address.length > MAX_LENGTHS.address) {
    return {
      values: null,
      error: `Alamat maksimal ${MAX_LENGTHS.address} karakter.`,
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
  if (taxId.length > MAX_LENGTHS.taxId) {
    return {
      values: null,
      error: `NPWP / Tax ID maksimal ${MAX_LENGTHS.taxId} karakter.`,
    };
  }

  return { values: { businessName, address, phone, email, taxId }, error: null };
}

export async function saveBusinessProfile(
  _state: BusinessProfileState | null,
  formData: FormData,
): Promise<BusinessProfileState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { values, error } = readAndValidate(formData);
  if (error || !values) {
    return { error: error ?? "Validasi gagal. Periksa kembali input Anda." };
  }

  // userId berasal dari session server, bukan dari input client.
  // upsert pada unique key userId bersifat atomik sehingga tidak pernah
  // membuat profil duplikat, baik saat profil sudah ada maupun belum.
  const userId = BigInt(session.user.id);

  await prisma.businessProfile.upsert({
    where: { userId },
    update: { ...values, updatedAt: new Date() },
    create: { userId, ...values },
  });

  // Pastikan server component halaman ini mengambil data terbaru setelah aksi,
  // sehingga formulir menampilkan nilai yang baru disimpan (bukan nilai lama).
  revalidatePath("/business-profile");

  return { success: true };
}
