import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import InvoiceForm from "@/app/components/invoice-form";
import { createInvoice } from "@/app/actions/invoice";

export default async function NewInvoicePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Pilihan proyek dibatasi hanya pada proyek milik session.
  const userId = BigInt(session.user.id);
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/invoices"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Daftar Invoice
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Tambah Invoice
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Buat invoice baru untuk akun Anda.
            </p>
          </div>
        </header>

        {projects.length === 0 ? (
          <div className="mb-6 rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-zinc-600 dark:text-zinc-400">
              Belum ada proyek. Tambahkan proyek terlebih dahulu sebelum
              membuat invoice.
            </p>
            <Link
              href="/projects/new"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Tambah Proyek
            </Link>
          </div>
        ) : null}

        <InvoiceForm
          action={createInvoice}
          invoice={null}
          items={[]}
          projects={projects.map((p) => ({
            id: p.id.toString(),
            name: p.name,
          }))}
          submitLabel="Tambah Invoice"
        />
      </div>
    </div>
  );
}
