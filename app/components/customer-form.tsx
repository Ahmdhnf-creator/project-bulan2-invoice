"use client";

import { useActionState } from "react";
import type { CustomerState } from "@/app/actions/customer";

// DTO serializable yang dikirim dari Server Component ke Client Component.
// ID dikirim sebagai string agar aman diserialisasi dalam payload RSC
// (Prisma BigInt tidak diperbolehkan).
export interface CustomerFormValues {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

interface CustomerFormProps {
  action: (
    state: CustomerState | null,
    formData: FormData,
  ) => Promise<CustomerState>;
  customer: CustomerFormValues | null;
  submitLabel: string;
}

const inputClass =
  "h-11 w-full rounded-md border border-black/[.08] bg-white px-3 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50";
const labelClass = "text-sm font-medium text-black dark:text-zinc-50";

export default function CustomerForm({
  action,
  customer,
  submitLabel,
}: CustomerFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form
      action={formAction}
      noValidate
      className="flex w-full max-w-xl flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {customer ? (
        <input type="hidden" name="customerId" value={customer.id} />
      ) : null}

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
          Pelanggan tersimpan.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={labelClass}>
          Nama Pelanggan <span aria-hidden="true">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          autoComplete="organization"
          defaultValue={customer?.name ?? ""}
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
          defaultValue={customer?.phone ?? ""}
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
          defaultValue={customer?.email ?? ""}
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
          defaultValue={customer?.address ?? ""}
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full sm:w-auto h-11 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {isPending ? "Menyimpan…" : submitLabel}
      </button>
    </form>
  );
}
