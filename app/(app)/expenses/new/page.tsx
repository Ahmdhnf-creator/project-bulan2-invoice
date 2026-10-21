import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import ExpenseForm from "@/app/components/expense-form";
import { createExpense } from "@/app/actions/expense";

interface NewExpensePageProps {
  searchParams: Promise<{ project?: string }>;
}

export default async function NewExpensePage({
  searchParams,
}: NewExpensePageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Pilihan proyek dibatasi hanya pada proyek milik session, dan
  // prapilihan ?project=<id> ikut diverifikasi oleh server saat submit.
  const userId = BigInt(session.user.id);
  const [projects, { project: preselectRaw }] = await Promise.all([
    prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
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
              href="/expenses"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Daftar Pengeluaran
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Tambah Pengeluaran
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Catat pengeluaran untuk proyek Anda.
            </p>
          </div>
        </header>

        {projects.length === 0 ? (
          <div className="mb-6 rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-zinc-600 dark:text-zinc-400">
              Belum ada proyek. Buat proyek terlebih dahulu sebelum mencatat
              pengeluaran.
            </p>
            <Link
              href="/projects/new"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Tambah Proyek
            </Link>
          </div>
        ) : null}

        <ExpenseForm
          action={createExpense}
          expense={null}
          projects={projects.map((project) => ({
            id: project.id.toString(),
            name: project.name,
          }))}
          defaultProjectId={preselect}
          submitLabel="Tambah Pengeluaran"
        />
      </div>
    </div>
  );
}
