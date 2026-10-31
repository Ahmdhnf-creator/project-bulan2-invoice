"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import LogoutButton from "@/app/components/logout-button";
import ThemeToggle from "@/app/components/theme-toggle";
import {
  IconCard,
  IconChart,
  IconDoc,
  IconFolder,
  IconHome,
  IconMenu,
  IconSettings,
  IconUsers,
  IconWallet,
  IconX,
} from "@/app/components/icons";

const NAV_ITEMS = [
  { href: "/", label: "Ringkasan", Icon: IconHome },
  { href: "/projects", label: "Proyek", Icon: IconFolder },
  { href: "/invoices", label: "Invoice", Icon: IconDoc },
  { href: "/payments", label: "Pembayaran", Icon: IconCard },
  { href: "/expenses", label: "Pengeluaran", Icon: IconWallet },
  { href: "/customers", label: "Pelanggan", Icon: IconUsers },
  { href: "/reports", label: "Laporan", Icon: IconChart },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initials =
    userName
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  const nav = (
    <>
      <Link
        href="/"
        className="flex items-center gap-2.5 px-5 py-5"
        onClick={() => setOpen(false)}
      >
        <Image src="/artha-logo-13836d.png" alt="" width={84} height={72} className="h-5 w-auto" />
        <span className="text-lg font-semibold tracking-tight text-white">
          Artha
        </span>
      </Link>

      <nav className="flex-1 space-y-1 px-3" aria-label="Navigasi utama">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-sidebar-active text-white"
                  : "text-sidebar-text hover:bg-white/5 hover:text-white"
              }`}
              {...(active ? { "aria-current": "page" } : {})}
            >
              <Icon className="h-5 w-5 shrink-0" size={20} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-white/10 px-3 py-4">
        <Link
          href="/business-profile"
          onClick={() => setOpen(false)}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive(pathname, "/business-profile")
              ? "bg-sidebar-active text-white"
              : "text-sidebar-text hover:bg-white/5 hover:text-white"
          }`}
        >
          <IconSettings className="h-5 w-5 shrink-0" size={20} />
          Pengaturan
        </Link>

        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">
              {userName}
            </span>
          </span>
          <ThemeToggle />
        </div>

        <LogoutButton className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-sm font-medium text-sidebar-text transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50" />
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Tutup menu" : "Buka menu"}
        className="fixed left-3 top-3 z-50 rounded-lg bg-sidebar p-2 text-white shadow-md md:hidden"
      >
        {open ? <IconX size={22} /> : <IconMenu size={22} />}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar transition-transform md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {nav}
      </aside>    </>
  );
}
