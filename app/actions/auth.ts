"use server";

import { signIn, signOut } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { hash as argon2Hash } from "@node-rs/argon2";
import { CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export interface LoginState {
  error?: string;
}

export async function login(
  _state: LoginState | null,
  formData: FormData,
): Promise<LoginState | null> {
  const emailRaw = formData.get("email");
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
  const passwordRaw = formData.get("password");
  const password = typeof passwordRaw === "string" ? passwordRaw : "";

  if (!email || !password) {
    return { error: "Email atau password salah." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit." };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return { error: "Email atau password salah." };
    }
    return { error: "Login gagal. Silakan coba lagi." };
  }
  return null;
}

export interface RegisterState {
  error?: string;
  success?: string;
}

export async function register(
  _state: RegisterState | null,
  formData: FormData,
): Promise<RegisterState | null> {
  const fullNameRaw = formData.get("fullName");
  const fullName = typeof fullNameRaw === "string" ? fullNameRaw.trim() : "";
  const emailRaw = formData.get("email");
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
  const passwordRaw = formData.get("password");
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  const confirmRaw = formData.get("confirmPassword");
  const confirm = typeof confirmRaw === "string" ? confirmRaw : "";

  if (fullName.length < 2) return { error: "Nama lengkap wajib diisi." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email tidak valid." };
  if (!password || password.length < 8) return { error: "Password minimal 8 karakter." };
  if (password !== confirm) return { error: "Konfirmasi password tidak sama." };

  try {
    const passwordHash = await argon2Hash(password);
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
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return { success: "Akun berhasil dibuat. Silakan login." };
    }
    return { error: "Akun berhasil dibuat, tetapi login otomatis gagal. Silakan login manual." };
  }
  return null;
}

export async function logout() {
  await signOut({ redirect: false });
  // signOut (next-auth 5 beta) mengirim cookie clear, tetapi response RSC
  // paralel (rolling refresh) bisa menimpanya sehingga sesi hidup lagi.
  // Paksa hapus cookie sesi sebagai Set-Cookie final dari action ini.
  const cookieJar = await cookies();
  for (const c of cookieJar.getAll()) {
    if (c.name.endsWith("session-token")) {
      cookieJar.delete(c.name);
    }
  }
  redirect("/login");
}
