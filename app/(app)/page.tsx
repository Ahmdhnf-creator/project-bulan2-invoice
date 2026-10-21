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
import MonthPicker from "@/app/components/month-picker";
import CashflowChart from "@/app/components/cashflow-chart";
import InvoiceStatusChart from "@/app/components/invoice-status-chart";
import {
  IconCard,
  IconChevron,
  IconDoc,
  IconFolder,
  IconPlus,
  IconWallet,
} from "@/app/components/icons";

const MONTHS_ID = [
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

interface DashboardPageProps {
  searchParams: Promise<{ period?: string }>;
}

function parsePeriod(period?: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period ?? "");
  const now = new Date();
  if (!match) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

function percentChange(current: number, previous: number) {
  if (previous <= 0) {
    return null;
  }
  const change = ((current - previous) / previous) * 100;
  return {
    up: change >= 0,
    text: `${Math.abs(Math.round(change * 10) / 10)}%`,
  };
}

function greetingWord(hour: number): string {
  if (hour < 11) return "selamat pagi";
  if (hour < 15) return "selamat siang";
  if (hour < 18) return "selamat sore";
  return "selamat malam";
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = BigInt(session.user.id);

  const { period } = await searchParams;
  const { year: activeYear, month: activeMonth } = parsePeriod(period);
  const rangeStart = new Date(Date.UTC(activeYear, activeMonth - 1, 1));
  const rangeEnd = new Date(Date.UTC(activeYear, activeMonth, 1));
  const prevStart = new Date(Date.UTC(activeYear, activeMonth - 2, 1));
  const chartStart = new Date(Date.UTC(activeYear, activeMonth - 6, 1));

  const [
    businessProfile,
    projectStats,
    invoicePeriod,
    invoicePrev,
    paidPeriod,
    paidPrev,
    expensePeriod,
    expensePrev,
    chartPayments,
    chartExpenses,
    allInvoices,
    recentProjects,
  ] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId } }),
    prisma.project.aggregate({ where: { userId }, _sum: { projectValue: true }, _count: true }),
    prisma.invoice.aggregate({
      where: { userId, issueDate: { gte: rangeStart, lt: rangeEnd } },
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: { userId, issueDate: { gte: prevStart, lt: rangeStart } },
      _sum: { total: true },
    }),
    prisma.payment.aggregate({
      where: { invoice: { userId }, paymentDate: { gte: rangeStart, lt: rangeEnd } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { invoice: { userId }, paymentDate: { gte: prevStart, lt: rangeStart } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { userId, date: { gte: rangeStart, lt: rangeEnd } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { userId, date: { gte: prevStart, lt: rangeStart } },
      _sum: { amount: true },
    }),
    prisma.payment.findMany({
      where: { invoice: { userId }, paymentDate: { gte: chartStart, lt: rangeEnd } },
      select: { amount: true, paymentDate: true },
    }),
    prisma.expense.findMany({
      where: { userId, date: { gte: chartStart, lt: rangeEnd } },
      select: { amount: true, date: true },
    }),
    prisma.invoice.findMany({
      where: { userId },
      select: { status: true, dueDate: true },
    }),
    prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, projectValue: true, startDate: true, endDate: true, status: true, customer: { select: { name: true } } },
    }),
  ]);

  const businessName = businessProfile?.businessName ?? session.user.name ?? "BillMate";
  const userName = session.user.name ?? "Pengguna";

  // ---- 6-month cash-flow series (ends at selected month) ----
  const series = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(activeYear, activeMonth - 6 + index, 1));
    return {
      key: `${date.getUTCFullYear()}-${date.getUTCMonth()}`,
      label: MONTHS_ID[date.getUTCMonth()],
      masuk: 0,
      keluar: 0,
    };
  });
  const seriesByKey = new Map(series.map((point) => [point.key, point]));
  for (const payment of chartPayments) {
    const point = seriesByKey.get(`${payment.paymentDate.getUTCFullYear()}-${payment.paymentDate.getUTCMonth()}`);
    if (point) {
      point.masuk += Number(payment.amount);
    }
  }
  for (const expense of chartExpenses) {
    const point = seriesByKey.get(`${expense.date.getUTCFullYear()}-${expense.date.getUTCMonth()}`);
    if (point) {
      point.keluar += Number(expense.amount);
    }
  }

  // ---- invoice status donut (overdue derived at read time) ----
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const donut = { lunas: 0, belum: 0, terlambat: 0 };
  for (const invoice of allInvoices) {
    if (invoice.status === "PAID") {
      donut.lunas++;
    } else if (invoice.dueDate.getTime() < today.getTime()) {
      donut.terlambat++;
    } else {
      donut.belum++;
    }
  }

  // ---- period options for the month picker ----
  const years = new Set<number>();
  for (const payment of chartPayments) years.add(payment.paymentDate.getUTCFullYear());
  for (const expense of chartExpenses) years.add(expense.date.getUTCFullYear());
  years.add(activeYear);
  years.add(new Date().getFullYear());
  const periodOptions = [...years]
    .sort((a, b) => b - a)
    .flatMap((optionYear) =>
      Array.from({ length: 12 }, (_, index) => {
        const optionMonth = 12 - index;
        return {
          value: `${optionYear}-${String(optionMonth).padStart(2, "0")}`,
          label: `${MONTHS_ID[optionMonth - 1]} ${optionYear}`,
        };
      }),
    );

  const invoiceChange = percentChange(
    Number(invoicePeriod._sum.total ?? 0),
    Number(invoicePrev._sum.total ?? 0),
  );
  const paidChange = percentChange(
    Number(paidPeriod._sum.amount ?? 0),
    Number(paidPrev._sum.amount ?? 0),
  );
  const expenseChange = percentChange(
    Number(expensePeriod._sum.amount ?? 0),
    Number(expensePrev._sum.amount ?? 0),
  );

  const changeBadge = (change: { up: boolean; text: string } | null) =>
    change ? (
      <p
        className={`mt-1 text-xs font-medium ${change.up ? "text-brand" : "text-red-600 dark:text-red-400"}`}
      >
        {change.up ? "↑" : "↓"} {change.text} dari bulan lalu
      </p>
    ) : (
      <p className="mt-1 text-xs text-muted">— dibanding bulan lalu</p>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 pl-12 md:pl-0">
          <h1 className="text-2xl font-semibold tracking-tight">Ringkasan</h1>
          <MonthPicker
            options={periodOptions}
            defaultValue={`${activeYear}-${String(activeMonth).padStart(2, "0")}`}
          />
        </div>
        <details className="relative">
          <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-full bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-strong [&::-webkit-details-marker]:hidden">
            <IconPlus size={16} />
            Tambah transaksi
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-line bg-surface p-1 shadow-lg">
            <Link
              href="/invoices/new"
              className="block rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-brand-soft"
            >
              Tambah Invoice
            </Link>
            <Link
              href="/payments/new"
              className="block rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-brand-soft"
            >
              Catat Pembayaran
            </Link>
            <Link
              href="/expenses/new"
              className="block rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-brand-soft"
            >
              Catat Pengeluaran
            </Link>
          </div>
        </details>
      </header>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">Halo, {userName}</h2>
        <p className="mt-1 text-muted">
          {greetingWord(new Date().getHours())} — pantau kesehatan keuangan dan
          progres proyek Anda di {businessName}.
        </p>
      </section>

      <section
        aria-label="Ringkasan keuangan"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-brand-soft p-2 text-brand">
              <IconFolder size={20} />
            </span>
            <p className="text-sm text-muted">Nilai proyek</p>
          </div>
          <p id="dash-value" className="mt-3 text-2xl font-semibold">
            {formatIdr(projectStats._sum.projectValue)}
          </p>
          <p className="mt-1 text-xs text-muted">dari {projectStats._count} proyek</p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-brand-soft p-2 text-brand">
              <IconDoc size={20} />
            </span>
            <p className="text-sm text-muted">Total invoice</p>
          </div>
          <p id="dash-invoice" className="mt-3 text-2xl font-semibold">
            {formatIdr(invoicePeriod._sum.total)}
          </p>
          {changeBadge(invoiceChange)}
        </div>

        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-brand-soft p-2 text-brand">
              <IconCard size={20} />
            </span>
            <p className="text-sm text-muted">Pembayaran diterima</p>
          </div>
          <p id="dash-paid" className="mt-3 text-2xl font-semibold">
            {formatIdr(paidPeriod._sum.amount)}
          </p>
          {changeBadge(paidChange)}
        </div>

        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-brand-soft p-2 text-brand">
              <IconWallet size={20} />
            </span>
            <p className="text-sm text-muted">Pengeluaran</p>
          </div>
          <p id="dash-expense" className="mt-3 text-2xl font-semibold">
            {formatIdr(expensePeriod._sum.amount)}
          </p>
          {changeBadge(expenseChange)}
        </div>
      </section>

      <section
        aria-label="Grafik"
        className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3"
      >
        <div className="lg:col-span-2">
          <CashflowChart series={series} />
        </div>
        <InvoiceStatusChart counts={donut} />
      </section>

      <section className="mt-8" aria-label="Proyek terbaru">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Proyek terbaru</h2>
          <Link
            href="/projects"
            className="text-sm font-medium text-brand hover:underline"
          >
            Lihat semua →
          </Link>
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Proyek</th>
                <th scope="col" className="px-4 py-3 font-medium">Pelanggan</th>
                <th scope="col" className="px-4 py-3 font-medium">Nilai</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Mulai</th>
                <th scope="col" className="px-4 py-3 font-medium">Tenggat</th>
                <th scope="col" className="px-4 py-3 font-medium">
                  <span className="sr-only">Buka</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {recentProjects.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    Belum ada proyek.
                  </td>
                </tr>
              ) : (
                recentProjects.map((project) => (
                  <tr
                    key={project.id.toString()}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/projects/${project.id.toString()}`}
                        className="text-brand hover:underline"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{project.customer.name}</td>
                    <td className="px-4 py-3">{formatIdr(project.projectValue)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PROJECT_STATUS_STYLES[project.status]}`}
                      >
                        {PROJECT_STATUS_LABEL[project.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatDate(project.startDate)}</td>
                    <td className="px-4 py-3">{formatDate(project.endDate)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/projects/${project.id.toString()}`}
                        aria-label={`Buka ${project.name}`}
                        className="text-muted transition-colors hover:text-foreground"
                      >
                        <IconChevron size={18} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
