"use client";

import { useState } from "react";

export interface InvoiceReminderValues {
  customerName: string;
  businessName: string;
  invoiceNumber: string;
  projectName: string;
  totalFormatted: string;
  paidFormatted: string;
  remainingFormatted: string;
  dueFormatted: string;
  phone: string | null;
}

export default function InvoiceReminderButton({
  customerName,
  businessName,
  invoiceNumber,
  projectName,
  totalFormatted,
  paidFormatted,
  remainingFormatted,
  dueFormatted,
  phone,
}: InvoiceReminderValues) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  const reminderText =
    `Halo ${customerName},\n` +
    `Pengingat pembayaran dari ${businessName}:\n` +
    `Invoice ${invoiceNumber} — proyek ${projectName}\n` +
    `Total: ${totalFormatted} | Terbayar: ${paidFormatted} | Sisa: ${remainingFormatted}\n` +
    `Jatuh tempo: ${dueFormatted}\n` +
    `Terima kasih.`;

  const digits = phone?.replace(/\D/g, "") ?? "";
  const waNumber =
    digits === "" ? null : digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(reminderText)}`
    : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reminderText);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        Salin Pengingat
      </button>
      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Buka WhatsApp
        </a>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nomor WhatsApp pelanggan belum diisi.
        </p>
      )}
      {status === "copied" ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Pengingat tersalin.
        </p>
      ) : null}
      {status === "error" ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Gagal menyalin pengingat.
        </p>
      ) : null}
    </div>
  );
}
