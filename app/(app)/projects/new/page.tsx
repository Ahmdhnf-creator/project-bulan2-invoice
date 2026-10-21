import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProjectForm from "@/app/components/project-form";
import { createProject } from "@/app/actions/project";

export default async function NewProjectPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Pilihan pelanggan dibatasi hanya pada pelanggan milik session.
  const userId = BigInt(session.user.id);
  const customers = await prisma.customer.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/projects"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Daftar Proyek
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Tambah Proyek
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Tambahkan proyek baru untuk akun Anda.
            </p>
          </div>
        </header>

        {customers.length === 0 ? (
          <div className="mb-6 rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-zinc-600 dark:text-zinc-400">
              Belum ada pelanggan. Tambahkan pelanggan terlebih dahulu sebelum
              membuat proyek.
            </p>
            <Link
              href="/customers/new"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Tambah Pelanggan
            </Link>
          </div>
        ) : null}

        <ProjectForm
          action={createProject}
          project={null}
          customers={customers}
          submitLabel="Tambah Proyek"
        />
      </div>
    </div>
  );
}
