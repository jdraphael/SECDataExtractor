import type { CompanyAnalysis, DashboardAnalysis } from "@/lib/types";

export function buildTrendChartRows(analysis: DashboardAnalysis) {
  return analysis.availableYears.map((year) => {
    const row: Record<string, number | string | null> = { year };

    analysis.companies.forEach((company) => {
      const trend = company.trends.find((point) => point.year === year);
      row[`${company.company.key}-netIncome`] = trend?.netIncome ?? null;
      row[`${company.company.key}-cfo`] = trend?.cashFromOperations ?? null;
    });

    return row;
  });
}

export function buildBridgeChartRows(company: CompanyAnalysis) {
  return [
    {
      label: "Net income",
      value: company.earningsBridge.netIncome ?? 0,
      color: company.company.accent,
    },
    ...company.earningsBridge.steps.map((step) => ({
      label: step.label,
      value: step.value,
      color: step.value >= 0 ? "#2563eb" : "#dc2626",
    })),
    {
      label: "Operating cash flow",
      value: company.earningsBridge.operatingCashFlow ?? 0,
      color: "#111827",
    },
  ];
}

export function buildValuationChartRows(company: CompanyAnalysis) {
  const history = company.trends.map((point) => ({
    year: point.year,
    fcf: point.freeCashFlow,
    pv: null,
  }));
  const projected = company.valuation.projected.map((point) => ({
    year: point.year,
    fcf: point.projectedFreeCashFlow,
    pv: point.presentValue,
  }));

  return [...history, ...projected];
}
