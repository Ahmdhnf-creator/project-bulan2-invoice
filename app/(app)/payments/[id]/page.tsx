import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import PaymentDeleteButton from "@/app/components/payment-delete-button";
import { formatDate, formatIdr } from "@/app/lib/format";

interface PaymentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PaymentDetailPage({
  params,
}: PaymentDetailPageProps) {
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

  // Kepemilikan lewat relasi invoice; pembayaran lain atau tidak ada → 404.
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, invoice: { userId } },
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          project: { select: { name: true, customer: { select: { name: true } } } },
        },
      },
    },
  });

  if (!payment) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/payments"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Daftar Pembayaran
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Pembayaran {formatDate(payment.paymentDate)}
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Detail pembayaran.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/payments/${payment.id.toString()}/edit`}
              className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Ubah
            </Link>
          </div>
        </header>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Jumlah
            </dt>
            <dd className="mt-1 text-lg font-semibold">
              {formatIdr(payment.amount)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Tanggal Pembayaran
            </dt>
            <dd className="mt-1 font-medium">
              {formatDate(payment.paymentDate)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Metode
            </dt>
            <dd className="mt-1 font-medium">{payment.method || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Catatan / Referensi
            </dt>
            <dd className="mt-1 font-medium">{payment.notes || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Invoice
            </dt>
            <dd className="mt-1 font-medium">
              <Link
                href={`/invoices/${payment.invoice.id.toString()}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {payment.invoice.invoiceNumber}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Proyek
            </dt>
            <dd className="mt-1 font-medium">{payment.invoice.project.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Pelanggan
            </dt>
            <dd className="mt-1 font-medium">
              {payment.invoice.project.customer.name}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Dicatat
            </dt>
            <dd className="mt-1 font-medium">{formatDate(payment.createdAt)}</dd>
          </div>
        </dl>

        <section className="mt-8" aria-label="Hapus pembayaran">
          <PaymentDeleteButton
            paymentId={payment.id.toString()}
            amountLabel={formatIdr(payment.amount)}
          />
        </section>
      </div>
    </div>
  );
}
