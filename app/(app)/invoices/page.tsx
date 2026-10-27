import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  formatDate,
  formatIdr,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_STYLES,
} from "@/app/lib/format";

export default async function InvoicesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Daftar hanya berisi invoice milik pengguna yang sedang login.
  const userId = BigInt(session.user.id);
  const invoices = await prisma.invoice.findMany({
    where: { userId },
    orderBy: { issueDate: "desc" },
    include: { project: { select: { name: true } } },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Invoice
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Daftar invoice Anda.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/invoices/new"
              className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              Tambah Invoice
            </Link>
          </div>
        </header>

        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-zinc-600 dark:text-zinc-400">
              Belum ada invoice.
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Buat invoice pertama Anda untuk mulai menagih pelanggan.
            </p>
            <Link
              href="/invoices/new"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Tambah Invoice
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Nomor
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Proyek
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Terbit
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Jatuh Tempo
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Total
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id.toString()}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="px-4 py-3 font-medium">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="px-4 py-3">{invoice.project.name}</td>
                    <td className="px-4 py-3">
                      {formatDate(invoice.issueDate)}
                    </td>
                    <td className="px-4 py-3">{formatDate(invoice.dueDate)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_STYLES[invoice.status]}`}
                      >
                        {INVOICE_STATUS_LABEL[invoice.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatIdr(invoice.total)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/invoices/${invoice.id.toString()}`}
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
      </div>
    </div>
  );
}
