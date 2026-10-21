"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteInvoice } from "@/app/actions/invoice";

interface InvoiceDeleteButtonProps {
  invoiceId: string;
  invoiceNumber: string;
}

function DeleteControls({
  confirming,
  invoiceNumber,
  onConfirm,
  onCancel,
}: {
  confirming: boolean;
  invoiceNumber: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { pending } = useFormStatus();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={onConfirm}
        className="inline-flex h-10 items-center justify-center rounded-full border border-red-300 px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
      >
        Hapus
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center justify-center rounded-full bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
      >
        {pending ? "Menghapus…" : "Ya, Hapus"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Batal
      </button>
      <p className="w-full text-sm text-zinc-500 dark:text-zinc-400">
        Yakin ingin menghapus invoice &quot;{invoiceNumber}&quot;? Tindakan ini
        tidak dapat dibatalkan.
      </p>
    </div>
  );
}

export default function InvoiceDeleteButton({
  invoiceId,
  invoiceNumber,
}: InvoiceDeleteButtonProps) {
  const [state, formAction] = useActionState(deleteInvoice, null);
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <DeleteControls
        confirming={confirming}
        invoiceNumber={invoiceNumber}
        onConfirm={() => setConfirming(true)}
        onCancel={() => setConfirming(false)}
      />
      {state?.error ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
