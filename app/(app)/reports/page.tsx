import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatIdr } from "@/app/lib/format";
import { Prisma } from "@/app/generated/prisma/client";

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

interface ReportsPageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = BigInt(session.user.id);
  const [projects, invoicesWithPayments, expenses, params] = await Promise.all([
    prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, projectValue: true },
    }),
    prisma.invoice.findMany({
      where: { userId },
      select: {
        projectId: true,
        payments: { select: { amount: true, paymentDate: true } },
      },
    }),
    prisma.expense.findMany({
      where: { userId },
      select: { projectId: true, amount: true, date: true },
    }),
    searchParams,
  ]);

  // Periode: ?year=&month= tanpa param valid → bulan berjalan;
  // year valid tanpa bulan valid → setahun.
  const now = new Date();
  const parsedYear = Number.parseInt(params.year ?? "", 10);
  const parsedMonth = Number.parseInt(params.month ?? "", 10);
  const yearOk = Number.isInteger(parsedYear) && parsedYear >= 1970 && parsedYear <= 2100;
  const monthOk = Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12;
  let activeYear: number;
  let activeMonth: number | null;
  if (!yearOk) {
    activeYear = now.getFullYear();
    activeMonth = now.getMonth() + 1;
  } else {
    activeYear = parsedYear;
    activeMonth = monthOk ? parsedMonth : null;
  }
  const rangeStart =
    activeMonth !== null
      ? new Date(Date.UTC(activeYear, activeMonth - 1, 1))
      : new Date(Date.UTC(activeYear, 0, 1));
  const rangeEnd =
    activeMonth !== null
      ? new Date(Date.UTC(activeYear, activeMonth, 1))
      : new Date(Date.UTC(activeYear + 1, 0, 1));

  const allPayments = invoicesWithPayments.flatMap((invoice) =>
    invoice.payments.map((payment) => ({
      projectId: invoice.projectId,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
    })),
  );
  const inRange = (date: Date) =>
    date.getTime() >= rangeStart.getTime() && date.getTime() < rangeEnd.getTime();

  let income = new Prisma.Decimal(0);
  for (const payment of allPayments) {
    if (inRange(payment.paymentDate)) {
      income = income.add(payment.amount);
    }
  }
  let expenseInPeriod = new Prisma.Decimal(0);
  for (const expense of expenses) {
    if (inRange(expense.date)) {
      expenseInPeriod = expenseInPeriod.add(expense.amount);
    }
  }
  const difference = income.sub(expenseInPeriod);

  const paidByProject = new Map<string, Prisma.Decimal>();
  for (const payment of allPayments) {
    const key = payment.projectId.toString();
    paidByProject.set(key, (paidByProject.get(key) ?? new Prisma.Decimal(0)).add(payment.amount));
  }
  const expenseByProject = new Map<string, Prisma.Decimal>();
  for (const expense of expenses) {
    const key = expense.projectId.toString();
    expenseByProject.set(key, (expenseByProject.get(key) ?? new Prisma.Decimal(0)).add(expense.amount));
  }
  const projectRows = projects.map((project) => {
    const key = project.id.toString();
    const paid = paidByProject.get(key) ?? new Prisma.Decimal(0);
    const spent = expenseByProject.get(key) ?? new Prisma.Decimal(0);
    return { project, paid, spent, net: paid.sub(spent) };
  });

  const years = new Set<number>();
  for (const payment of allPayments) {
    years.add(payment.paymentDate.getUTCFullYear());
  }
  for (const expense of expenses) {
    years.add(expense.date.getUTCFullYear());
  }
  years.add(activeYear);
  years.add(now.getFullYear());
  const yearOptions = [...years].sort((a, b) => b - a);

  const periodLabel =
    activeMonth !== null
      ? `Periode: ${MONTH_NAMES[activeMonth - 1]} ${activeYear}`
      : `Periode: ${activeYear}`;

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
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Laporan</h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Ringkasan keuangan per periode dan profit per proyek.
            </p>
          </div>
        </header>

        <form
          action="/reports"
          method="get"
          aria-label="Filter periode"
          className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <label
              htmlFor="year"
              className="block text-sm font-medium text-zinc-600 dark:text-zinc-400"
            >
              Tahun
            </label>
            <select
              id="year"
              name="year"
              defaultValue={String(activeYear)}
              className="mt-1 h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="month"
              className="block text-sm font-medium text-zinc-600 dark:text-zinc-400"
            >
              Bulan
            </label>
            <select
              id="month"
              name="month"
              defaultValue={activeMonth !== null ? String(activeMonth) : ""}
              className="mt-1 h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">Semua bulan</option>
              {MONTH_NAMES.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            Terapkan
          </button>
          <p
            id="period-label"
            className="text-sm font-medium text-zinc-600 dark:text-zinc-400"
          >
            {periodLabel}
          </p>
        </form>

        <section
          aria-label="Ringkasan periode"
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Pemasukan</p>
            <p id="rp-income" className="mt-1 text-2xl font-semibold">
              {formatIdr(income)}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              pembayaran diterima
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Pengeluaran</p>
            <p id="rp-expense" className="mt-1 text-2xl font-semibold">
              {formatIdr(expenseInPeriod)}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              biaya tercatat
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Selisih</p>
            <p id="rp-diff" className="mt-1 text-2xl font-semibold">
              {formatIdr(difference)}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              pemasukan − pengeluaran
            </p>
          </div>
        </section>

        <section className="mt-8" aria-label="Profit per proyek">
          <h2 className="mb-3 text-lg font-semibold">
            Profit per Proyek (semua waktu)
          </h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Proyek
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Nilai Proyek
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Terbayar
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Pengeluaran
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Selisih
                  </th>
                </tr>
              </thead>
              <tbody>
                {projectRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400"
                    >
                      Belum ada proyek.
                    </td>
                  </tr>
                ) : (
                  projectRows.map(({ project, paid, spent, net }) => (
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
                      <td className="px-4 py-3">{formatIdr(project.projectValue)}</td>
                      <td className="px-4 py-3">{formatIdr(paid)}</td>
                      <td className="px-4 py-3">{formatIdr(spent)}</td>
                      <td className="px-4 py-3">{formatIdr(net)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
