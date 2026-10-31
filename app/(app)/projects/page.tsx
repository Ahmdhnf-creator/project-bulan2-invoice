import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  formatDate,
  formatIdr,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_STYLES,
} from "@/app/lib/format";

export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Daftar hanya berisi proyek milik pengguna yang sedang login.
  const userId = BigInt(session.user.id);
  const projects = await prisma.project.findMany({
    where: { userId },
    include: { customer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
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
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Proyek</h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Daftar proyek Anda.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/projects/new"
              className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              Tambah Proyek
            </Link>
          </div>
        </header>

        {projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-zinc-600 dark:text-zinc-400">
              Belum ada proyek.
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Tambahkan proyek pertama Anda untuk mulai mencatat keuangan.
            </p>
            <Link
              href="/projects/new"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Tambah Proyek
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Proyek
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">
                    Pelanggan
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Nilai
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">
                    Mulai
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">
                    Selesai
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr
                    key={project.id.toString()}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="px-4 py-3 font-medium">{project.name}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">{project.customer.name}</td>
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
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {formatDate(project.startDate)}
                    </td>
                      <td className="px-4 py-3 hidden sm:table-cell">{formatDate(project.endDate)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/projects/${project.id.toString()}`}
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
