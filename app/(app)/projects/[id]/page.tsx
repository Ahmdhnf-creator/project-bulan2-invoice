import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import ProjectDeleteButton from "@/app/components/project-delete-button";
import {
  formatDate,
  formatIdr,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_STYLES,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_STYLES,
} from "@/app/lib/format";

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const projectId = BigInt(id);
  const userId = BigInt(session.user.id);

  // Hanya proyek milik pengguna yang sedang login yang ditampilkan;
  // proyek lain atau tidak ada → 404.
  const [project, invoices, expenses] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, userId },
      include: { customer: true },
    }),
    prisma.invoice.findMany({
      where: { projectId, userId },
      orderBy: { issueDate: "desc" },
    }),
    prisma.expense.findMany({
      where: { projectId, userId },
      orderBy: { date: "desc" },
    }),
  ]);

  if (!project) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/projects"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Daftar Proyek
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Detail proyek.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/projects/${project.id.toString()}/edit`}
              className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Ubah
            </Link>
          </div>
        </header>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Nama Proyek
            </dt>
            <dd className="mt-1 font-medium">{project.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Pelanggan
            </dt>
            <dd className="mt-1 font-medium">
              <Link
                href={`/customers/${project.customer.id.toString()}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {project.customer.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Nilai Proyek
            </dt>
            <dd className="mt-1 font-medium">
              {formatIdr(project.projectValue)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">Status</dt>
            <dd className="mt-1">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PROJECT_STATUS_STYLES[project.status]}`}
              >
                {PROJECT_STATUS_LABEL[project.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Tanggal Mulai
            </dt>
            <dd className="mt-1 font-medium">
              {formatDate(project.startDate)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Tanggal Selesai
            </dt>
            <dd className="mt-1 font-medium">{formatDate(project.endDate)}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">Catatan</dt>
            <dd className="mt-1 font-medium">{project.notes || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">Dibuat</dt>
            <dd className="mt-1 font-medium">
              {formatDate(project.createdAt)}
            </dd>
          </div>
        </dl>

        <section className="mt-8" aria-label="Invoice terkait">
          <h2 className="mb-3 text-lg font-semibold">Invoice</h2>
          {invoices.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              Belum ada invoice untuk proyek ini.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Nomor
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Terbit
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Jatuh Tempo
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Total
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Status
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
                        <Link
                          href={`/invoices/${invoice.id.toString()}`}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {invoice.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {formatDate(invoice.issueDate)}
                      </td>
                      <td className="px-4 py-3">{formatDate(invoice.dueDate)}</td>
                      <td className="px-4 py-3">{formatIdr(invoice.total)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_STYLES[invoice.status]}`}
                        >
                          {INVOICE_STATUS_LABEL[invoice.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-8" aria-label="Pengeluaran terkait">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Pengeluaran</h2>
            <Link
              href={`/expenses/new?project=${project.id.toString()}`}
              className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Catat Pengeluaran
            </Link>
          </div>
          {expenses.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              Belum ada pengeluaran untuk proyek ini.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Deskripsi
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Tanggal
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Kategori
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Jumlah
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr
                      key={expense.id.toString()}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                    >
                      <td className="px-4 py-3 font-medium">
                        {expense.description}
                      </td>
                      <td className="px-4 py-3">{formatDate(expense.date)}</td>
                      <td className="px-4 py-3">{expense.category}</td>
                      <td className="px-4 py-3">
                        {formatIdr(expense.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/expenses/${expense.id.toString()}`}
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

        <section className="mt-8" aria-label="Hapus proyek">
          <ProjectDeleteButton
            projectId={project.id.toString()}
            projectName={project.name}
          />
        </section>
      </div>
    </div>
  );
}
