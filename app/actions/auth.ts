"use server";

import { signIn, signOut } from "@/app/lib/auth";
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
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return { error: "Invalid email or password." };
    }
    throw error;
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
