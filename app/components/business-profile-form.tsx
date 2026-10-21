"use client";

import { useActionState } from "react";
import { saveBusinessProfile } from "@/app/actions/business-profile";
import type { BusinessProfile } from "@/app/generated/prisma/client";

interface BusinessProfileFormProps {
  profile: BusinessProfile | null;
}

const inputClass =
  "h-11 w-full rounded-md border border-black/[.08] bg-white px-3 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50";
const labelClass = "text-sm font-medium text-black dark:text-zinc-50";

export default function BusinessProfileForm({ profile }: BusinessProfileFormProps) {
  const [state, formAction, isPending] = useActionState(saveBusinessProfile, null);

  return (
    <form
      action={formAction}
      noValidate
      className="flex w-full max-w-xl flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Business Profile
      </h1>

      {state?.error ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      {state?.success ? (
        <p
          role="status"
          className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
        >
          Profil bisnis tersimpan.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="businessName" className={labelClass}>
          Nama Bisnis <span aria-hidden="true">*</span>
        </label>
        <input
          id="businessName"
          name="businessName"
          type="text"
          required
          maxLength={100}
          autoComplete="organization"
          defaultValue={profile?.businessName ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="address" className={labelClass}>
          Alamat
        </label>
        <input
          id="address"
          name="address"
          type="text"
          maxLength={200}
          autoComplete="street-address"
          defaultValue={profile?.address ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className={labelClass}>
          Telepon
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          maxLength={30}
          autoComplete="tel"
          defaultValue={profile?.phone ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          maxLength={100}
          autoComplete="email"
          defaultValue={profile?.email ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="taxId" className={labelClass}>
          NPWP / Tax ID
        </label>
        <input
          id="taxId"
          name="taxId"
          type="text"
          maxLength={50}
          defaultValue={profile?.taxId ?? ""}
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="h-11 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {isPending ? "Menyimpan…" : "Simpan"}
      </button>
    </form>
  );
}
