import {
  COMPANIES,
  CONCEPT_MAP,
  DEFAULT_ANALYSIS_YEAR,
  METRIC_LABELS,
  SOURCE_LINKS,
} from "@/lib/config";
import {
  buildBridge,
  buildHorizontalLines,
  buildRatios,
  buildStatementLines,
  buildValuation,
} from "@/lib/analysis-utils";
import {
  buildDerivedExplanation,
  getLocalMetricForYear,
  getLocalVisibleRowValue,
} from "@/lib/server/local-filings";
import { getYearEndPrice } from "@/lib/server/market";
import {
  getAnnualFilingSummary,
  getAvailableYears,
  getCompanyFacts,
  getMetricForYear,
} from "@/lib/server/sec";
import type {
  CompanyAnalysis,
  CompanyProfile,
  CrossSectionalRow,
  DashboardAnalysis,
  FilingSummary,
  MetricKey,
  Provenance,
  ScalarMetric,
  TrendPoint,
  ValueExplanation,
} from "@/lib/types";

const METRICS: MetricKey[] = [
  "revenue",
  "operatingIncome",
  "netIncome",
  "cashFromOperations",
  "capex",
  "assets",
  "currentAssets",
  "currentLiabilities",
  "liabilities",
  "equity",
  "cash",
  "receivables",
  "inventory",
  "ppe",
  "debt",
  "sharesOutstanding",
  "depreciation",
  "receivablesChange",
  "payablesChange",
  "inventoryChange",
  "deferredTax",
  "shareBasedCompensation",
];

function inferMode(key: MetricKey): "flow" | "instant" {
  const flowMetrics: MetricKey[] = [
    "revenue",
    "operatingIncome",
    "netIncome",
    "cashFromOperations",
    "capex",
    "depreciation",
    "receivablesChange",
    "payablesChange",
    "inventoryChange",
    "deferredTax",
    "shareBasedCompensation",
  ];

  return flowMetrics.includes(key) ? "flow" : "instant";
}

function shouldUseLocalOverride(metric: ScalarMetric, year: number, key: MetricKey) {
  if (metric.value === null) {
    return true;
  }

  if (key === "sharesOutstanding") {
    return metric.provenance?.end?.startsWith(`${year}-`) !== true;
  }

  return false;
}

export async function buildYearMetrics(
  company: CompanyProfile,
  year: number,
  filing: FilingSummary | null,
) {
  const facts = await getCompanyFacts(company);
  const secEntries = await Promise.all(
    METRICS.map(async (key) => [key, await getMetricForYear(company, facts, year, key)] as const),
  );

  const resolved = Object.fromEntries(secEntries) as Record<MetricKey, ScalarMetric>;

  await Promise.all(
    METRICS.map(async (key) => {
      const current = resolved[key];
      if (!shouldUseLocalOverride(current, year, key)) {
        return;
      }

      const localMetric = await getLocalMetricForYear(
        company,
        year,
        key,
        CONCEPT_MAP[company.key][key],
        inferMode(key),
        key === "sharesOutstanding" ? "shares" : "USD",
        filing,
      );

      if (localMetric) {
        resolved[key] = {
          ...localMetric,
          label: METRIC_LABELS[key],
          explanation: {
            ...localMetric.explanation,
            definition: `${METRIC_LABELS[key]} sourced from the saved filing fallback.`,
          },
        };
      }
    }),
  );

  if (company.key === "brookfield" && resolved.operatingIncome.value === null) {
    const [directOperatingCosts, managementServiceCosts, depreciation] = await Promise.all([
      getLocalVisibleRowValue(company, year, "Direct operating costs"),
      getLocalVisibleRowValue(company, year, "Management service costs"),
      getLocalVisibleRowValue(company, year, "Depreciation"),
    ]);

    if (
      resolved.revenue.value !== null &&
      directOperatingCosts !== null &&
      managementServiceCosts !== null &&
      depreciation !== null
    ) {
      const standardizedOperatingIncome =
        resolved.revenue.value +
        directOperatingCosts +
        managementServiceCosts +
        depreciation;

      resolved.operatingIncome = {
        key: "operatingIncome",
        label: METRIC_LABELS.operatingIncome,
        unit: "USD",
        value: standardizedOperatingIncome,
        provenance: filing
          ? {
              sourceKind: "derived",
              sourceLabel: `${company.name} consolidated review table`,
              concept: "Revenue less direct operating costs, management service costs, and depreciation",
              taxonomy: company.taxonomy,
              accession: filing.accession,
              filed: filing.filed,
              form: filing.form,
              start: `${year}-01-01`,
              end: `${year}-12-31`,
              frame: null,
              filingPath: company.localFilingPath,
              primaryDocument: filing.primaryDocument ?? null,
            }
          : null,
        explanation: buildDerivedExplanation(
          "Brookfield standardized operating income is derived from the visible consolidated review table because a clean operating-profit fact is not exposed in the filing data.",
          "revenue - abs(directOperatingCosts) - abs(managementServiceCosts) - abs(depreciation)",
          "Revenue - Direct operating costs - Management service costs - Depreciation",
          [
            "This keeps the operating-income line tied to the saved filing table instead of using an unreliable IFRS operating-expense shortcut.",
          ],
          filing
            ? {
                sourceKind: "derived",
                sourceLabel: `${company.name} consolidated review table`,
                concept: "Revenue less direct operating costs, management service costs, and depreciation",
                taxonomy: company.taxonomy,
                accession: filing.accession,
                filed: filing.filed,
                form: filing.form,
                start: `${year}-01-01`,
                end: `${year}-12-31`,
                frame: null,
                filingPath: company.localFilingPath,
                primaryDocument: filing.primaryDocument ?? null,
              }
            : null,
          `${company.name} visible filing table`,
        ),
      };
    }
  }

  return resolved;
}

function crossExplanation(
  definition: string,
  formula: string,
  displayFormula: string,
  provenance: Provenance | null,
): ValueExplanation {
  return {
    definition,
    formula,
    displayFormula,
    sourceKind: "derived",
    sourceLabel: "Cross-company comparison layer",
    provenance,
    notes: [],
  };
}

async function buildTrendData(company: CompanyProfile, years: number[], filing: FilingSummary | null) {
  const selectedYears = years.slice(-5);
  return Promise.all(
    selectedYears.map(async (year) => {
      const metrics = await buildYearMetrics(company, year, filing);
      const marketPrice = await getYearEndPrice(company, year);
      const cashFromOperations = metrics.cashFromOperations.value;
      const capex = metrics.capex.value;
      return {
        year,
        revenue: metrics.revenue.value,
        netIncome: metrics.netIncome.value,
        cashFromOperations,
        capex,
        freeCashFlow:
          cashFromOperations !== null && capex !== null
            ? cashFromOperations - capex
            : null,
        sharesOutstanding: metrics.sharesOutstanding.value,
        marketPrice,
      } satisfies TrendPoint;
    }),
  );
}

async function buildCompanyAnalysis(
  company: CompanyProfile,
  year: number,
  previousYear: number,
  years: number[],
): Promise<CompanyAnalysis> {
  const annualFiling = await getAnnualFilingSummary(company, year);
  const [selectedRaw, previousRaw, marketPrice, trends] = await Promise.all([
    buildYearMetrics(company, year, annualFiling),
    buildYearMetrics(company, previousYear, annualFiling),
    getYearEndPrice(company, year),
    buildTrendData(company, years, annualFiling),
  ]);

  const incomeStatement = buildStatementLines(selectedRaw, "income");
  const balanceSheet = buildStatementLines(selectedRaw, "balance");

  return {
    company,
    selectedYear: year,
    previousYear,
    annualFiling,
    rawMetrics: selectedRaw,
    incomeStatement,
    balanceSheet,
    horizontalIncome: buildHorizontalLines(
      incomeStatement,
      buildStatementLines(previousRaw, "income"),
      year,
      previousYear,
    ),
    horizontalBalanceSheet: buildHorizontalLines(
      balanceSheet,
      buildStatementLines(previousRaw, "balance"),
      year,
      previousYear,
    ),
    ratios: buildRatios(selectedRaw, marketPrice),
    trends,
    earningsBridge: buildBridge(selectedRaw),
    valuation: buildValuation(trends),
    marketPriceSource: `Yahoo Finance year-end close (${company.ticker})`,
  };
}

function buildCrossSectionalRows(
  companies: CompanyAnalysis[],
  type: "commonSize" | "ratios",
): CrossSectionalRow[] {
  const firstSolar = companies.find((company) => company.company.key === "first-solar");
  const brookfield = companies.find((company) => company.company.key === "brookfield");

  if (!firstSolar || !brookfield) {
    return [];
  }

  if (type === "commonSize") {
    return firstSolar.incomeStatement.map((line) => {
      const peer = brookfield.incomeStatement.find((item) => item.key === line.key);
      return {
        key: line.key,
        label: line.label,
        firstSolar: line.basePercent,
        brookfield: peer?.basePercent ?? null,
        delta:
          line.basePercent !== null &&
          peer !== undefined &&
          peer.basePercent !== null
            ? line.basePercent - peer.basePercent
            : null,
        unit: "percent",
        higherIsBetter:
          line.key === "operatingCosts" || line.key === "capex" ? false : true,
        firstSolarExplanation: line.basePercentExplanation,
        brookfieldExplanation:
          peer?.basePercentExplanation ??
          crossExplanation(
            `${line.label} common-size value is unavailable for Brookfield.`,
            "",
            "",
            null,
          ),
        deltaExplanation: crossExplanation(
          `${line.label} common-size difference between First Solar and Brookfield.`,
          "firstSolar - brookfield",
          "First Solar - Brookfield",
          mergeProvenance(line.basePercentExplanation.provenance, peer?.basePercentExplanation.provenance),
        ),
      };
    });
  }

  return firstSolar.ratios.map((ratio) => {
    const peer = brookfield.ratios.find((item) => item.key === ratio.key);
    return {
      key: ratio.key,
      label: ratio.label,
      firstSolar: ratio.value,
      brookfield: peer?.value ?? null,
      delta:
        ratio.value !== null && peer !== undefined && peer.value !== null
          ? ratio.value - peer.value
          : null,
      unit: ratio.unit,
      higherIsBetter: ratio.higherIsBetter,
      firstSolarExplanation: ratio.explanation,
      brookfieldExplanation:
        peer?.explanation ??
        crossExplanation(`${ratio.label} is unavailable for Brookfield.`, "", "", null),
      deltaExplanation: crossExplanation(
        `${ratio.label} difference between First Solar and Brookfield.`,
        "firstSolar - brookfield",
        "First Solar - Brookfield",
        mergeProvenance(ratio.explanation.provenance, peer?.explanation.provenance),
      ),
    };
  });
}

function mergeProvenance(...provenances: Array<Provenance | null | undefined>) {
  return provenances.find(Boolean) ?? null;
}

export async function getDashboardAnalysis(
  requestedYear?: number,
): Promise<DashboardAnalysis> {
  const availableYearSets = await Promise.all(
    COMPANIES.map((company) => getAvailableYears(company)),
  );

  const availableYears = availableYearSets.reduce<number[]>((shared, years, index) => {
    if (index === 0) {
      return years;
    }
    return shared.filter((year) => years.includes(year));
  }, []);

  const latestYear = availableYears[availableYears.length - 1] ?? DEFAULT_ANALYSIS_YEAR;
  const year =
    requestedYear && availableYears.includes(requestedYear)
      ? requestedYear
      : latestYear;
  const previousYear = year - 1;

  const companies = await Promise.all(
    COMPANIES.map((company) =>
      buildCompanyAnalysis(company, year, previousYear, availableYears),
    ),
  );

  return {
    generatedAt: new Date().toISOString(),
    year,
    previousYear,
    availableYears,
    companies,
    crossSectionalCommonSize: buildCrossSectionalRows(companies, "commonSize"),
    crossSectionalRatios: buildCrossSectionalRows(companies, "ratios"),
    notes: [
      "The dashboard uses SEC companyfacts as the primary source and falls back to the saved annual filing HTML when SEC facts are missing or stale.",
      "Brookfield Renewable Corp reports under IFRS while First Solar reports under U.S. GAAP; the app normalizes both into one comparison model.",
      "Market-value ratios use non-SEC year-end closing prices and are labeled separately from SEC-derived metrics.",
      "FCF is defined as operating cash flow minus capital expenditures. NPV discounts five projected annual FCF amounts at 7%.",
    ],
    sourceLinks: SOURCE_LINKS,
  };
}
