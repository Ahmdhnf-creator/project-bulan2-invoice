"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { register } from "@/app/actions/auth";
import {
  IconEye,
  IconEyeOff,
  IconKey,
  IconMail,
  IconUser,
} from "@/app/components/icons";

const inputClass =
  "h-12 w-full rounded-full border border-transparent bg-[#e6e6e6] pl-12 text-[#103a35] placeholder:text-[#8a938d] focus:border-[#13836d] focus:outline-none focus:ring-2 focus:ring-[#13836d]/30 sm:h-14 lg:h-[3.04cqw] lg:pl-[3.85cqw] lg:pr-[1.4cqw] lg:text-[1.2cqw]";
const iconClass =
  "pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6b7a70] sm:left-5 lg:left-[1.49cqw] lg:h-[1.12cqw] lg:w-[1.12cqw]";
const eyeClass =
  "absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[#6b7a70] transition-colors hover:text-[#103a35] sm:right-4 lg:right-[1.1cqw]";
const eyeIconClass = "h-5 w-5 lg:h-[1.12cqw] lg:w-[1.12cqw]";

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(register, null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setValues((previous) => ({ ...previous, [name]: value }));
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white p-4 sm:p-8">
      <div className="@container w-full max-w-[1120px]">
        <div className="relative w-full overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_80px_-40px_rgba(16,58,53,0.45)] ring-1 ring-black/[.04] lg:min-h-[60.7cqw]">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58.4cqw] lg:block">
            <Image
              src="/login-panel.png"
              alt=""
              fill
              sizes="(min-width: 1024px) 55vw, 0px"
              className="object-fill"
              priority
            />
            <Image
              src="/login-illustration.png"
              alt=""
              width={1759}
              height={1173}
              sizes="(min-width: 1024px) 55vw, 0px"
              className="absolute left-[3.34%] top-[25.2%] h-auto w-[93.4%] max-w-none"
              priority
            />
          </div>

          <div className="relative z-10 flex flex-col px-7 py-9 sm:px-12 sm:py-12 lg:w-[46cqw] lg:px-0 lg:pb-0 lg:pl-[5cqw] lg:pt-[4.8cqw]">
            <Link href="/" className="flex items-center gap-2.5 self-start">
              <Image
                src="/artha-logo-13836d.png"
                alt=""
                width={282}
                height={242}
                className="h-8 w-auto lg:h-[2.48cqw]"
                priority
              />
              <span className="text-2xl font-bold tracking-tight text-[#103a35] lg:text-[2.85cqw] lg:leading-none">
                Artha
              </span>
            </Link>

            <div className="mt-8 lg:mt-[11.85cqw]">
              <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-[#103a35] sm:text-3xl lg:text-[2.6cqw] lg:leading-[1.05]">
                Buat akun Artha
              </h1>
              <p className="mt-1.5 text-sm italic text-[#6b7a70] lg:mt-0 lg:text-[1.3cqw] lg:leading-[1.5]">
                Lengkapi informasi di bawah ini untuk mendaftar
              </p>

              <form
                action={formAction}
                className="mt-7 flex flex-col gap-3.5 sm:mt-8 sm:gap-4 lg:mt-[2.7cqw] lg:w-[26.4cqw] lg:gap-[0.87cqw]"
              >
                {state?.error ? (
                  <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 lg:text-[1.05cqw]">
                    {state.error}
                  </p>
                ) : null}

                {state?.success ? (
                  <p className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 lg:text-[1.05cqw]">
                    {state.success}
                  </p>
                ) : null}

                <div className="relative">
                  <IconUser className={iconClass} />
                  <label htmlFor="fullName" className="sr-only">
                    Nama lengkap
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="Nama lengkap"
                    value={values.fullName}
                    onChange={handleChange}
                    className={`${inputClass} pr-5`}
                  />
                </div>

                <div className="relative">
                  <IconMail className={iconClass} />
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
                    value={values.email}
                    onChange={handleChange}
                    className={`${inputClass} pr-5`}
                  />
                </div>

                <div className="relative">
                  <IconKey className={iconClass} />
                  <label htmlFor="password" className="sr-only">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Password"
                    value={values.password}
                    onChange={handleChange}
                    className={`${inputClass} pr-12 lg:pr-[3.6cqw]`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={
                      showPassword
                        ? "Sembunyikan password"
                        : "Tampilkan password"
                    }
                    className={eyeClass}
                  >
                    {showPassword ? (
                      <IconEyeOff className={eyeIconClass} />
                    ) : (
                      <IconEye className={eyeIconClass} />
                    )}
                  </button>
                </div>

                <div className="relative">
                  <IconKey className={iconClass} />
                  <label htmlFor="confirmPassword" className="sr-only">
                    Konfirmasi password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    placeholder="Konfirmasi password"
                    value={values.confirmPassword}
                    onChange={handleChange}
                    className={`${inputClass} pr-12 lg:pr-[3.6cqw]`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((value) => !value)}
                    aria-label={
                      showConfirm
                        ? "Sembunyikan konfirmasi password"
                        : "Tampilkan konfirmasi password"
                    }
                    className={eyeClass}
                  >
                    {showConfirm ? (
                      <IconEyeOff className={eyeIconClass} />
                    ) : (
                      <IconEye className={eyeIconClass} />
                    )}
                  </button>
                </div>

                <div className="mt-1.5 flex items-center gap-5 sm:mt-2 lg:mt-[5.78cqw] lg:gap-[3.35cqw]">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex h-12 min-w-[8.5rem] items-center justify-center rounded-full bg-[#103a35] px-8 text-sm font-semibold text-white transition-colors hover:bg-[#0c2e29] disabled:opacity-60 sm:h-14 lg:h-[3.1cqw] lg:w-[16.5cqw] lg:min-w-0 lg:px-0 lg:text-[1.2cqw]"
                  >
                    {isPending ? "Memproses…" : "Daftar"}
                  </button>
                  <Link
                    href="/login"
                    className="text-sm font-semibold text-[#103a35] hover:underline lg:text-[1.2cqw]"
                  >
                    Masuk
                  </Link>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
