"use client";

import { useActionState } from "react";
import type { PaymentState } from "@/app/actions/payment";

// Nilai serializable dari server (Prisma.Decimal tidak aman dikirim ke
// client component) untuk prefill form edit.
export interface PaymentFormValues {
  id: string;
  amount: string;
  paymentDate: string;
  method: string;
  notes: string;
}

interface PaymentFormProps {
  action: (
    state: PaymentState | null,
    formData: FormData,
  ) => Promise<PaymentState>;
  payment: PaymentFormValues | null;
  // Nomor invoice hanya ditampilkan saat edit — invoice tidak bisa dipindah.
  invoiceNumber?: string;
  // Untuk form create: pilihan invoice milik session + prapilihan dari
  // query ?invoice=<id> (mis. dari tombol "Catat Pembayaran").
  invoices?: { id: string; number: string }[];
  defaultInvoiceId?: string;
  submitLabel: string;
}

const inputClass =
  "h-11 w-full rounded-md border border-black/[.08] bg-white px-3 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50";
const labelClass = "text-sm font-medium text-black dark:text-zinc-50";

// Nilai Decimal dari database (mis. "400000.00") dinormalkan agar
// bersih di input (mis. "400000").
function toInputNumber(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

function toDateInput(date: string | null | undefined): string {
  if (!date) {
    return "";
  }
  return date.slice(0, 10);
}

export default function PaymentForm({
  action,
  payment,
  invoiceNumber,
  invoices = [],
  defaultInvoiceId,
  submitLabel,
}: PaymentFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form
      action={formAction}
      noValidate
      className="flex w-full max-w-xl flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {payment ? (
        <input type="hidden" name="paymentId" value={payment.id} />
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
          Pembayaran tersimpan.
        </p>
      ) : null}

      {payment ? (
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Invoice</span>
          <p className="flex h-11 items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 font-medium dark:border-zinc-700 dark:bg-zinc-800">
            {invoiceNumber}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invoiceId" className={labelClass}>
            Invoice <span aria-hidden="true">*</span>
          </label>
          <select
            id="invoiceId"
            name="invoiceId"
            required
            defaultValue={defaultInvoiceId ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Pilih invoice
            </option>
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.number}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="amount" className={labelClass}>
          Jumlah Pembayaran (Rp) <span aria-hidden="true">*</span>
        </label>
        <input
          id="amount"
          name="amount"
          type="text"
          inputMode="decimal"
          required
          placeholder="mis. 400000"
          defaultValue={payment ? toInputNumber(payment.amount) : ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="paymentDate" className={labelClass}>
          Tanggal Pembayaran <span aria-hidden="true">*</span>
        </label>
        <input
          id="paymentDate"
          name="paymentDate"
          type="date"
          required
          defaultValue={toDateInput(payment?.paymentDate)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="method" className={labelClass}>
          Metode Pembayaran
        </label>
        <input
          id="method"
          name="method"
          type="text"
          maxLength={50}
          placeholder="mis. Bank transfer, Tunai"
          defaultValue={payment?.method ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className={labelClass}>
          Catatan / Referensi
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={1000}
          defaultValue={payment?.notes ?? ""}
          className="w-full rounded-md border border-black/[.08] bg-white px-3 py-2 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
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
