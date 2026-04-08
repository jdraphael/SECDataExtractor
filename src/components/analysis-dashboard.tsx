"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { useMemo, useTransition } from "react";

import {
  cx,
  formatAccountingCurrency,
  formatPercent,
  formatRatioValue,
  formatValueByUnit,
} from "@/lib/format";
import type {
  CompanyAnalysis,
  CrossSectionalRow,
  DashboardAnalysis,
  HorizontalLine,
  StatementLine,
  ValueExplanation,
} from "@/lib/types";

const TrendChart = dynamic(
  () => import("@/components/charts").then((module) => module.TrendChart),
  {
    ssr: false,
    loading: () => <ChartPlaceholder heightClass="h-96" />,
  },
);

const EarningsBridgeChart = dynamic(
  () => import("@/components/charts").then((module) => module.EarningsBridgeChart),
  {
    ssr: false,
    loading: () => <ChartPlaceholder heightClass="h-80" />,
  },
);

const ValuationChart = dynamic(
  () => import("@/components/charts").then((module) => module.ValuationChart),
  {
    ssr: false,
    loading: () => <ChartPlaceholder heightClass="h-96" />,
  },
);

function explanationLines(explanation: ValueExplanation) {
  const lines = [explanation.definition];

  if (explanation.displayFormula) {
    lines.push(`Formula: ${explanation.displayFormula}`);
  }

  if (explanation.sourceLabel) {
    lines.push(`Source: ${explanation.sourceLabel}`);
  }

  if (explanation.provenance?.concept) {
    lines.push(`Concept: ${explanation.provenance.concept}`);
  }

  if (explanation.provenance?.filed) {
    lines.push(`Filed: ${explanation.provenance.filed}`);
  }

  if (explanation.notes.length) {
    lines.push(...explanation.notes);
  }

  return lines;
}

function HoverNote({
  explanation,
  children,
  className,
}: {
  explanation: ValueExplanation;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("group relative inline-flex cursor-help items-center", className)}>
      <span className="border-b border-dotted border-slate-400/80">{children}</span>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-80 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 p-3 text-left text-xs leading-5 text-slate-700 shadow-2xl group-hover:block group-focus-within:block">
        {explanationLines(explanation).map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}

function ChartPlaceholder({ heightClass }: { heightClass: string }) {
  return (
    <div
      className={cx(
        heightClass,
        "rounded-[2rem] border border-[#a8c8d7] bg-white/90 p-6 shadow-lg shadow-slate-900/5",
      )}
    />
  );
}

function SectionTitle({
  eyebrow,
  title,
  summary,
}: {
  eyebrow: string;
  title: string;
  summary: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-700">
        {eyebrow}
      </p>
      <h2 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="max-w-4xl text-sm leading-7 text-slate-600">{summary}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  explanation,
  tone,
}: {
  label: string;
  value: string;
  explanation: ValueExplanation;
  tone: string;
}) {
  return (
    <div className={cx("rounded-3xl border p-4", tone)}>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-700">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">
        <HoverNote explanation={explanation}>{value}</HoverNote>
      </p>
    </div>
  );
}

function CompanySummary({ company }: { company: CompanyAnalysis }) {
  const ratioHighlights = company.ratios.filter((ratio) =>
    ["netMargin", "currentRatio", "debtToEquity", "priceToBook"].includes(ratio.key),
  );

  return (
    <article
      className="rounded-[2rem] border border-[#a8c8d7] bg-white/92 p-6 shadow-xl shadow-slate-900/5"
      style={{ borderTopColor: company.company.accent, borderTopWidth: 5 }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            {company.company.ticker}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-950">
            {company.company.name}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            Annual filing: {company.annualFiling?.form ?? "N/A"} filed{" "}
            {company.annualFiling?.filed ?? "N/A"}
          </p>
        </div>
        <div className="rounded-3xl bg-slate-950 px-5 py-4 text-right text-white">
          <p className="text-xs uppercase tracking-[0.25em] text-white/60">NPV</p>
          <p className="mt-2 text-2xl font-semibold">
            <HoverNote
              explanation={{
                definition: "Net present value of the five-year free cash flow projection.",
                formula: "sum(projectedFreeCashFlow / (1 + 0.07)^n)",
                displayFormula: "Sum of discounted projected FCF at 7%",
                sourceKind: "derived",
                sourceLabel: "Valuation model",
                provenance: null,
                notes: [
                  `Growth method: ${company.valuation.growthMethod}`,
                  `Growth rate: ${formatPercent(company.valuation.growthRate)}`,
                ],
              }}
            >
              {formatAccountingCurrency(company.valuation.npv, true)}
            </HoverNote>
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Revenue"
          value={formatAccountingCurrency(company.rawMetrics.revenue.value, true)}
          explanation={company.rawMetrics.revenue.explanation}
          tone="border-amber-200 bg-[#eef6fa]"
        />
        <SummaryCard
          label="Net Income"
          value={formatAccountingCurrency(company.rawMetrics.netIncome.value, true)}
          explanation={company.rawMetrics.netIncome.explanation}
          tone="border-teal-200 bg-[#f6fbfd]"
        />
        <SummaryCard
          label="CFO"
          value={formatAccountingCurrency(company.rawMetrics.cashFromOperations.value, true)}
          explanation={company.rawMetrics.cashFromOperations.explanation}
          tone="border-slate-200 bg-[#f8fbfc]"
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ratioHighlights.map((ratio) => (
          <div key={ratio.key} className="rounded-3xl border border-[#c5dbe6] bg-white p-4">
            <p className="text-sm text-slate-500">{ratio.label}</p>
            <p className="mt-2 text-xl font-semibold text-slate-950">
              <HoverNote explanation={ratio.explanation}>{formatRatioValue(ratio)}</HoverNote>
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

function RowLabel({
  label,
  indentLevel,
  isTotal,
}: {
  label: string;
  indentLevel: number;
  isTotal: boolean;
}) {
  return (
    <span
      className={cx(
        "block",
        isTotal ? "font-semibold text-slate-950" : "text-slate-900",
      )}
      style={{ paddingLeft: `${indentLevel * 1.1}rem` }}
    >
      {label}
    </span>
  );
}

function AccountingValue({
  value,
  unit,
  explanation,
  compact = true,
}: {
  value: number | null;
  unit: "usd" | "percent" | "ratio" | "shares" | "USD";
  explanation: ValueExplanation;
  compact?: boolean;
}) {
  const formatted =
    unit === "usd" || unit === "USD"
      ? formatAccountingCurrency(value, compact)
      : formatValueByUnit(value, unit, compact);

  return (
    <HoverNote explanation={explanation}>
      <span className="tabular-nums">{formatted}</span>
    </HoverNote>
  );
}

function tableRowTone(index: number, isTotal: boolean) {
  if (isTotal) {
    return "bg-[#d8ebf3] border-t border-b border-slate-400";
  }

  return index % 2 === 0 ? "bg-white" : "bg-[#eef7fb]";
}

function CrossSectionalTable({
  title,
  rows,
}: {
  title: string;
  rows: CrossSectionalRow[];
}) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-[#a8c8d7] bg-white/92 shadow-xl shadow-slate-900/5">
      <div className="border-b border-[#c5dbe6] px-6 py-5">
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[#d0e6ef] text-xs uppercase tracking-[0.2em] text-slate-700">
            <tr>
              <th className="px-4 py-3 text-left">Metric</th>
              <th className="px-4 py-3 text-right">First Solar</th>
              <th className="px-4 py-3 text-right">Brookfield</th>
              <th className="px-4 py-3 text-right">Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key} className={tableRowTone(index, false)}>
                <td className="px-4 py-3 font-medium text-slate-950">{row.label}</td>
                <td className="px-4 py-3 text-right">
                  <AccountingValue
                    value={row.firstSolar}
                    unit={row.unit}
                    explanation={row.firstSolarExplanation}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <AccountingValue
                    value={row.brookfield}
                    unit={row.unit}
                    explanation={row.brookfieldExplanation}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <AccountingValue
                    value={row.delta}
                    unit={row.unit}
                    explanation={row.deltaExplanation}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatementTable({
  title,
  company,
  rows,
}: {
  title: string;
  company: CompanyAnalysis;
  rows: StatementLine[];
}) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-[#a8c8d7] bg-white/92 shadow-xl shadow-slate-900/5">
      <div className="border-b border-[#c5dbe6] px-6 py-5">
        <h3 className="text-lg font-semibold text-slate-950">
          {company.company.ticker}: {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[#d0e6ef] text-xs uppercase tracking-[0.2em] text-slate-700">
            <tr>
              <th className="px-4 py-3 text-left">Line Item</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-right">Common Size</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key} className={tableRowTone(index, row.isTotal)}>
                <td className="px-4 py-3">
                  <RowLabel
                    label={row.label}
                    indentLevel={row.indentLevel}
                    isTotal={row.isTotal}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <AccountingValue
                    value={row.value}
                    unit="usd"
                    explanation={row.explanation}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <AccountingValue
                    value={row.basePercent}
                    unit="percent"
                    explanation={row.basePercentExplanation}
                    compact={false}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HorizontalTable({
  title,
  company,
  rows,
}: {
  title: string;
  company: CompanyAnalysis;
  rows: HorizontalLine[];
}) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-[#a8c8d7] bg-white/92 shadow-xl shadow-slate-900/5">
      <div className="border-b border-[#c5dbe6] px-6 py-5">
        <h3 className="text-lg font-semibold text-slate-950">
          {company.company.ticker}: {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[#d0e6ef] text-xs uppercase tracking-[0.16em] text-slate-700">
            <tr>
              <th className="px-4 py-3 text-left">Line Item</th>
              <th className="px-4 py-3 text-right">{company.selectedYear}</th>
              <th className="px-4 py-3 text-right">{company.previousYear}</th>
              <th className="px-4 py-3 text-right">Change</th>
              <th className="px-4 py-3 text-right">% Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key} className={tableRowTone(index, row.isTotal)}>
                <td className="px-4 py-3">
                  <RowLabel
                    label={row.label}
                    indentLevel={row.indentLevel}
                    isTotal={row.isTotal}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <AccountingValue
                    value={row.currentValue}
                    unit="usd"
                    explanation={row.currentExplanation}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <AccountingValue
                    value={row.previousValue}
                    unit="usd"
                    explanation={row.previousExplanation}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <AccountingValue
                    value={row.absoluteChange}
                    unit="usd"
                    explanation={row.absoluteChangeExplanation}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <AccountingValue
                    value={row.percentChange}
                    unit="percent"
                    explanation={row.percentChangeExplanation}
                    compact={false}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RatioGrid({ company }: { company: CompanyAnalysis }) {
  const groups = useMemo(
    () =>
      ["profitability", "liquidity", "leverage", "market"].map((category) => ({
        category,
        items: company.ratios.filter((ratio) => ratio.category === category),
      })),
    [company.ratios],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {groups.map((group) => (
        <div
          key={group.category}
          className="rounded-[2rem] border border-[#a8c8d7] bg-white/92 p-6 shadow-xl shadow-slate-900/5"
        >
          <h3 className="text-lg font-semibold capitalize text-slate-950">
            {group.category}
          </h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {group.items.map((ratio) => (
              <div key={ratio.key} className="rounded-3xl border border-[#c5dbe6] bg-[#f8fbfc] p-4">
                <p className="text-sm text-slate-500">{ratio.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  <HoverNote explanation={ratio.explanation}>{formatRatioValue(ratio)}</HoverNote>
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                  {ratio.source === "market" ? "Market + SEC" : "SEC / Filing"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RawMetrics({ company }: { company: CompanyAnalysis }) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-[#a8c8d7] bg-white/92 shadow-xl shadow-slate-900/5">
      <div className="border-b border-[#c5dbe6] px-6 py-5">
        <h3 className="text-lg font-semibold text-slate-950">
          {company.company.ticker}: Raw Extracted Metrics
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[#d0e6ef] text-xs uppercase tracking-[0.16em] text-slate-700">
            <tr>
              <th className="px-4 py-3 text-left">Metric</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-left">Concept</th>
              <th className="px-4 py-3 text-left">Source</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(company.rawMetrics).map((metric, index) => (
              <tr key={metric.key} className={tableRowTone(index, false)}>
                <td className="px-4 py-3 font-medium text-slate-950">{METRIC_TITLES[metric.key]}</td>
                <td className="px-4 py-3 text-right">
                  <AccountingValue
                    value={metric.value}
                    unit={metric.unit === "shares" ? "shares" : "USD"}
                    explanation={metric.explanation}
                  />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {metric.provenance?.concept ?? metric.label}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {metric.explanation.sourceLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const METRIC_TITLES: Record<string, string> = {
  revenue: "Revenue",
  operatingIncome: "Operating income",
  netIncome: "Net income",
  cashFromOperations: "Cash flow from operations",
  capex: "Capital expenditures",
  assets: "Total assets",
  currentAssets: "Current assets",
  currentLiabilities: "Current liabilities",
  liabilities: "Total liabilities",
  equity: "Equity",
  cash: "Cash and equivalents",
  receivables: "Receivables",
  inventory: "Inventory",
  ppe: "Property, plant and equipment",
  debt: "Debt / borrowings",
  sharesOutstanding: "Shares outstanding",
  depreciation: "Depreciation and amortization",
  receivablesChange: "Change in receivables",
  payablesChange: "Change in payables",
  inventoryChange: "Change in inventory",
  deferredTax: "Deferred tax",
  shareBasedCompensation: "Share-based compensation",
};

export function AnalysisDashboard({ analysis }: { analysis: DashboardAnalysis }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const exportHref = `/api/export.xlsx?year=${analysis.year}`;

  function handleYearChange(nextYear: string) {
    startTransition(() => {
      router.push({
        pathname: router.pathname,
        query: { ...router.query, year: nextYear },
      });
    });
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#eef6fa_0%,_#f7fbfd_35%,_#edf5f2_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-5 py-8 sm:px-8 lg:px-10">
        <header className="overflow-hidden rounded-[2.5rem] border border-white/60 bg-slate-950 px-8 py-10 text-white shadow-2xl shadow-slate-950/15">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">
                MBA515 | Accounting For Management Decisions
              </p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
                SEC Financial Comparison Dashboard
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300">
                Side-by-side financial extraction, accounting-style statements,
                ratio comparisons, five-year trend visuals, earnings quality review,
                and Excel-ready support for First Solar and Brookfield Renewable Corp.
              </p>
            </div>
            <div className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur">
              <label className="text-xs uppercase tracking-[0.25em] text-slate-400">
                Fiscal year
              </label>
              <select
                value={analysis.year.toString()}
                onChange={(event) => handleYearChange(event.target.value)}
                className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
              >
                {analysis.availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <a
                href={exportHref}
                className="rounded-2xl bg-amber-400 px-4 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
              >
                Download Excel Workbook
              </a>
              <p className="text-xs text-slate-400">
                {isPending ? "Refreshing analysis..." : `Generated ${analysis.generatedAt}`}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          {analysis.companies.map((company) => (
            <CompanySummary key={company.company.key} company={company} />
          ))}
        </section>

        <section className="space-y-6">
          <SectionTitle
            eyebrow="Comparison"
            title="Cross-Sectional View"
            summary="These side-by-side tables compare the latest common annual year using accounting-style presentation and hover notes for formulas, definitions, and sources."
          />
          <div className="grid gap-6 xl:grid-cols-2">
            <CrossSectionalTable
              title="Common-Size Income Statement"
              rows={analysis.crossSectionalCommonSize}
            />
            <CrossSectionalTable title="Ratio Comparison" rows={analysis.crossSectionalRatios} />
          </div>
        </section>

        <section className="space-y-6">
          <SectionTitle
            eyebrow="Statements"
            title="Common-Size and Vertical Analysis"
            summary="Standardized comparable statement lines are normalized by revenue for income measures and by total assets for balance-sheet measures."
          />
          <div className="grid gap-6 xl:grid-cols-2">
            {analysis.companies.map((company) => (
              <StatementTable
                key={`${company.company.key}-income`}
                title="Common-Size Income Statement"
                company={company}
                rows={company.incomeStatement}
              />
            ))}
            {analysis.companies.map((company) => (
              <StatementTable
                key={`${company.company.key}-balance`}
                title="Common-Size Balance Sheet"
                company={company}
                rows={company.balanceSheet}
              />
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <SectionTitle
            eyebrow="Horizontal"
            title="Year-Over-Year Analysis"
            summary={`These tables compare FY ${analysis.year} against FY ${analysis.previousYear} using absolute and percentage changes.`}
          />
          <div className="grid gap-6 xl:grid-cols-2">
            {analysis.companies.map((company) => (
              <HorizontalTable
                key={`${company.company.key}-horizontal-income`}
                title="Income Statement Horizontal Analysis"
                company={company}
                rows={company.horizontalIncome}
              />
            ))}
            {analysis.companies.map((company) => (
              <HorizontalTable
                key={`${company.company.key}-horizontal-balance`}
                title="Balance Sheet Horizontal Analysis"
                company={company}
                rows={company.horizontalBalanceSheet}
              />
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <SectionTitle
            eyebrow="Ratios"
            title="Profitability, Liquidity, Leverage, and Market Value"
            summary="Each ratio card includes a hover note showing the formula, definition, and source used to produce the displayed value."
          />
          <div className="grid gap-6 xl:grid-cols-2">
            {analysis.companies.map((company) => (
              <RatioGrid key={`${company.company.key}-ratios`} company={company} />
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <SectionTitle
            eyebrow="Trends"
            title="Five-Year Performance and Earnings Quality"
            summary="Hover over chart points to review what each series represents and how the displayed values relate to the normalized annual filing metrics."
          />
          <TrendChart analysis={analysis} />
          <div className="grid gap-6 xl:grid-cols-2">
            {analysis.companies.map((company) => (
              <EarningsBridgeChart key={`${company.company.key}-bridge`} company={company} />
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <SectionTitle
            eyebrow="Valuation"
            title="Free Cash Flow and NPV"
            summary="Projected annual FCF uses a constant growth rate from either five-year FCF CAGR or the revenue CAGR fallback, discounted at a 7% WACC."
          />
          <div className="grid gap-6 xl:grid-cols-2">
            {analysis.companies.map((company) => (
              <ValuationChart key={`${company.company.key}-valuation`} company={company} />
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <SectionTitle
            eyebrow="Evidence"
            title="Raw Extracted Data"
            summary="Every row below is traceable to either SEC companyfacts, the saved local filing HTML, or a documented derivation."
          />
          <div className="grid gap-6 xl:grid-cols-2">
            {analysis.companies.map((company) => (
              <RawMetrics key={`${company.company.key}-raw`} company={company} />
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-[#a8c8d7] bg-white/92 p-6 shadow-xl shadow-slate-900/5">
          <SectionTitle
            eyebrow="Notes"
            title="Methodology and Sources"
            summary="These assumptions are carried into both the UI and the exported workbook so the analysis remains transparent for your report and presentation."
          />
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <ul className="space-y-3 text-sm leading-7 text-slate-700">
              {analysis.notes.map((note) => (
                <li key={note} className="rounded-3xl bg-[#eef7fb] px-4 py-3">
                  {note}
                </li>
              ))}
            </ul>
            <div className="rounded-[2rem] bg-slate-950 p-6 text-sm text-white">
              <h3 className="text-lg font-semibold">References</h3>
              <div className="mt-4 space-y-3">
                {analysis.sourceLinks.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-white/10 px-4 py-3 text-slate-200 transition hover:bg-white/5"
                  >
                    {source.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
