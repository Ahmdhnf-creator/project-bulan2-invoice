import { auth } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import CustomerForm from "@/app/components/customer-form";
import { createCustomer } from "@/app/actions/customer";

export default async function NewCustomerPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/customers"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Daftar Pelanggan
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Tambah Pelanggan
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Tambahkan pelanggan baru untuk akun Anda.
            </p>
          </div>
        </header>

        <CustomerForm
          action={createCustomer}
          customer={null}
          submitLabel="Tambah Pelanggan"
        />
      </div>
    </div>
  );
}
