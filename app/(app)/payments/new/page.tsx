import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import PaymentForm from "@/app/components/payment-form";
import { createPayment } from "@/app/actions/payment";

interface NewPaymentPageProps {
  searchParams: Promise<{ invoice?: string }>;
}

export default async function NewPaymentPage({
  searchParams,
}: NewPaymentPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Pilihan invoice dibatasi hanya pada invoice milik session, dan
  // prapilihan ?invoice=<id> ikut diverifikasi oleh server saat submit.
  const userId = BigInt(session.user.id);
  const [invoices, { invoice: preselectRaw }] = await Promise.all([
    prisma.invoice.findMany({
      where: { userId },
      orderBy: { issueDate: "desc" },
      select: { id: true, invoiceNumber: true },
    }),
    searchParams,
  ]);
  const preselect = preselectRaw && /^\d+$/.test(preselectRaw) ? preselectRaw : undefined;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/payments"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Daftar Pembayaran
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Tambah Pembayaran
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Catat pembayaran untuk invoice Anda.
            </p>
          </div>
        </header>

        {invoices.length === 0 ? (
          <div className="mb-6 rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-zinc-600 dark:text-zinc-400">
              Belum ada invoice. Buat invoice terlebih dahulu sebelum mencatat
              pembayaran.
            </p>
            <Link
              href="/invoices/new"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Tambah Invoice
            </Link>
          </div>
        ) : null}

        <PaymentForm
          action={createPayment}
          payment={null}
          invoices={invoices.map((inv) => ({
            id: inv.id.toString(),
            number: inv.invoiceNumber,
          }))}
          defaultInvoiceId={preselect}
          submitLabel="Tambah Pembayaran"
        />
      </div>
    </div>
  );
}
