import { auth } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/app/components/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar userName={session.user.name ?? "Pengguna"} />
      <div className="pt-14 md:pl-64 md:pt-0">
        <main>{children}</main>
      </div>
    </div>
  );
}
