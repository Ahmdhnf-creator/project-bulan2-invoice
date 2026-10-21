import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import PaymentForm, { type PaymentFormValues } from "@/app/components/payment-form";
import { updatePayment } from "@/app/actions/payment";

interface EditPaymentPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPaymentPage({
  params,
}: EditPaymentPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const paymentId = BigInt(id);
  const userId = BigInt(session.user.id);

  // Pembayaran lain atau tidak ada → 404.
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, invoice: { userId } },
    select: {
      id: true,
      amount: true,
      paymentDate: true,
      method: true,
      notes: true,
      invoice: { select: { invoiceNumber: true } },
    },
  });

  if (!payment) {
    notFound();
  }

  const values: PaymentFormValues = {
    id: payment.id.toString(),
    amount: payment.amount.toString(),
    paymentDate: payment.paymentDate.toISOString().slice(0, 10),
    method: payment.method ?? "",
    notes: payment.notes ?? "",
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href={`/payments/${payment.id.toString()}`}
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Detail Pembayaran
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Ubah Pembayaran
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Perbarui rincian pembayaran ini.
            </p>
          </div>
        </header>

        <PaymentForm
          action={updatePayment}
          payment={values}
          invoiceNumber={payment.invoice.invoiceNumber}
          submitLabel="Simpan Perubahan"
        />
      </div>
    </div>
  );
}
