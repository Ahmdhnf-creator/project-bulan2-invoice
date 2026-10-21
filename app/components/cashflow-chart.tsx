export interface CashflowPoint {
  label: string;
  masuk: number;
  keluar: number;
}

const W = 640;
const H = 240;
const PAD_LEFT = 48;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

function niceCeil(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

function formatJt(value: number): string {
  if (value === 0) {
    return "0";
  }
  return `${Math.round(value / 1_000_000)} jt`;
}

export default function CashflowChart({ series }: { series: CashflowPoint[] }) {
  const innerW = W - PAD_LEFT - PAD_RIGHT;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const maxValue = niceCeil(
    Math.max(1, ...series.flatMap((point) => [point.masuk, point.keluar])),
  );
  const xAt = (index: number) =>
    PAD_LEFT + (series.length <= 1 ? innerW / 2 : (index / (series.length - 1)) * innerW);
  const yAt = (value: number) => PAD_TOP + innerH - (value / maxValue) * innerH;

  const line = (key: "masuk" | "keluar") =>
    series.map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(1)} ${yAt(point[key]).toFixed(1)}`).join(" ");

  const areaPath =
    series.length > 0
      ? `${line("masuk")} L ${xAt(series.length - 1).toFixed(1)} ${PAD_TOP + innerH} L ${xAt(0).toFixed(1)} ${PAD_TOP + innerH} Z`
      : "";

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * maxValue);

  return (
    <div id="cashflow-chart" className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Arus kas</h2>
          <p className="text-sm text-muted">
            Pergerakan pemasukan dan pengeluaran dalam 6 bulan terakhir.
          </p>
        </div>
        <div id="chart-legend" className="flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" />
            Masuk
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#9db8ab]" />
            Keluar
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Grafik arus kas 6 bulan terakhir"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_LEFT}
              x2={W - PAD_RIGHT}
              y1={yAt(tick)}
              y2={yAt(tick)}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 8}
              y={yAt(tick) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--muted)"
            >
              {formatJt(tick)}
            </text>
          </g>
        ))}
        {series.map((point, index) => (
          <text
            key={point.label}
            x={xAt(index)}
            y={H - 10}
            textAnchor="middle"
            fontSize={11}
            fill="var(--muted)"
          >
            {point.label}
          </text>
        ))}
        {series.length > 0 ? (
          <>
            <path d={areaPath} fill="var(--brand)" opacity={0.12} />
            <path
              d={line("masuk")}
              fill="none"
              stroke="var(--brand)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={line("keluar")}
              fill="none"
              stroke="#9db8ab"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {series.map((point, index) => (
              <circle
                key={`m-${point.label}`}
                cx={xAt(index)}
                cy={yAt(point.masuk)}
                r={3.5}
                fill="var(--brand)"
              />
            ))}
            {series.map((point, index) => (
              <circle
                key={`k-${point.label}`}
                cx={xAt(index)}
                cy={yAt(point.keluar)}
                r={3}
                fill="#9db8ab"
              />
            ))}
          </>
        ) : null}
      </svg>
    </div>
  );
}
