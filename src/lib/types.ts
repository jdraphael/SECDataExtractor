export type CompanyKey = "first-solar" | "brookfield";

export type Taxonomy = "us-gaap" | "ifrs-full" | "dei";

export type SourceKind = "sec-api" | "local-filing" | "derived";

export type MetricKey =
  | "revenue"
  | "operatingIncome"
  | "netIncome"
  | "cashFromOperations"
  | "capex"
  | "assets"
  | "currentAssets"
  | "currentLiabilities"
  | "liabilities"
  | "equity"
  | "cash"
  | "receivables"
  | "inventory"
  | "ppe"
  | "debt"
  | "sharesOutstanding"
  | "depreciation"
  | "receivablesChange"
  | "payablesChange"
  | "inventoryChange"
  | "deferredTax"
  | "shareBasedCompensation";

export type StatementKey =
  | "revenue"
  | "operatingCosts"
  | "operatingIncome"
  | "netIncome"
  | "cashFromOperations"
  | "capex"
  | "freeCashFlow"
  | "assets"
  | "currentAssets"
  | "cash"
  | "receivables"
  | "inventory"
  | "ppe"
  | "liabilities"
  | "currentLiabilities"
  | "debt"
  | "equity";

export type RatioCategory =
  | "profitability"
  | "liquidity"
  | "leverage"
  | "market";

export type RatioKey =
  | "operatingMargin"
  | "netMargin"
  | "roa"
  | "roe"
  | "operatingCashFlowMargin"
  | "currentRatio"
  | "quickRatio"
  | "cashRatio"
  | "debtToEquity"
  | "debtToAssets"
  | "equityRatio"
  | "operatingCashFlowToLiabilities"
  | "marketCap"
  | "priceToBook"
  | "priceToSales"
  | "bookValuePerShare";

export type Provenance = {
  sourceKind: SourceKind;
  sourceLabel: string;
  concept: string;
  taxonomy: Taxonomy;
  accession: string;
  filed: string;
  form: string;
  start: string | null;
  end: string;
  frame: string | null;
  filingPath: string | null;
  primaryDocument: string | null;
};

export type ValueExplanation = {
  definition: string;
  formula: string | null;
  displayFormula: string | null;
  sourceKind: SourceKind;
  sourceLabel: string;
  provenance: Provenance | null;
  notes: string[];
};

export type ScalarMetric = {
  key: MetricKey;
  label: string;
  unit: "USD" | "shares";
  value: number | null;
  provenance: Provenance | null;
  explanation: ValueExplanation;
};

export type StatementLine = {
  key: StatementKey;
  label: string;
  value: number | null;
  basePercent: number | null;
  indentLevel: number;
  isTotal: boolean;
  explanation: ValueExplanation;
  basePercentExplanation: ValueExplanation;
};

export type HorizontalLine = {
  key: StatementKey;
  label: string;
  currentValue: number | null;
  previousValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  indentLevel: number;
  isTotal: boolean;
  currentExplanation: ValueExplanation;
  previousExplanation: ValueExplanation;
  absoluteChangeExplanation: ValueExplanation;
  percentChangeExplanation: ValueExplanation;
};

export type RatioValue = {
  key: RatioKey;
  label: string;
  category: RatioCategory;
  value: number | null;
  unit: "ratio" | "percent" | "usd";
  higherIsBetter: boolean;
  source: "sec" | "market";
  explanation: ValueExplanation;
};

export type TrendPoint = {
  year: number;
  revenue: number | null;
  netIncome: number | null;
  cashFromOperations: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  sharesOutstanding: number | null;
  marketPrice: number | null;
};

export type ReconciliationPoint = {
  key: string;
  label: string;
  value: number;
};

export type EarningsBridge = {
  netIncome: number | null;
  operatingCashFlow: number | null;
  steps: ReconciliationPoint[];
};

export type ProjectionPoint = {
  year: number;
  projectedFreeCashFlow: number;
  discountFactor: number;
  presentValue: number;
  projectedExplanation: ValueExplanation;
  presentValueExplanation: ValueExplanation;
};

export type ValuationSummary = {
  latestFreeCashFlow: number | null;
  growthRate: number;
  growthMethod: "fcf-cagr" | "revenue-cagr";
  discountRate: number;
  projected: ProjectionPoint[];
  npv: number;
};

export type FilingSummary = {
  accession: string;
  filed: string;
  form: string;
  reportDate: string;
  primaryDocument: string | null;
};

export type CompanyProfile = {
  key: CompanyKey;
  name: string;
  ticker: string;
  cik: string;
  taxonomy: "us-gaap" | "ifrs-full";
  baseCurrency: "USD";
  fiscalYearEnd: "1231";
  annualForm: "10-K" | "20-F";
  localFilingPath: string;
  accent: string;
};

export type CompanyAnalysis = {
  company: CompanyProfile;
  selectedYear: number;
  previousYear: number;
  annualFiling: FilingSummary | null;
  rawMetrics: Record<MetricKey, ScalarMetric>;
  incomeStatement: StatementLine[];
  balanceSheet: StatementLine[];
  horizontalIncome: HorizontalLine[];
  horizontalBalanceSheet: HorizontalLine[];
  ratios: RatioValue[];
  trends: TrendPoint[];
  earningsBridge: EarningsBridge;
  valuation: ValuationSummary;
  marketPriceSource: string;
};

export type CrossSectionalRow = {
  key: string;
  label: string;
  firstSolar: number | null;
  brookfield: number | null;
  delta: number | null;
  unit: "ratio" | "percent" | "usd";
  higherIsBetter: boolean;
  firstSolarExplanation: ValueExplanation;
  brookfieldExplanation: ValueExplanation;
  deltaExplanation: ValueExplanation;
};

export type DashboardAnalysis = {
  generatedAt: string;
  year: number;
  previousYear: number;
  availableYears: number[];
  companies: CompanyAnalysis[];
  crossSectionalCommonSize: CrossSectionalRow[];
  crossSectionalRatios: CrossSectionalRow[];
  notes: string[];
  sourceLinks: Array<{
    label: string;
    url: string;
  }>;
};
