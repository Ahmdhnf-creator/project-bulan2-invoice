"use client";

import { useActionState } from "react";
import type { Customer } from "@/app/generated/prisma/client";
import type { ProjectState } from "@/app/actions/project";
import { PROJECT_STATUS_LABEL } from "@/app/lib/format";

// DTO serializable yang dikirim dari Server Component ke Client Component.
// Semua nilai ID dan uang dikirim sebagai string agar aman diserialisasi
// dalam payload RSC (Prisma Decimal dan BigInt tidak diperbolehkan).
export interface ProjectFormValues {
  id: string;
  name: string;
  customerId: string;
  projectValue: string;
  startDate: string;
  endDate: string | null;
  status: string;
  notes: string | null;
}

interface ProjectFormProps {
  action: (
    state: ProjectState | null,
    formData: FormData,
  ) => Promise<ProjectState>;
  project: ProjectFormValues | null;
  customers: Pick<Customer, "id" | "name">[];
  submitLabel: string;
}

const inputClass =
  "h-11 w-full rounded-md border border-black/[.08] bg-white px-3 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50";
const labelClass = "text-sm font-medium text-black dark:text-zinc-50";

// Nilai Decimal dari database (mis. "150000000.00") dinormalkan agar
// bersih di input (mis. "150000000").
function toInputNumber(value: { toString(): string } | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .toString()
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

function toDateInput(value: string | Date | null | undefined): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

export default function ProjectForm({
  action,
  project,
  customers,
  submitLabel,
}: ProjectFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form
      action={formAction}
      noValidate
      className="flex w-full max-w-xl flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {project ? (
        <input type="hidden" name="projectId" value={project.id} />
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
          Proyek tersimpan.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={labelClass}>
          Nama Proyek <span aria-hidden="true">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={150}
          defaultValue={project?.name ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="customerId" className={labelClass}>
          Pelanggan <span aria-hidden="true">*</span>
        </label>
        <select
          id="customerId"
          name="customerId"
          required
          defaultValue={project?.customerId ?? ""}
          className={inputClass}
        >
          <option value="" disabled>
            Pilih pelanggan
          </option>
          {customers.map((customer) => (
            <option key={customer.id.toString()} value={customer.id.toString()}>
              {customer.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="projectValue" className={labelClass}>
          Nilai Proyek (Rp) <span aria-hidden="true">*</span>
        </label>
        <input
          id="projectValue"
          name="projectValue"
          type="text"
          inputMode="decimal"
          required
          placeholder="mis. 250000000"
          defaultValue={toInputNumber(project?.projectValue)}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="startDate" className={labelClass}>
            Tanggal Mulai <span aria-hidden="true">*</span>
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            defaultValue={toDateInput(project?.startDate)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="endDate" className={labelClass}>
            Tanggal Selesai
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={toDateInput(project?.endDate)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="status" className={labelClass}>
          Status <span aria-hidden="true">*</span>
        </label>
        <select
          id="status"
          name="status"
          required
          defaultValue={project?.status ?? "PLANNED"}
          className={inputClass}
        >
          {(
            Object.entries(PROJECT_STATUS_LABEL) as [
              keyof typeof PROJECT_STATUS_LABEL,
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
        <label htmlFor="notes" className={labelClass}>
          Catatan
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={1000}
          defaultValue={project?.notes ?? ""}
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
