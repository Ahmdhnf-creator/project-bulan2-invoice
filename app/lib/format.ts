import type { InvoiceStatus, ProjectStatus } from "@/app/generated/prisma/client";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNED: "Direncanakan",
  IN_PROGRESS: "Berjalan",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

export const PROJECT_STATUS_STYLES: Record<ProjectStatus, string> = {
  PLANNED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  IN_PROGRESS:
    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  COMPLETED:
    "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  UNPAID: "Belum Dibayar",
  PARTIALLY_PAID: "Sebagian Dibayar",
  PAID: "Lunas",
};

export const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  UNPAID: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
  PARTIALLY_PAID:
    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  PAID: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
};

// Daftar kategori pengeluaran (MVP fixed). Disimpan apa adanya sebagai
// String di kolom expense.category; divalidasi di server — pratinjau
// yang sama dipakai form dan action.
export const EXPENSE_CATEGORIES = [
  "Materials",
  "Labor",
  "Equipment",
  "Transport",
  "Other",
] as const;

export function formatIdr(
  value: { toString(): string } | null | undefined,
): string {
  const whole = (value?.toString() ?? "0").split(".")[0] ?? "0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(whole));
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) {
    return "—";
  }
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
