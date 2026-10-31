"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { login, type LoginState } from "@/app/actions/auth";
import { IconEye, IconEyeOff, IconKey, IconMail } from "@/app/components/icons";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<LoginState | null, FormData>(
    login,
    null,
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white p-4 sm:p-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_80px_-40px_rgba(16,58,53,0.45)] ring-1 ring-black/[.06] lg:min-h-[560px] lg:grid-cols-2">
        <div className="flex flex-col p-8 sm:p-12">
          <Link href="/" className="flex items-center gap-2.5 self-start">
            <Image
              src="/artha-logo-13836d.png"
              alt=""
              width={84}
              height={72}
              className="h-7 w-auto"
              priority
            />
            <span className="text-2xl font-bold tracking-tight text-[#103a35]">
              Artha
            </span>
          </Link>

          <div className="flex flex-1 flex-col justify-center py-10">
            <div className="w-full max-w-[24rem]">
              <h1 className="text-3xl font-semibold tracking-tight text-[#103a35]">
                Selamat datang di sistem login
              </h1>
              <p className="mt-2 text-sm italic text-[#6b7a70]">
                Masuk dengan memasukkan informasi di bawah ini
              </p>

              <form action={formAction} className="mt-8 flex flex-col gap-4">
                {state?.error ? (
                  <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
                    {state.error}
                  </p>
                ) : null}

                <div className="relative">
                  <IconMail className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6b7a70]" />
                  <label htmlFor="email" className="sr-only">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="Email"
                    className="h-14 w-full rounded-full border border-transparent bg-[#e6e6e6] pl-14 pr-5 text-[#103a35] placeholder:text-[#8a938d] focus:border-[#13836d] focus:outline-none focus:ring-2 focus:ring-[#13836d]/30"
                  />
                </div>

                <div className="relative">
                  <IconKey className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6b7a70]" />
                  <label htmlFor="password" className="sr-only">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="Password"
                    className="h-14 w-full rounded-full border border-transparent bg-[#e6e6e6] pl-14 pr-14 text-[#103a35] placeholder:text-[#8a938d] focus:border-[#13836d] focus:outline-none focus:ring-2 focus:ring-[#13836d]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={
                      showPassword
                        ? "Sembunyikan password"
                        : "Tampilkan password"
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[#6b7a70] transition-colors hover:text-[#103a35]"
                  >
                    {showPassword ? (
                      <IconEyeOff className="h-5 w-5" />
                    ) : (
                      <IconEye className="h-5 w-5" />
                    )}
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-5">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex h-14 min-w-[9rem] items-center justify-center rounded-full bg-[#103a35] px-10 text-sm font-semibold text-white transition-colors hover:bg-[#0c2e29] disabled:opacity-60"
                  >
                    {isPending ? "Memproses…" : "Masuk"}
                  </button>
                  <Link
                    href="/register"
                    className="text-sm font-semibold text-[#103a35] hover:underline"
                  >
                    Daftar
                  </Link>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="relative hidden overflow-hidden bg-[#103a35] lg:block">
          <Image
            src="/login-illustration.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain p-6"
            priority
          />
        </div>
      </div>
    </div>
  );
}
