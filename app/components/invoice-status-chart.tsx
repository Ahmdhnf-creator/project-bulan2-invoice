export interface InvoiceStatusCounts {
  lunas: number;
  belum: number;
  terlambat: number;
}

const COLORS = {
  lunas: "var(--brand)",
  belum: "#9db8ab",
  terlambat: "var(--amber-brand)",
};

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ROWS: { key: keyof InvoiceStatusCounts; label: string }[] = [
  { key: "lunas", label: "Lunas" },
  { key: "belum", label: "Belum lunas" },
  { key: "terlambat", label: "Terlambat" },
];

function buildSegments(counts: InvoiceStatusCounts, total: number) {
  let offset = 0;
  return ROWS.map((row) => {
    const value = counts[row.key];
    const length = total > 0 ? (value / total) * CIRCUMFERENCE : 0;
    const segment = { ...row, value, length, offset };
    offset += length;
    return segment;
  });
}

export default function InvoiceStatusChart({ counts }: { counts: InvoiceStatusCounts }) {
  const total = counts.lunas + counts.belum + counts.terlambat;
  const segments = buildSegments(counts, total);

  return (
    <div id="status-donut" className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 3.5V12l6 4" />
          </svg>
        </span>
        <div>
          <h2 className="text-base font-semibold">Status invoice</h2>
          <p className="text-sm text-muted">Ringkasan status invoice Anda.</p>
        </div>
      </div>

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Belum ada invoice.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative mx-auto h-40 w-40">
            <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90">
              <circle
                cx="80"
                cy="80"
                r={RADIUS}
                fill="none"
                stroke="var(--line)"
                strokeWidth={20}
              />
              {segments
                .filter((segment) => segment.length > 0)
                .map((segment) => (
                  <circle
                    key={segment.key}
                    cx="80"
                    cy="80"
                    r={RADIUS}
                    fill="none"
                    stroke={COLORS[segment.key]}
                    strokeWidth={20}
                    strokeDasharray={`${segment.length} ${CIRCUMFERENCE - segment.length}`}
                    strokeDashoffset={-segment.offset}
                  />
                ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span id="donut-total" className="text-2xl font-semibold">
                {total}
              </span>
              <span className="text-xs text-muted">Total invoice</span>
            </div>
          </div>

          <ul className="min-w-40 flex-1 space-y-3">
            {segments.map((segment) => (
              <li
                key={segment.key}
                className="flex items-center gap-3 border-b border-line pb-2 last:border-0"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: COLORS[segment.key] }}
                />
                <span className="flex-1 text-sm font-medium">{segment.label}</span>
                <span id={`donut-${segment.key}-count`} className="text-sm font-semibold">
                  {segment.value}
                </span>
                <span className="w-10 text-right text-xs text-muted">
                  {Math.round((segment.value / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
