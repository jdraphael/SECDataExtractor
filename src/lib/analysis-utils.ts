import {
  BALANCE_SHEET_ORDER,
  DISCOUNT_RATE,
  INCOME_STATEMENT_ORDER,
  METRIC_LABELS,
  TREND_YEARS,
} from "@/lib/config";
import type {
  HorizontalLine,
  MetricKey,
  ProjectionPoint,
  Provenance,
  RatioValue,
  ScalarMetric,
  StatementKey,
  StatementLine,
  TrendPoint,
  ValueExplanation,
} from "@/lib/types";

type MetricInput = Record<MetricKey, ScalarMetric | number | null>;

export function divide(numerator: number | null, denominator: number | null) {
  if (
    numerator === null ||
    denominator === null ||
    denominator === 0 ||
    Number.isNaN(numerator) ||
    Number.isNaN(denominator)
  ) {
    return null;
  }

  return numerator / denominator;
}

export function growthRate(
  start: number | null,
  end: number | null,
  periods: number,
) {
  if (
    start === null ||
    end === null ||
    start <= 0 ||
    end <= 0 ||
    periods <= 0
  ) {
    return null;
  }

  return (end / start) ** (1 / periods) - 1;
}

function fallbackExplanation(definition: string): ValueExplanation {
  return {
    definition,
    formula: null,
    displayFormula: null,
    sourceKind: "derived",
    sourceLabel: "Standardized analysis layer",
    provenance: null,
    notes: [],
  };
}

function mergeProvenance(
  ...provenances: Array<Provenance | null | undefined>
) {
  return provenances.find(Boolean) ?? null;
}

function derivedExplanation(
  definition: string,
  formula: string,
  displayFormula: string,
  notes: string[],
  ...provenances: Array<Provenance | null | undefined>
): ValueExplanation {
  return {
    definition,
    formula,
    displayFormula,
    sourceKind: "derived",
    sourceLabel: "Derived from normalized financial metrics",
    provenance: mergeProvenance(...provenances),
    notes,
  };
}

function metric(metricMap: MetricInput, key: MetricKey): ScalarMetric {
  const raw = metricMap[key];
  if (raw && typeof raw === "object" && "value" in raw) {
    return {
      ...raw,
      explanation:
        raw.explanation ?? fallbackExplanation(`${METRIC_LABELS[key]} is unavailable.`),
    };
  }

  return {
    key,
    label: METRIC_LABELS[key],
    unit: key === "sharesOutstanding" ? "shares" : "USD",
    value: typeof raw === "number" ? raw : null,
    provenance: null,
    explanation:
      typeof raw === "number"
        ? fallbackExplanation(`${METRIC_LABELS[key]} supplied by the calculation input.`)
        : fallbackExplanation(`${METRIC_LABELS[key]} is unavailable.`),
  };
}

function statementLabel(key: StatementKey) {
  const labels: Record<StatementKey, string> = {
    revenue: "Revenue",
    operatingCosts: "Operating costs",
    operatingIncome: "Operating income",
    netIncome: "Net income",
    cashFromOperations: "Cash flow from operations",
    capex: "Capital expenditures",
    freeCashFlow: "Free cash flow",
    assets: "Total assets",
    currentAssets: "Current assets",
    cash: "Cash and equivalents",
    receivables: "Receivables",
    inventory: "Inventory",
    ppe: "Property, plant and equipment",
    liabilities: "Total liabilities",
    currentLiabilities: "Current liabilities",
    debt: "Debt / borrowings",
    equity: "Equity",
  };

  return labels[key];
}

function statementMeta(key: StatementKey) {
  const meta: Record<StatementKey, { indentLevel: number; isTotal: boolean }> = {
    revenue: { indentLevel: 0, isTotal: true },
    operatingCosts: { indentLevel: 1, isTotal: false },
    operatingIncome: { indentLevel: 0, isTotal: true },
    netIncome: { indentLevel: 0, isTotal: true },
    cashFromOperations: { indentLevel: 0, isTotal: false },
    capex: { indentLevel: 1, isTotal: false },
    freeCashFlow: { indentLevel: 0, isTotal: true },
    assets: { indentLevel: 0, isTotal: true },
    currentAssets: { indentLevel: 1, isTotal: false },
    cash: { indentLevel: 2, isTotal: false },
    receivables: { indentLevel: 2, isTotal: false },
    inventory: { indentLevel: 2, isTotal: false },
    ppe: { indentLevel: 1, isTotal: false },
    liabilities: { indentLevel: 0, isTotal: true },
    currentLiabilities: { indentLevel: 1, isTotal: false },
    debt: { indentLevel: 1, isTotal: false },
    equity: { indentLevel: 0, isTotal: true },
  };

  return meta[key];
}

export function buildStatementLines(
  metrics: MetricInput,
  type: "income" | "balance",
): StatementLine[] {
  const revenueMetric = metric(metrics, "revenue");
  const operatingIncomeMetric = metric(metrics, "operatingIncome");
  const cashFromOperationsMetric = metric(metrics, "cashFromOperations");
  const capexMetric = metric(metrics, "capex");
  const assetsMetric = metric(metrics, "assets");

  const freeCashFlow =
    cashFromOperationsMetric.value !== null && capexMetric.value !== null
      ? cashFromOperationsMetric.value - capexMetric.value
      : null;
  const operatingCosts =
    revenueMetric.value !== null && operatingIncomeMetric.value !== null
      ? revenueMetric.value - operatingIncomeMetric.value
      : null;

  const lineMap: Record<StatementKey, { value: number | null; explanation: ValueExplanation }> = {
    revenue: {
      value: revenueMetric.value,
      explanation: revenueMetric.explanation,
    },
    operatingCosts: {
      value: operatingCosts,
      explanation: derivedExplanation(
        "Operating costs are standardized as revenue minus operating income.",
        "revenue - operatingIncome",
        "Revenue - Operating income",
        ["This standardized line supports cross-company comparison."],
        revenueMetric.provenance,
        operatingIncomeMetric.provenance,
      ),
    },
    operatingIncome: {
      value: operatingIncomeMetric.value,
      explanation: operatingIncomeMetric.explanation,
    },
    netIncome: {
      value: metric(metrics, "netIncome").value,
      explanation: metric(metrics, "netIncome").explanation,
    },
    cashFromOperations: {
      value: cashFromOperationsMetric.value,
      explanation: cashFromOperationsMetric.explanation,
    },
    capex: {
      value: capexMetric.value,
      explanation: capexMetric.explanation,
    },
    freeCashFlow: {
      value: freeCashFlow,
      explanation: derivedExplanation(
        "Free cash flow is operating cash flow less capital expenditures.",
        "cashFromOperations - capex",
        "CFO - CapEx",
        [],
        cashFromOperationsMetric.provenance,
        capexMetric.provenance,
      ),
    },
    assets: {
      value: assetsMetric.value,
      explanation: assetsMetric.explanation,
    },
    currentAssets: {
      value: metric(metrics, "currentAssets").value,
      explanation: metric(metrics, "currentAssets").explanation,
    },
    cash: {
      value: metric(metrics, "cash").value,
      explanation: metric(metrics, "cash").explanation,
    },
    receivables: {
      value: metric(metrics, "receivables").value,
      explanation: metric(metrics, "receivables").explanation,
    },
    inventory: {
      value: metric(metrics, "inventory").value,
      explanation: metric(metrics, "inventory").explanation,
    },
    ppe: {
      value: metric(metrics, "ppe").value,
      explanation: metric(metrics, "ppe").explanation,
    },
    liabilities: {
      value: metric(metrics, "liabilities").value,
      explanation: metric(metrics, "liabilities").explanation,
    },
    currentLiabilities: {
      value: metric(metrics, "currentLiabilities").value,
      explanation: metric(metrics, "currentLiabilities").explanation,
    },
    debt: {
      value: metric(metrics, "debt").value,
      explanation: metric(metrics, "debt").explanation,
    },
    equity: {
      value: metric(metrics, "equity").value,
      explanation: metric(metrics, "equity").explanation,
    },
  };

  const baseMetric = type === "income" ? revenueMetric : assetsMetric;
  const order = type === "income" ? INCOME_STATEMENT_ORDER : BALANCE_SHEET_ORDER;

  return order.map((key) => {
    const baseMeta = statementMeta(key);
    const current = lineMap[key];
    return {
      key,
      label: statementLabel(key),
      value: current.value,
      basePercent: divide(current.value, baseMetric.value),
      indentLevel: baseMeta.indentLevel,
      isTotal: baseMeta.isTotal,
      explanation: current.explanation,
      basePercentExplanation: derivedExplanation(
        type === "income"
          ? `${statementLabel(key)} expressed as a percentage of revenue.`
          : `${statementLabel(key)} expressed as a percentage of total assets.`,
        type === "income" ? `${key} / revenue` : `${key} / assets`,
        type === "income"
          ? `${statementLabel(key)} / Revenue`
          : `${statementLabel(key)} / Total assets`,
        [],
        current.explanation.provenance,
        baseMetric.provenance,
      ),
    };
  });
}

export function buildHorizontalLines(
  current: StatementLine[],
  previous: StatementLine[],
  currentYear: number,
  previousYear: number,
): HorizontalLine[] {
  return current.map((line) => {
    const prior = previous.find((item) => item.key === line.key);
    const previousValue = prior?.value ?? null;
    const absoluteChange =
      line.value !== null && previousValue !== null
        ? line.value - previousValue
        : null;

    return {
      key: line.key,
      label: line.label,
      currentValue: line.value,
      previousValue,
      absoluteChange,
      percentChange: divide(absoluteChange, previousValue),
      indentLevel: line.indentLevel,
      isTotal: line.isTotal,
      currentExplanation: {
        ...line.explanation,
        notes: [`Represents the selected-year value for FY ${currentYear}.`, ...line.explanation.notes],
      },
      previousExplanation: prior?.explanation ?? fallbackExplanation(`No prior-year value for ${line.label}.`),
      absoluteChangeExplanation: derivedExplanation(
        `${line.label} absolute change between the selected year and prior year.`,
        "currentValue - previousValue",
        `${currentYear} - ${previousYear}`,
        [],
        line.explanation.provenance,
        prior?.explanation.provenance,
      ),
      percentChangeExplanation: derivedExplanation(
        `${line.label} percent change versus the prior year.`,
        "(currentValue - previousValue) / previousValue",
        `(${currentYear} - ${previousYear}) / ${previousYear}`,
        [],
        line.explanation.provenance,
        prior?.explanation.provenance,
      ),
    };
  });
}

function ratioExplanation(
  definition: string,
  formula: string,
  displayFormula: string,
  notes: string[],
  ...provenances: Array<Provenance | null | undefined>
): ValueExplanation {
  return derivedExplanation(definition, formula, displayFormula, notes, ...provenances);
}

export function buildRatios(
  metrics: MetricInput,
  marketPrice: number | null,
): RatioValue[] {
  const equityMetric = metric(metrics, "equity");
  const sharesMetric = metric(metrics, "sharesOutstanding");
  const revenueMetric = metric(metrics, "revenue");
  const operatingIncomeMetric = metric(metrics, "operatingIncome");
  const netIncomeMetric = metric(metrics, "netIncome");
  const assetsMetric = metric(metrics, "assets");
  const cashFromOperationsMetric = metric(metrics, "cashFromOperations");
  const currentAssetsMetric = metric(metrics, "currentAssets");
  const currentLiabilitiesMetric = metric(metrics, "currentLiabilities");
  const cashMetric = metric(metrics, "cash");
  const receivablesMetric = metric(metrics, "receivables");
  const debtMetric = metric(metrics, "debt");
  const liabilitiesMetric = metric(metrics, "liabilities");

  const bookValuePerShare = divide(equityMetric.value, sharesMetric.value);
  const marketCap =
    marketPrice !== null && sharesMetric.value !== null
      ? marketPrice * sharesMetric.value
      : null;

  return [
    {
      key: "operatingMargin",
      label: "Operating margin",
      category: "profitability",
      value: divide(operatingIncomeMetric.value, revenueMetric.value),
      unit: "percent",
      higherIsBetter: true,
      source: "sec",
      explanation: ratioExplanation(
        "Operating margin measures operating income earned from each dollar of revenue.",
        "operatingIncome / revenue",
        "Operating income / Revenue",
        [],
        operatingIncomeMetric.provenance,
        revenueMetric.provenance,
      ),
    },
    {
      key: "netMargin",
      label: "Net margin",
      category: "profitability",
      value: divide(netIncomeMetric.value, revenueMetric.value),
      unit: "percent",
      higherIsBetter: true,
      source: "sec",
      explanation: ratioExplanation(
        "Net margin measures bottom-line profit per dollar of revenue.",
        "netIncome / revenue",
        "Net income / Revenue",
        [],
        netIncomeMetric.provenance,
        revenueMetric.provenance,
      ),
    },
    {
      key: "roa",
      label: "Return on assets",
      category: "profitability",
      value: divide(netIncomeMetric.value, assetsMetric.value),
      unit: "percent",
      higherIsBetter: true,
      source: "sec",
      explanation: ratioExplanation(
        "ROA measures profit generated from the asset base.",
        "netIncome / assets",
        "Net income / Total assets",
        [],
        netIncomeMetric.provenance,
        assetsMetric.provenance,
      ),
    },
    {
      key: "roe",
      label: "Return on equity",
      category: "profitability",
      value: divide(netIncomeMetric.value, equityMetric.value),
      unit: "percent",
      higherIsBetter: true,
      source: "sec",
      explanation: ratioExplanation(
        "ROE measures profit generated for common equity holders.",
        "netIncome / equity",
        "Net income / Equity",
        [],
        netIncomeMetric.provenance,
        equityMetric.provenance,
      ),
    },
    {
      key: "operatingCashFlowMargin",
      label: "Operating cash flow margin",
      category: "profitability",
      value: divide(cashFromOperationsMetric.value, revenueMetric.value),
      unit: "percent",
      higherIsBetter: true,
      source: "sec",
      explanation: ratioExplanation(
        "Operating cash flow margin measures operating cash generated per dollar of revenue.",
        "cashFromOperations / revenue",
        "CFO / Revenue",
        [],
        cashFromOperationsMetric.provenance,
        revenueMetric.provenance,
      ),
    },
    {
      key: "currentRatio",
      label: "Current ratio",
      category: "liquidity",
      value: divide(currentAssetsMetric.value, currentLiabilitiesMetric.value),
      unit: "ratio",
      higherIsBetter: true,
      source: "sec",
      explanation: ratioExplanation(
        "Current ratio compares current assets with current liabilities.",
        "currentAssets / currentLiabilities",
        "Current assets / Current liabilities",
        [],
        currentAssetsMetric.provenance,
        currentLiabilitiesMetric.provenance,
      ),
    },
    {
      key: "quickRatio",
      label: "Quick ratio",
      category: "liquidity",
      value:
        currentLiabilitiesMetric.value !== null
          ? divide(
              (cashMetric.value ?? 0) + (receivablesMetric.value ?? 0),
              currentLiabilitiesMetric.value,
            )
          : null,
      unit: "ratio",
      higherIsBetter: true,
      source: "sec",
      explanation: ratioExplanation(
        "Quick ratio focuses on the most liquid current assets.",
        "(cash + receivables) / currentLiabilities",
        "(Cash + Receivables) / Current liabilities",
        [],
        cashMetric.provenance,
        receivablesMetric.provenance,
        currentLiabilitiesMetric.provenance,
      ),
    },
    {
      key: "cashRatio",
      label: "Cash ratio",
      category: "liquidity",
      value: divide(cashMetric.value, currentLiabilitiesMetric.value),
      unit: "ratio",
      higherIsBetter: true,
      source: "sec",
      explanation: ratioExplanation(
        "Cash ratio compares cash and equivalents to current liabilities.",
        "cash / currentLiabilities",
        "Cash / Current liabilities",
        [],
        cashMetric.provenance,
        currentLiabilitiesMetric.provenance,
      ),
    },
    {
      key: "debtToEquity",
      label: "Debt to equity",
      category: "leverage",
      value: divide(debtMetric.value, equityMetric.value),
      unit: "ratio",
      higherIsBetter: false,
      source: "sec",
      explanation: ratioExplanation(
        "Debt to equity compares debt financing with the equity base.",
        "debt / equity",
        "Debt / Equity",
        [],
        debtMetric.provenance,
        equityMetric.provenance,
      ),
    },
    {
      key: "debtToAssets",
      label: "Debt to assets",
      category: "leverage",
      value: divide(debtMetric.value, assetsMetric.value),
      unit: "ratio",
      higherIsBetter: false,
      source: "sec",
      explanation: ratioExplanation(
        "Debt to assets shows how much of the asset base is financed by debt.",
        "debt / assets",
        "Debt / Total assets",
        [],
        debtMetric.provenance,
        assetsMetric.provenance,
      ),
    },
    {
      key: "equityRatio",
      label: "Equity ratio",
      category: "leverage",
      value: divide(equityMetric.value, assetsMetric.value),
      unit: "percent",
      higherIsBetter: true,
      source: "sec",
      explanation: ratioExplanation(
        "Equity ratio measures the share of assets financed by equity.",
        "equity / assets",
        "Equity / Total assets",
        [],
        equityMetric.provenance,
        assetsMetric.provenance,
      ),
    },
    {
      key: "operatingCashFlowToLiabilities",
      label: "Operating cash flow to liabilities",
      category: "leverage",
      value: divide(cashFromOperationsMetric.value, liabilitiesMetric.value),
      unit: "ratio",
      higherIsBetter: true,
      source: "sec",
      explanation: ratioExplanation(
        "Operating cash flow to liabilities measures debt-service flexibility from operations.",
        "cashFromOperations / liabilities",
        "CFO / Total liabilities",
        [],
        cashFromOperationsMetric.provenance,
        liabilitiesMetric.provenance,
      ),
    },
    {
      key: "marketCap",
      label: "Market capitalization",
      category: "market",
      value: marketCap,
      unit: "usd",
      higherIsBetter: true,
      source: "market",
      explanation: ratioExplanation(
        "Market capitalization is year-end share price multiplied by shares outstanding.",
        "marketPrice * sharesOutstanding",
        "Year-end price x Shares outstanding",
        ["Year-end market price is sourced separately from SEC data."],
        sharesMetric.provenance,
      ),
    },
    {
      key: "priceToBook",
      label: "Price to book",
      category: "market",
      value:
        marketPrice !== null && bookValuePerShare !== null
          ? divide(marketPrice, bookValuePerShare)
          : null,
      unit: "ratio",
      higherIsBetter: false,
      source: "market",
      explanation: ratioExplanation(
        "Price to book compares market price with book value per share.",
        "marketPrice / bookValuePerShare",
        "Year-end price / Book value per share",
        ["Year-end market price is sourced separately from SEC data."],
        equityMetric.provenance,
        sharesMetric.provenance,
      ),
    },
    {
      key: "priceToSales",
      label: "Price to sales",
      category: "market",
      value: marketCap !== null ? divide(marketCap, revenueMetric.value) : null,
      unit: "ratio",
      higherIsBetter: false,
      source: "market",
      explanation: ratioExplanation(
        "Price to sales compares market capitalization with annual revenue.",
        "marketCap / revenue",
        "Market capitalization / Revenue",
        ["Year-end market price is sourced separately from SEC data."],
        revenueMetric.provenance,
        sharesMetric.provenance,
      ),
    },
    {
      key: "bookValuePerShare",
      label: "Book value per share",
      category: "market",
      value: bookValuePerShare,
      unit: "usd",
      higherIsBetter: true,
      source: "sec",
      explanation: ratioExplanation(
        "Book value per share divides equity by shares outstanding.",
        "equity / sharesOutstanding",
        "Equity / Shares outstanding",
        [],
        equityMetric.provenance,
        sharesMetric.provenance,
      ),
    },
  ];
}

export function buildBridge(metrics: MetricInput) {
  const steps = [
    {
      key: "depreciation",
      label: METRIC_LABELS.depreciation,
      value: metric(metrics, "depreciation").value ?? 0,
    },
    {
      key: "receivablesChange",
      label: METRIC_LABELS.receivablesChange,
      value: metric(metrics, "receivablesChange").value ?? 0,
    },
    {
      key: "payablesChange",
      label: METRIC_LABELS.payablesChange,
      value: metric(metrics, "payablesChange").value ?? 0,
    },
    {
      key: "inventoryChange",
      label: METRIC_LABELS.inventoryChange,
      value: metric(metrics, "inventoryChange").value ?? 0,
    },
    {
      key: "deferredTax",
      label: METRIC_LABELS.deferredTax,
      value: metric(metrics, "deferredTax").value ?? 0,
    },
    {
      key: "shareBasedCompensation",
      label: METRIC_LABELS.shareBasedCompensation,
      value: metric(metrics, "shareBasedCompensation").value ?? 0,
    },
  ].filter((step) => step.value !== 0);

  const cfoValue = metric(metrics, "cashFromOperations").value;
  const netIncomeValue = metric(metrics, "netIncome").value;
  const residual =
    cfoValue !== null && netIncomeValue !== null
      ? cfoValue - netIncomeValue - steps.reduce((sum, step) => sum + step.value, 0)
      : 0;

  return {
    netIncome: netIncomeValue,
    operatingCashFlow: cfoValue,
    steps: [
      ...steps.sort((left, right) => Math.abs(right.value) - Math.abs(left.value)),
      ...(residual !== 0
        ? [{ key: "other", label: "Other operating adjustments", value: residual }]
        : []),
    ],
  };
}

export function buildValuation(trends: TrendPoint[]) {
  const first = trends[0];
  const latest = trends[trends.length - 1];
  const fcfGrowth = growthRate(
    first?.freeCashFlow ?? null,
    latest?.freeCashFlow ?? null,
    trends.length - 1,
  );
  const revenueGrowth = growthRate(
    first?.revenue ?? null,
    latest?.revenue ?? null,
    trends.length - 1,
  );
  const appliedGrowth = fcfGrowth ?? revenueGrowth ?? 0;
  const growthMethod: "fcf-cagr" | "revenue-cagr" =
    fcfGrowth !== null ? "fcf-cagr" : "revenue-cagr";
  const baseFcf = latest?.freeCashFlow ?? 0;

  const projected: ProjectionPoint[] = Array.from({ length: TREND_YEARS }, (_, index) => {
    const year = latest.year + index + 1;
    const projectedFreeCashFlow = baseFcf * (1 + appliedGrowth) ** (index + 1);
    const discountFactor = 1 / (1 + DISCOUNT_RATE) ** (index + 1);
    const presentValue = projectedFreeCashFlow * discountFactor;

    return {
      year,
      projectedFreeCashFlow,
      discountFactor,
      presentValue,
      projectedExplanation: derivedExplanation(
        `Projected free cash flow for ${year}.`,
        "latestFreeCashFlow * (1 + growthRate)^n",
        `Latest FCF x (1 + Growth rate)^${index + 1}`,
        [
          growthMethod === "fcf-cagr"
            ? "Growth rate is based on five-year FCF CAGR."
            : "Growth rate falls back to five-year revenue CAGR because FCF CAGR is not usable.",
        ],
        null,
      ),
      presentValueExplanation: derivedExplanation(
        `Present value of projected free cash flow for ${year}.`,
        "projectedFreeCashFlow / (1 + discountRate)^n",
        `Projected FCF / (1 + 7%)^${index + 1}`,
        [],
        null,
      ),
    };
  });

  return {
    latestFreeCashFlow: latest.freeCashFlow,
    growthRate: appliedGrowth,
    growthMethod,
    discountRate: DISCOUNT_RATE,
    projected,
    npv: projected.reduce((sum, point) => sum + point.presentValue, 0),
  };
}
