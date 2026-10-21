import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import InvoiceDeleteButton from "@/app/components/invoice-delete-button";
import InvoiceReminderButton from "@/app/components/invoice-reminder-button";
import { Prisma } from "@/app/generated/prisma/client";
import {
  formatDate,
  formatIdr,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_STYLES,
} from "@/app/lib/format";

interface InvoiceDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function InvoiceDetailPage({
  params,
}: InvoiceDetailPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const invoiceId = BigInt(id);
  const userId = BigInt(session.user.id);

  // Hanya invoice milik pengguna yang sedang login yang ditampilkan;
  // invoice lain atau tidak ada → 404. Profil bisnis dipakai untuk
  // menyusun teks pengingat WhatsApp.
  const [invoice, businessProfile] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            customer: { select: { name: true, phone: true } },
          },
        },
        items: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { paymentDate: "desc" } },
      },
    }),
    prisma.businessProfile.findUnique({ where: { userId } }),
  ]);

  if (!invoice) {
    notFound();
  }

  const paidTotal = invoice.payments.reduce(
    (acc, payment) => acc.add(payment.amount),
    new Prisma.Decimal(0),
  );
  const remaining = invoice.total.sub(paidTotal);
  const businessName = businessProfile?.businessName ?? session.user.name ?? "BillMate";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/invoices"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Daftar Invoice
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {invoice.invoiceNumber}
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Detail invoice.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/invoices/${invoice.id.toString()}/edit`}
              className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Ubah
            </Link>
          </div>
        </header>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Nomor Invoice
            </dt>
            <dd className="mt-1 font-medium">{invoice.invoiceNumber}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Proyek
            </dt>
            <dd className="mt-1 font-medium">
              <Link
                href={`/projects/${invoice.project.id.toString()}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {invoice.project.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Tanggal Terbit
            </dt>
            <dd className="mt-1 font-medium">
              {formatDate(invoice.issueDate)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Tanggal Jatuh Tempo
            </dt>
            <dd className="mt-1 font-medium">{formatDate(invoice.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Status
            </dt>
            <dd className="mt-1">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_STYLES[invoice.status]}`}
              >
                {INVOICE_STATUS_LABEL[invoice.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Pajak
            </dt>
            <dd className="mt-1 font-medium">
              {invoice.taxRate.toString()}%
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Subtotal
            </dt>
            <dd className="mt-1 font-medium">
              {formatIdr(invoice.subtotal)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Jumlah Pajak
            </dt>
            <dd className="mt-1 font-medium">
              {formatIdr(invoice.taxAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Total
            </dt>
            <dd className="mt-1 text-lg font-semibold">
              {formatIdr(invoice.total)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Catatan
            </dt>
            <dd className="mt-1 font-medium">{invoice.notes || "—"}</dd>
          </div>
        </dl>

        <section className="mt-8" aria-label="Item invoice">
          <h2 className="mb-3 text-lg font-semibold">Item</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Deskripsi
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Kuantitas
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Harga Satuan
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Jumlah
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr
                    key={item.id.toString()}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="px-4 py-3 font-medium">
                      {item.description}
                    </td>
                    <td className="px-4 py-3">
                      {item.quantity.toString()}
                    </td>
                    <td className="px-4 py-3">
                      {formatIdr(item.unitPrice)}
                    </td>
                    <td className="px-4 py-3">{formatIdr(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8" aria-label="Pembayaran">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Pembayaran</h2>
            <Link
              href={`/payments/new?invoice=${invoice.id.toString()}`}
              className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Catat Pembayaran
            </Link>
          </div>
          {invoice.payments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              Belum ada pembayaran untuk invoice ini.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Tanggal
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Jumlah
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Metode
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Catatan
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((payment) => (
                    <tr
                      key={payment.id.toString()}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                    >
                      <td className="px-4 py-3">
                        {formatDate(payment.paymentDate)}
                      </td>
                      <td className="px-4 py-3">
                        {formatIdr(payment.amount)}
                      </td>
                      <td className="px-4 py-3">{payment.method || "—"}</td>
                      <td className="px-4 py-3">{payment.notes || "—"}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/payments/${payment.id.toString()}`}
                          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Lihat
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {invoice.status !== "PAID" ? (
          <section className="mt-8" aria-label="Pengingat pembayaran">
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold">Pengingat Pembayaran</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Salin pesan pengingat atau buka WhatsApp untuk menagih sisa
                tagihan.
              </p>
              <InvoiceReminderButton
                customerName={invoice.project.customer.name}
                businessName={businessName}
                invoiceNumber={invoice.invoiceNumber}
                projectName={invoice.project.name}
                totalFormatted={formatIdr(invoice.total)}
                paidFormatted={formatIdr(paidTotal)}
                remainingFormatted={formatIdr(remaining)}
                dueFormatted={formatDate(invoice.dueDate)}
                phone={invoice.project.customer.phone}
              />
            </div>
          </section>
        ) : null}

        <section className="mt-8" aria-label="Hapus invoice">
          <InvoiceDeleteButton
            invoiceId={invoice.id.toString()}
            invoiceNumber={invoice.invoiceNumber}
          />
        </section>
      </div>
    </div>
  );
}
