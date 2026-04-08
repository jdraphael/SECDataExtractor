import { buildRatios, buildStatementLines, buildValuation } from "@/lib/analysis-utils";
import type { MetricKey, TrendPoint } from "@/lib/types";

function makeMetrics(overrides: Partial<Record<MetricKey, number | null>> = {}) {
  return {
    revenue: 1000,
    operatingIncome: 220,
    netIncome: 140,
    cashFromOperations: 180,
    capex: 60,
    assets: 2000,
    currentAssets: 650,
    currentLiabilities: 300,
    liabilities: 900,
    equity: 1100,
    cash: 200,
    receivables: 150,
    inventory: 80,
    ppe: 700,
    debt: 500,
    sharesOutstanding: 100,
    depreciation: 40,
    receivablesChange: -15,
    payablesChange: 10,
    inventoryChange: -5,
    deferredTax: 3,
    shareBasedCompensation: 7,
    ...overrides,
  } satisfies Record<MetricKey, number | null>;
}

describe("analysis utils", () => {
  it("builds comparable statement lines with common-size percentages", () => {
    const metrics = makeMetrics();
    const lines = buildStatementLines(metrics, "income");
    const revenue = lines.find((line) => line.key === "revenue");
    const operatingCosts = lines.find((line) => line.key === "operatingCosts");

    expect(revenue?.basePercent).toBe(1);
    expect(operatingCosts?.value).toBe(780);
    expect(operatingCosts?.basePercent).toBeCloseTo(0.78, 5);
  });

  it("calculates the fixed ratio set", () => {
    const ratios = buildRatios(makeMetrics(), 50);
    const currentRatio = ratios.find((ratio) => ratio.key === "currentRatio");
    const marketCap = ratios.find((ratio) => ratio.key === "marketCap");

    expect(currentRatio?.value).toBeCloseTo(2.166666, 5);
    expect(marketCap?.value).toBe(5000);
  });

  it("falls back to revenue CAGR when FCF CAGR is not usable", () => {
    const trends: TrendPoint[] = [
      {
        year: 2021,
        revenue: 100,
        netIncome: 5,
        cashFromOperations: 10,
        capex: 25,
        freeCashFlow: -15,
        sharesOutstanding: 10,
        marketPrice: 10,
      },
      {
        year: 2022,
        revenue: 120,
        netIncome: 9,
        cashFromOperations: 18,
        capex: 20,
        freeCashFlow: -2,
        sharesOutstanding: 10,
        marketPrice: 11,
      },
      {
        year: 2023,
        revenue: 140,
        netIncome: 12,
        cashFromOperations: 24,
        capex: 18,
        freeCashFlow: 6,
        sharesOutstanding: 10,
        marketPrice: 12,
      },
      {
        year: 2024,
        revenue: 160,
        netIncome: 14,
        cashFromOperations: 28,
        capex: 18,
        freeCashFlow: 10,
        sharesOutstanding: 10,
        marketPrice: 13,
      },
      {
        year: 2025,
        revenue: 200,
        netIncome: 20,
        cashFromOperations: 40,
        capex: 15,
        freeCashFlow: 25,
        sharesOutstanding: 10,
        marketPrice: 14,
      },
    ];

    const valuation = buildValuation(trends);

    expect(valuation.growthMethod).toBe("revenue-cagr");
    expect(valuation.npv).toBeGreaterThan(0);
  });
});
