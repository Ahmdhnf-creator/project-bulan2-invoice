import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import InvoiceForm, {
  type InvoiceFormValues,
  type InvoiceItemRow,
} from "@/app/components/invoice-form";
import { updateInvoice } from "@/app/actions/invoice";

interface EditInvoicePageProps {
  params: Promise<{ id: string }>;
}

// Decimal tidak aman dikirim ke client component — konversi ke string
// polos (dan normalkan "500000.00" → "500000") di server terlebih dahulu.
function toInputNumber(value: { toString(): string } | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .toString()
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

export default async function EditInvoicePage({
  params,
}: EditInvoicePageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const invoiceId = BigInt(id);
  const userId = BigInt(session.user.id);

  // Invoice lain atau tidak ada → 404.
  const [invoice, projects] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.project.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!invoice) {
    notFound();
  }

  const values: InvoiceFormValues = {
    id: invoice.id.toString(),
    invoiceNumber: invoice.invoiceNumber,
    projectId: invoice.projectId.toString(),
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate.toISOString().slice(0, 10),
    status: invoice.status,
    taxRate: toInputNumber(invoice.taxRate),
    notes: invoice.notes ?? "",
  };

  const items: InvoiceItemRow[] = invoice.items.map((item) => ({
    description: item.description,
    quantity: toInputNumber(item.quantity),
    unitPrice: toInputNumber(item.unitPrice),
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href={`/invoices/${invoice.id.toString()}`}
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Detail Invoice
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Ubah Invoice
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              {invoice.invoiceNumber}
            </p>
          </div>
        </header>

        <InvoiceForm
          action={updateInvoice}
          invoice={values}
          items={items}
          projects={projects.map((p) => ({
            id: p.id.toString(),
            name: p.name,
          }))}
          submitLabel="Simpan Perubahan"
        />
      </div>
    </div>
  );
}
