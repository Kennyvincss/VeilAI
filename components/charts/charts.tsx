"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPct, formatUsd } from "@/lib/utils/format";

/** Categorical palette: distinguishable on white, ordered by brand priority. */
export const PALETTE = ["#7C6CF0", "#111216", "#A3C93A", "#3B6FE0", "#F2A93B", "#EC6FA9", "#9EA2AC"];

const tooltipStyle = {
  background: "#ffffff",
  border: "1px solid rgba(15,17,26,0.08)",
  borderRadius: 12,
  fontSize: 12,
  color: "#0e0f13",
  boxShadow: "0 12px 32px -14px rgba(15,17,26,0.25)",
};

export function AllocationDonut({ data }: { data: { symbol: string; valueUsd: number; pct: number }[] }) {
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="h-44 w-44 shrink-0" role="img" aria-label={`Allocation: ${data.map((d) => `${d.symbol} ${d.pct.toFixed(1)}%`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="valueUsd" nameKey="symbol" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive>
              {data.map((d, i) => (
                <Cell key={d.symbol} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatUsd(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-2">
        {data.map((d, i) => (
          <li key={d.symbol} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden />
              <span className="truncate">{d.symbol}</span>
            </span>
            <span className="flex items-center gap-3 font-mono text-xs">
              <span className="text-muted">{formatUsd(d.valueUsd, { compact: true })}</span>
              <span className="w-12 text-right">{formatPct(d.pct, { digits: 1 })}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ActivityBars({ data, height = 180 }: { data: { date: string; count: number; nearVolume?: number }[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`Daily activity over ${data.length} days`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} stroke="rgba(15,17,26,0.06)" />
          <XAxis dataKey="date" tick={{ fill: "#9ea2ac", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} minTickGap={16} />
          <YAxis allowDecimals={false} tick={{ fill: "#9ea2ac", fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(124,108,240,0.08)" }} formatter={(v, name) => [v, name === "count" ? "Transactions" : "NEAR volume"]} />
          <Bar dataKey="count" fill="#7C6CF0" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryBars({ data }: { data: { label: string; score: number | null }[] }) {
  const rows = data.map((d) => ({ ...d, value: d.score ?? 0 }));
  return (
    <div style={{ height: Math.max(180, rows.length * 34) }} role="img" aria-label={`Risk categories: ${data.map((d) => `${d.label} ${d.score ?? "n/a"}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="rgba(15,17,26,0.06)" />
          <XAxis type="number" domain={[0, 100]} tick={{ fill: "#9ea2ac", fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" width={150} tick={{ fill: "#676b76", fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(15,17,26,0.03)" }} formatter={(v, _n, item) => [(item?.payload as { score: number | null })?.score ?? "insufficient data", "Score"]} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
            {rows.map((r) => (
              <Cell key={r.label} fill={r.score === null ? "#e6e7eb" : scoreColor(r.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function scoreColor(score: number) {
  if (score < 25) return "#15A150";
  if (score < 45) return "#7FB52A";
  if (score < 65) return "#E0960F";
  return "#E5484D";
}

/** Semi-circular score gauge (SVG, no chart lib). */
export function ScoreGauge({ score, label }: { score: number | null; label: string }) {
  const r = 70;
  const c = Math.PI * r;
  const pct = score === null ? 0 : Math.min(100, Math.max(0, score)) / 100;
  return (
    <div className="relative mx-auto w-full max-w-[220px]" role="img" aria-label={`Overall risk score ${score ?? "unavailable"} out of 100, ${label}`}>
      <svg viewBox="0 0 180 104" className="w-full">
        <path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke="rgba(15,17,26,0.07)" strokeWidth="14" strokeLinecap="round" />
        {score !== null && (
          <path
            d="M20 94 A70 70 0 0 1 160 94"
            fill="none"
            stroke={scoreColor(score)}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            style={{ transition: "stroke-dasharray 900ms cubic-bezier(.22,1,.36,1)" }}
          />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center">
        <div className="font-mono text-4xl font-semibold" style={{ color: score === null ? "#9ea2ac" : scoreColor(score) }}>
          {score === null ? "—" : Math.round(score)}
        </div>
        <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      </div>
    </div>
  );
}
