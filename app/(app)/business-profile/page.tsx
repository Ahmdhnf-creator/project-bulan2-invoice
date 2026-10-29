import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import BusinessProfileForm, {
  type BusinessProfileFormValues,
} from "@/app/components/business-profile-form";

export default async function BusinessProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Read is scoped to the logged-in user only.
  const userId = BigInt(session.user.id);
  const profile = await prisma.businessProfile.findUnique({ where: { userId } });

  // Konversi model Prisma ke DTO serializable sebelum dikirim ke Client
  // Component. Hanya field string yang dibutuhkan formulir, tanpa BigInt.
  const values: BusinessProfileFormValues | null = profile
    ? {
        businessName: profile.businessName,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        taxId: profile.taxId,
      }
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Business Profile
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Kelola informasi bisnis Anda.
            </p>
          </div>
        </header>

        <BusinessProfileForm profile={values} />
      </div>
    </div>
  );
}
