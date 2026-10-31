"use client";

import { useActionState, useState } from "react";
import type { InvoiceStatus } from "@/app/generated/prisma/client";
import type { InvoiceState } from "@/app/actions/invoice";
import { INVOICE_STATUS_LABEL } from "@/app/lib/format";

// Nilai serializable dari server (Prisma.Decimal tidak aman dikirim
// ke client component) untuk prefill form edit.
export interface InvoiceFormValues {
  id: string;
  invoiceNumber: string;
  projectId: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  taxRate: string;
  notes: string;
}

export interface InvoiceItemRow {
  description: string;
  quantity: string;
  unitPrice: string;
}

interface InvoiceFormProps {
  action: (
    state: InvoiceState | null,
    formData: FormData,
  ) => Promise<InvoiceState>;
  invoice: InvoiceFormValues | null;
  items: InvoiceItemRow[];
  projects: { id: string; name: string }[];
  submitLabel: string;
}

const inputClass =
  "h-11 w-full rounded-md border border-black/[.08] bg-white px-3 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50";
const labelClass = "text-sm font-medium text-black dark:text-zinc-50";

// Angka dari database (mis. "500000.00") dinormalkan agar bersih di
// input (mis. "500000").
function toInputNumber(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

const emptyRow: InvoiceItemRow = {
  description: "",
  quantity: "",
  unitPrice: "",
};

export default function InvoiceForm({
  action,
  invoice,
  items,
  projects,
  submitLabel,
}: InvoiceFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [rows, setRows] = useState<InvoiceItemRow[]>(() =>
    items.length > 0 ? items : [emptyRow],
  );

  const updateRow = (index: number, field: keyof InvoiceItemRow, value: string) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const addRow = () => setRows((prev) => [...prev, { ...emptyRow }]);
  const removeRow = (index: number) =>
    setRows((prev) => prev.filter((_, i) => i !== index));

  return (
    <form
      action={formAction}
      noValidate
      className="flex w-full max-w-2xl flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {invoice ? (
        <input type="hidden" name="invoiceId" value={invoice.id} />
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
          Invoice tersimpan.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="invoiceNumber" className={labelClass}>
          Nomor Invoice <span aria-hidden="true">*</span>
        </label>
        <input
          id="invoiceNumber"
          name="invoiceNumber"
          type="text"
          required
          maxLength={50}
          placeholder="mis. INV-2026-0002"
          defaultValue={invoice?.invoiceNumber ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="projectId" className={labelClass}>
          Proyek <span aria-hidden="true">*</span>
        </label>
        <select
          id="projectId"
          name="projectId"
          required
          defaultValue={invoice?.projectId ?? ""}
          className={inputClass}
        >
          <option value="" disabled>
            Pilih proyek
          </option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="issueDate" className={labelClass}>
            Tanggal Terbit <span aria-hidden="true">*</span>
          </label>
          <input
            id="issueDate"
            name="issueDate"
            type="date"
            required
            defaultValue={invoice?.issueDate ?? ""}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="dueDate" className={labelClass}>
            Tanggal Jatuh Tempo <span aria-hidden="true">*</span>
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            required
            defaultValue={invoice?.dueDate ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className={labelClass}>
            Status <span aria-hidden="true">*</span>
          </label>
          <select
            id="status"
            name="status"
            required
            defaultValue={invoice?.status ?? "UNPAID"}
            className={inputClass}
          >
            {(
              Object.entries(INVOICE_STATUS_LABEL) as [
                keyof typeof INVOICE_STATUS_LABEL,
                string,
              ][]
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="taxRate" className={labelClass}>
            Pajak (%)
          </label>
          <input
            id="taxRate"
            name="taxRate"
            type="text"
            inputMode="decimal"
            placeholder="mis. 11"
            defaultValue={invoice ? toInputNumber(invoice.taxRate) : ""}
            className={inputClass}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
        <legend className={`px-1 ${labelClass}`}>
          Item <span aria-hidden="true">*</span>
        </legend>

        {rows.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-1 gap-3 rounded-md border border-zinc-100 p-3 dark:border-zinc-800 sm:grid-cols-[1fr_7rem_9rem_auto]"
          >
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor={`itemDescription-${index}`}>
                Deskripsi
              </label>
              <input
                id={`itemDescription-${index}`}
                name="itemDescription"
                type="text"
                required
                maxLength={500}
                placeholder="Deskripsi pekerjaan"
                value={row.description}
                onChange={(e) => updateRow(index, "description", e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor={`itemQuantity-${index}`}>
                Kuantitas
              </label>
              <input
                id={`itemQuantity-${index}`}
                name="itemQuantity"
                type="text"
                inputMode="decimal"
                required
                placeholder="1"
                value={row.quantity}
                onChange={(e) => updateRow(index, "quantity", e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor={`itemUnitPrice-${index}`}>
                Harga Satuan (Rp)
              </label>
              <input
                id={`itemUnitPrice-${index}`}
                name="itemUnitPrice"
                type="text"
                inputMode="decimal"
                required
                placeholder="mis. 1000000"
                value={row.unitPrice}
                onChange={(e) => updateRow(index, "unitPrice", e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Hapus Item
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="inline-flex h-10 items-center justify-center self-start rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Tambah Item
        </button>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className={labelClass}>
          Catatan
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={1000}
          defaultValue={invoice?.notes ?? ""}
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
