import yahooFinance from "yahoo-finance2";

import { PRICE_OVERRIDES } from "@/lib/config";
import type { CompanyProfile } from "@/lib/types";

const MARKET_CACHE = new Map<string, Promise<number | null>>();
const yahooFinanceClient = new yahooFinance({
  suppressNotices: ["ripHistorical"],
});
type HistoricalPoint = {
  date: Date;
  close?: number | null;
};
const MARKET_TIMEOUT_MS = 6_000;

export async function getYearEndPrice(
  company: CompanyProfile,
  year: number,
): Promise<number | null> {
  const cacheKey = `${company.ticker}:${year}`;
  if (!MARKET_CACHE.has(cacheKey)) {
    MARKET_CACHE.set(
      cacheKey,
      (async () => {
        const override = PRICE_OVERRIDES[company.ticker]?.[year];
        if (override) {
          return override;
        }

        const series = (await Promise.race([
          (async () => {
            const period1 = new Date(Date.UTC(year, 11, 20));
            const period2 = new Date(Date.UTC(year + 1, 0, 5));
            return (await yahooFinanceClient.historical(company.ticker, {
              period1,
              period2,
              interval: "1d",
            })) as HistoricalPoint[];
          })(),
          new Promise<HistoricalPoint[]>((resolve) =>
            setTimeout(() => resolve([]), MARKET_TIMEOUT_MS),
          ),
        ])) as HistoricalPoint[];

        if (!series.length) {
          return null;
        }

        const cutoff = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
        const point =
          [...series]
            .filter((item) => item.date <= cutoff)
            .sort((left, right) => right.date.getTime() - left.date.getTime())[0] ??
          series[series.length - 1];

        return point?.close ?? null;
      })(),
    );
  }

  return MARKET_CACHE.get(cacheKey) as Promise<number | null>;
}
