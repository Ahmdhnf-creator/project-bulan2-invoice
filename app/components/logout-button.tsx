"use client";

import { useFormStatus } from "react-dom";
import { logout } from "@/app/actions/auth";

function LogoutButtonField({ className }: { className?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        className ??
        "inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }
    >
      {pending ? "Logging out…" : "Logout"}
    </button>
  );
}

export default function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <LogoutButtonField className={className} />
    </form>
  );
}
