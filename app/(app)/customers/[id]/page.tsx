import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import CustomerDeleteButton from "@/app/components/customer-delete-button";
import {
  formatDate,
  formatIdr,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_STYLES,
} from "@/app/lib/format";

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const customerId = BigInt(id);
  const userId = BigInt(session.user.id);

  // Hanya pelanggan milik pengguna yang sedang login yang
  // ditampilkan; pelanggan lain atau tidak ada → 404.
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId },
    include: {
      projects: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          projectValue: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      },
    },
  });

  if (!customer) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/customers"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Daftar Pelanggan
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {customer.name}
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Detail pelanggan.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/customers/${customer.id.toString()}/edit`}
              className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Ubah
            </Link>
          </div>
        </header>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Nama
            </dt>
            <dd className="mt-1 font-medium">{customer.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Telepon
            </dt>
            <dd className="mt-1 font-medium">{customer.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Email
            </dt>
            <dd className="mt-1 font-medium">{customer.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Alamat
            </dt>
            <dd className="mt-1 font-medium">{customer.address || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Dibuat
            </dt>
            <dd className="mt-1 font-medium">
              {formatDate(customer.createdAt)}
            </dd>
          </div>
        </dl>

        <section className="mt-8" aria-label="Proyek terkait">
          <h2 className="mb-3 text-lg font-semibold">Proyek</h2>
          {customer.projects.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              Belum ada proyek untuk pelanggan ini.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Proyek
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Nilai
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Mulai
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Selesai
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customer.projects.map((project) => (
                    <tr
                      key={project.id.toString()}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/projects/${project.id.toString()}`}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {project.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PROJECT_STATUS_STYLES[project.status]}`}
                        >
                          {PROJECT_STATUS_LABEL[project.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {formatIdr(project.projectValue)}
                      </td>
                      <td className="px-4 py-3">
                        {formatDate(project.startDate)}
                      </td>
                      <td className="px-4 py-3">
                        {formatDate(project.endDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-8" aria-label="Hapus pelanggan">
          <CustomerDeleteButton
            customerId={customer.id.toString()}
            customerName={customer.name}
          />
        </section>
      </div>
    </div>
  );
}
