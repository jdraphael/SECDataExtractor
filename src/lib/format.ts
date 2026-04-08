import type { RatioValue } from "@/lib/types";

function formatCompactCurrency(value: number) {
  const absoluteValue = Math.abs(value);
  const suffixes = [
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ];

  const matched = suffixes.find((item) => absoluteValue >= item.threshold);
  if (!matched) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  const scaled = value / matched.threshold;
  const hasFraction = Math.abs(scaled) < 10 && !Number.isInteger(scaled);

  return `$${formatNumber(scaled, hasFraction ? 1 : 0)}${matched.suffix}`;
}

export function formatCurrency(value: number | null, compact = false) {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }

  if (compact) {
    return formatCompactCurrency(value);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatAccountingCurrency(value: number | null, compact = false) {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }

  if (value < 0) {
    const absolute = formatCurrency(Math.abs(value), compact);
    return `(${absolute})`;
  }

  return formatCurrency(value, compact);
}

export function formatNumber(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }

  return `${formatNumber(value * 100, digits)}%`;
}

export function formatRatio(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }

  return `${formatNumber(value, digits)}x`;
}

export function formatRatioValue(ratio: RatioValue) {
  if (ratio.unit === "percent") {
    return formatPercent(ratio.value);
  }
  if (ratio.unit === "usd") {
    return formatCurrency(ratio.value, true);
  }
  return formatRatio(ratio.value);
}

export function formatValueByUnit(
  value: number | null,
  unit: "ratio" | "percent" | "usd" | "shares" | "USD",
  compact = true,
) {
  if (unit === "percent") {
    return formatPercent(value);
  }
  if (unit === "ratio") {
    return formatRatio(value);
  }
  if (unit === "shares") {
    return formatNumber(value, 0);
  }

  return formatCurrency(value, compact);
}

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
