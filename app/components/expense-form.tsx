"use client";

import { useActionState } from "react";
import type { ExpenseState } from "@/app/actions/expense";
import { EXPENSE_CATEGORIES } from "@/app/lib/format";

// Nilai serializable dari server (Prisma.Decimal tidak aman dikirim ke
// client component) untuk prefill form edit.
export interface ExpenseFormValues {
  id: string;
  projectId: string;
  description: string;
  amount: string;
  date: string;
  category: string;
  notes: string;
}

interface ExpenseFormProps {
  action: (
    state: ExpenseState | null,
    formData: FormData,
  ) => Promise<ExpenseState>;
  expense: ExpenseFormValues | null;
  // Pilihan proyek milik session — tampil saat create DAN edit
  // (pengeluaran boleh dipindah antar proyek lewat edit).
  projects: { id: string; name: string }[];
  // Prapilihan dari query ?project=<id> (mis. dari tombol "Catat Pengeluaran").
  defaultProjectId?: string;
  submitLabel: string;
}

const inputClass =
  "h-11 w-full rounded-md border border-black/[.08] bg-white px-3 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50";
const labelClass = "text-sm font-medium text-black dark:text-zinc-50";

// Nilai Decimal dari database (mis. "2500000.00") dinormalkan agar
// bersih di input (mis. "2500000").
function toInputNumber(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

function toDateInput(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

export default function ExpenseForm({
  action,
  expense,
  projects = [],
  defaultProjectId,
  submitLabel,
}: ExpenseFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form
      action={formAction}
      noValidate
      className="flex w-full max-w-xl flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {expense ? (
        <input type="hidden" name="expenseId" value={expense.id} />
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
          Pengeluaran tersimpan.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="projectId" className={labelClass}>
          Proyek <span aria-hidden="true">*</span>
        </label>
        <select
          id="projectId"
          name="projectId"
          required
          defaultValue={expense ? expense.projectId : (defaultProjectId ?? "")}
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={labelClass}>
          Deskripsi <span aria-hidden="true">*</span>
        </label>
        <input
          id="description"
          name="description"
          type="text"
          required
          maxLength={500}
          placeholder="mis. Bibit tanaman hias"
          defaultValue={expense?.description ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="amount" className={labelClass}>
          Jumlah (Rp) <span aria-hidden="true">*</span>
        </label>
        <input
          id="amount"
          name="amount"
          type="text"
          inputMode="decimal"
          required
          placeholder="mis. 2500000"
          defaultValue={expense ? toInputNumber(expense.amount) : ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="date" className={labelClass}>
          Tanggal <span aria-hidden="true">*</span>
        </label>
        <input
          id="date"
          name="date"
          type="date"
          required
          defaultValue={toDateInput(expense?.date)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="category" className={labelClass}>
          Kategori <span aria-hidden="true">*</span>
        </label>
        <select
          id="category"
          name="category"
          required
          defaultValue={expense ? expense.category : "Materials"}
          className={inputClass}
        >
          {EXPENSE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className={labelClass}>
          Catatan
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={1000}
          defaultValue={expense?.notes ?? ""}
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
