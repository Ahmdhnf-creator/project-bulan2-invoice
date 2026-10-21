import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import ProjectForm from "@/app/components/project-form";
import { updateProject } from "@/app/actions/project";

interface ProjectEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectEditPage({
  params,
}: ProjectEditPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const projectId = BigInt(id);
  const userId = BigInt(session.user.id);

  // Hanya proyek milik pengguna yang sedang login yang dapat diubah;
  // proyek lain atau tidak ada → 404.
  const [project, customers] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, userId } }),
    prisma.customer.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!project) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href={`/projects/${project.id.toString()}`}
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              ← Detail Proyek
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Ubah Proyek
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Perbarui informasi proyek.
            </p>
          </div>
        </header>

        <ProjectForm
          action={updateProject}
          project={project}
          customers={customers}
          submitLabel="Simpan Perubahan"
        />
      </div>
    </div>
  );
}
