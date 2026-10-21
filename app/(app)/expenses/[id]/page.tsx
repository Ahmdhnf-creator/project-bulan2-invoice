import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import ExpenseDeleteButton from "@/app/components/expense-delete-button";
import { formatDate, formatIdr } from "@/app/lib/format";

interface ExpenseDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ExpenseDetailPage({
  params,
}: ExpenseDetailPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const expenseId = BigInt(id);
  const userId = BigInt(session.user.id);

  // Kepemilikan via kolom userId; pengeluaran lain atau tidak ada → 404.
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, userId },
    include: {
      project: {
        select: { id: true, name: true, customer: { select: { name: true } } },
      },
    },
  });

  if (!expense) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/expenses"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Daftar Pengeluaran
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Pengeluaran {formatDate(expense.date)}
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Detail pengeluaran.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/expenses/${expense.id.toString()}/edit`}
              className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Ubah
            </Link>
          </div>
        </header>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Deskripsi
            </dt>
            <dd className="mt-1 font-medium">{expense.description}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">Jumlah</dt>
            <dd className="mt-1 text-lg font-semibold">
              {formatIdr(expense.amount)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Tanggal
            </dt>
            <dd className="mt-1 font-medium">{formatDate(expense.date)}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Kategori
            </dt>
            <dd className="mt-1 font-medium">{expense.category}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Catatan
            </dt>
            <dd className="mt-1 font-medium">{expense.notes || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Proyek
            </dt>
            <dd className="mt-1 font-medium">
              <Link
                href={`/projects/${expense.project.id.toString()}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {expense.project.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Pelanggan
            </dt>
            <dd className="mt-1 font-medium">{expense.project.customer.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Dicatat
            </dt>
            <dd className="mt-1 font-medium">{formatDate(expense.createdAt)}</dd>
          </div>
        </dl>

        <section className="mt-8" aria-label="Hapus pengeluaran">
          <ExpenseDeleteButton
            expenseId={expense.id.toString()}
            description={expense.description}
          />
        </section>
      </div>
    </div>
  );
}
