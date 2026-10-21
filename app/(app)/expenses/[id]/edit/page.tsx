import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import ExpenseForm, { type ExpenseFormValues } from "@/app/components/expense-form";
import { updateExpense } from "@/app/actions/expense";

interface EditExpensePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditExpensePage({
  params,
}: EditExpensePageProps) {
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

  // Pengeluaran lain atau tidak ada → 404. Daftar proyek untuk select
  // edit (pengeluaran boleh dipindah antar proyek).
  const [expense, projects] = await Promise.all([
    prisma.expense.findFirst({
      where: { id: expenseId, userId },
      select: {
        id: true,
        projectId: true,
        description: true,
        amount: true,
        date: true,
        category: true,
        notes: true,
      },
    }),
    prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!expense) {
    notFound();
  }

  const values: ExpenseFormValues = {
    id: expense.id.toString(),
    projectId: expense.projectId.toString(),
    description: expense.description,
    amount: expense.amount.toString(),
    date: expense.date.toISOString().slice(0, 10),
    category: expense.category,
    notes: expense.notes ?? "",
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href={`/expenses/${expense.id.toString()}`}
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Detail Pengeluaran
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Ubah Pengeluaran
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Perbarui rincian pengeluaran ini.
            </p>
          </div>
        </header>

        <ExpenseForm
          action={updateExpense}
          expense={values}
          projects={projects.map((project) => ({
            id: project.id.toString(),
            name: project.name,
          }))}
          submitLabel="Simpan Perubahan"
        />
      </div>
    </div>
  );
}
