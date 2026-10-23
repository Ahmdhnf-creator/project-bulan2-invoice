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
    await signIn("credentials", { email, password, redirect: false });
  } catch {
    return { error: "Akun berhasil dibuat. Silakan login." };
  }
  redirect("/");
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
