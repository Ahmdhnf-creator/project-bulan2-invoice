import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate, formatIdr } from "@/app/lib/format";

export default async function ExpensesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Expense milik session (kolom userId langsung) — daftar hanya berisi
  // pengeluaran milik pengguna yang sedang login.
  const userId = BigInt(session.user.id);
  const expenses = await prisma.expense.findMany({
    where: { userId },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    select: {
      id: true,
      description: true,
      amount: true,
      date: true,
      category: true,
      project: {
        select: { id: true, name: true, customer: { select: { name: true } } },
      },
    },
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
              Pengeluaran
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Daftar pengeluaran yang telah dicatat.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/expenses/new"
              className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              Tambah Pengeluaran
            </Link>
          </div>
        </header>

        {expenses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-zinc-600 dark:text-zinc-400">
              Belum ada pengeluaran.
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Catat pengeluaran pertama Anda dari detail proyek atau tombol di
              bawah ini.
            </p>
            <Link
              href="/expenses/new"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Tambah Pengeluaran
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Tanggal
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Deskripsi
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Proyek
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
                    <td className="px-4 py-3">{formatDate(expense.date)}</td>
                    <td className="px-4 py-3 font-medium">
                      {expense.description}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/projects/${expense.project.id.toString()}`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {expense.project.name}
                      </Link>
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        {expense.project.customer.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">{expense.category}</td>
                    <td className="px-4 py-3">{formatIdr(expense.amount)}</td>
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
      </div>
    </div>
  );
}
