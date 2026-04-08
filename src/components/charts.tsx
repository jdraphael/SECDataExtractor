"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  buildBridgeChartRows,
  buildTrendChartRows,
  buildValuationChartRows,
} from "@/lib/chart-data";
import { formatAccountingCurrency, formatCurrency } from "@/lib/format";
import type { CompanyAnalysis, DashboardAnalysis } from "@/lib/types";

type TooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    name?: string;
    value?: number | string | null;
    color?: string;
    dataKey?: string;
  }>;
  footer?: string;
};

function ChartTooltip({ active, label, payload, footer }: TooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl">
      <p className="font-semibold text-slate-950">{label}</p>
      <div className="mt-2 space-y-2">
        {payload.map((entry) => (
          <div key={`${entry.dataKey}-${entry.name}`} className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="font-medium text-slate-900">{entry.name}</p>
            <p className="text-slate-700">
              {formatAccountingCurrency(
                typeof entry.value === "number" ? entry.value : Number(entry.value ?? null),
                true,
              )}
            </p>
          </div>
        ))}
      </div>
      {footer ? <p className="mt-2 leading-5 text-slate-500">{footer}</p> : null}
    </div>
  );
}

export function TrendChart({ analysis }: { analysis: DashboardAnalysis }) {
  const rows = buildTrendChartRows(analysis);

  return (
    <div className="min-w-0 rounded-[2rem] border border-[#a8c8d7] bg-white/90 p-6 shadow-lg shadow-slate-900/5">
      <h3 className="mb-4 text-lg font-semibold text-slate-900">
        Five-Year Net Income vs Cash Flow from Operations
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={rows}>
          <CartesianGrid stroke="#d5e5ed" strokeDasharray="4 4" />
          <XAxis dataKey="year" stroke="#334155" />
          <YAxis stroke="#334155" tickFormatter={(value) => formatCurrency(value, true)} />
          <Tooltip
            content={
              <ChartTooltip footer="Trend lines compare reported net income with cash flow from operations from the normalized annual filing metrics." />
            }
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="first-solar-netIncome"
            name="First Solar net income"
            stroke="#d97706"
            strokeWidth={3}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="first-solar-cfo"
            name="First Solar CFO"
            stroke="#f59e0b"
            strokeWidth={3}
            strokeDasharray="7 5"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="brookfield-netIncome"
            name="Brookfield net income"
            stroke="#0f766e"
            strokeWidth={3}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="brookfield-cfo"
            name="Brookfield CFO"
            stroke="#14b8a6"
            strokeWidth={3}
            strokeDasharray="7 5"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EarningsBridgeChart({ company }: { company: CompanyAnalysis }) {
  const data = buildBridgeChartRows(company);

  return (
    <div className="min-w-0 rounded-[2rem] border border-[#a8c8d7] bg-white/90 p-6 shadow-lg shadow-slate-900/5">
      <h3 className="mb-4 text-lg font-semibold text-slate-900">
        {company.company.name}: Net Income to CFO Bridge
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid stroke="#d5e5ed" strokeDasharray="4 4" />
          <XAxis
            dataKey="label"
            stroke="#334155"
            interval={0}
            angle={-18}
            textAnchor="end"
            height={80}
          />
          <YAxis stroke="#334155" tickFormatter={(value) => formatCurrency(value, true)} />
          <Tooltip
            content={
              <ChartTooltip footer="This bridge starts with net income and adds the largest operating cash-flow reconciliation items to explain the path to CFO." />
            }
          />
          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ValuationChart({ company }: { company: CompanyAnalysis }) {
  const data = buildValuationChartRows(company);

  return (
    <div className="min-w-0 rounded-[2rem] border border-[#a8c8d7] bg-white/90 p-6 shadow-lg shadow-slate-900/5">
      <h3 className="mb-4 text-lg font-semibold text-slate-900">
        {company.company.ticker}: FCF History and Five-Year NPV Projection
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data}>
          <CartesianGrid stroke="#d5e5ed" strokeDasharray="4 4" />
          <XAxis dataKey="year" stroke="#334155" />
          <YAxis stroke="#334155" tickFormatter={(value) => formatCurrency(value, true)} />
          <Tooltip
            content={
              <ChartTooltip footer="Projected free cash flow uses a constant growth rate and is discounted at the 7% WACC required by the class project." />
            }
          />
          <Legend />
          <Bar
            dataKey="pv"
            name="Discounted PV"
            fill={company.company.accent}
            radius={[8, 8, 0, 0]}
          />
          <Line
            type="monotone"
            dataKey="fcf"
            name="FCF"
            stroke="#111827"
            strokeWidth={3}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
