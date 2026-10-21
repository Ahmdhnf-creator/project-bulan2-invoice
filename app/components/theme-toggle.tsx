"use client";

import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "@/app/components/icons";

const STORAGE_KEY = "billmate-theme";
const CHANGE_EVENT = "billmate-theme-change";

function readTheme(): "light" | "dark" {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onStoreChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
    mq.removeEventListener("change", onStoreChange);
  };
}

function toggleTheme() {
  const next = readTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // localStorage unavailable (private mode) — theme applies for this visit only.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as const);

  return (
    <button
      type="button"
      aria-label="Ganti mode tampilan"
      aria-pressed={theme === "dark"}
      onClick={toggleTheme}
      className="ml-auto shrink-0 rounded-lg p-2 text-sidebar-text transition-colors hover:bg-white/5 hover:text-white"
    >
      {theme === "dark" ? <IconMoon size={18} /> : <IconSun size={18} />}
    </button>
  );
}
