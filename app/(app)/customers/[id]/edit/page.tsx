import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import CustomerForm, {
  type CustomerFormValues,
} from "@/app/components/customer-form";
import { updateCustomer } from "@/app/actions/customer";

interface CustomerEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerEditPage({
  params,
}: CustomerEditPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const customerId = BigInt(id);
  const userId = BigInt(session.user.id);

  // Hanya pelanggan milik pengguna yang sedang login yang
  // dapat diubah; pelanggan lain atau tidak ada → 404.
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId },
  });

  if (!customer) {
    notFound();
  }

  // Konversi model Prisma ke DTO serializable sebelum dikirim ke Client
  // Component. BigInt dikonversi ke string agar aman diserialisasi RSC.
  const values: CustomerFormValues = {
    id: customer.id.toString(),
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href={`/customers/${customer.id.toString()}`}
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Detail Pelanggan
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Ubah Pelanggan
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Perbarui informasi pelanggan.
            </p>
          </div>
        </header>

        <CustomerForm
          action={updateCustomer}
          customer={values}
          submitLabel="Simpan Perubahan"
        />
      </div>
    </div>
  );
}
