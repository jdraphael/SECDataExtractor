import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CompanyProfile, MetricKey } from "@/lib/types";

const companyFactsMock = vi.fn();
const annualFilingMock = vi.fn();
const availableYearsMock = vi.fn();
const metricMock = vi.fn();
const priceMock = vi.fn();

vi.mock("@/lib/server/sec", () => ({
  getCompanyFacts: companyFactsMock,
  getAnnualFilingSummary: annualFilingMock,
  getAvailableYears: availableYearsMock,
  getMetricForYear: metricMock,
}));

vi.mock("@/lib/server/market", () => ({
  getYearEndPrice: priceMock,
}));

describe("getDashboardAnalysis", () => {
  beforeEach(() => {
    companyFactsMock.mockResolvedValue({});
    annualFilingMock.mockImplementation(
      async (_company: CompanyProfile, year: number) => ({
        accession: "accn",
        filed: `${year + 1}-02-25`,
        form: "10-K",
        reportDate: `${year}-12-31`,
        primaryDocument: "test.htm",
      }),
    );
    availableYearsMock.mockResolvedValue([2021, 2022, 2023, 2024, 2025]);
    priceMock.mockResolvedValue(50);
    metricMock.mockImplementation(
      async (_company: CompanyProfile, _facts: unknown, year: number, key: MetricKey) => {
        const lookup: Partial<Record<MetricKey, number>> = {
          revenue: 1000 + year,
          operatingIncome: 200,
          netIncome: 150,
          cashFromOperations: 240,
          capex: 90,
          assets: 2000,
          currentAssets: 700,
          currentLiabilities: 350,
          liabilities: 900,
          equity: 1100,
          cash: 250,
          receivables: 175,
          inventory: 60,
          ppe: 800,
          debt: 500,
          sharesOutstanding: 100,
        };
        return {
          key,
          label: key,
          unit: key === "sharesOutstanding" ? "shares" : "USD",
          value: lookup[key] ?? 0,
          provenance: {
            sourceKind: "sec-api",
            sourceLabel: "SEC companyfacts API",
            concept: key,
            taxonomy: key === "sharesOutstanding" ? "dei" : "us-gaap",
            accession: "accn",
            filed: `${year + 1}-02-25`,
            form: _company.annualForm,
            start: key === "sharesOutstanding" ? null : `${year}-01-01`,
            end: `${year}-12-31`,
            frame: null,
            filingPath: null,
            primaryDocument: "test.htm",
          },
          explanation: {
            definition: `${key} test metric`,
            formula: null,
            displayFormula: null,
            sourceKind: "sec-api",
            sourceLabel: "SEC companyfacts API",
            provenance: null,
            notes: [],
          },
        };
      },
    );
  });

  it("returns the normalized dashboard payload", async () => {
    const { getDashboardAnalysis } = await import("@/lib/server/analysis");
    const analysis = await getDashboardAnalysis(2025);

    expect(analysis.year).toBe(2025);
    expect(analysis.companies).toHaveLength(2);
    expect(analysis.crossSectionalRatios.length).toBeGreaterThan(0);
    expect(analysis.companies[0].valuation.projected).toHaveLength(5);
  });
});
