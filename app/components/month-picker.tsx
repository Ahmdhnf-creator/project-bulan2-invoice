"use client";

import { useRouter } from "next/navigation";
import { IconCalendar } from "@/app/components/icons";

export interface MonthOption {
  value: string;
  label: string;
}

export default function MonthPicker({
  options,
  defaultValue,
}: {
  options: MonthOption[];
  defaultValue: string;
}) {
  const router = useRouter();

  return (
    <div className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-3">
      <IconCalendar className="text-muted" size={16} />
      <select
        id="period"
        name="period"
        aria-label="Pilih periode"
        defaultValue={defaultValue}
        onChange={(event) => {
          router.push(`/?period=${event.target.value}`);
        }}
        className="cursor-pointer bg-transparent text-sm font-medium text-foreground outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
