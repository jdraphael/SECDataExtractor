import { Resvg } from "@resvg/resvg-js";

import {
  buildBridgeChartRows,
  buildTrendChartRows,
  buildValuationChartRows,
} from "@/lib/chart-data";
import { formatCurrency } from "@/lib/format";
import type { CompanyAnalysis, DashboardAnalysis } from "@/lib/types";

const WIDTH = 1200;
const HEIGHT = 420;
const MARGIN = { top: 48, right: 32, bottom: 74, left: 88 };

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plotArea() {
  return {
    x: MARGIN.left,
    y: MARGIN.top,
    width: WIDTH - MARGIN.left - MARGIN.right,
    height: HEIGHT - MARGIN.top - MARGIN.bottom,
  };
}

function valueDomain(values: Array<number | null>) {
  const numeric = values.filter((value): value is number => value !== null);
  const min = Math.min(...numeric, 0);
  const max = Math.max(...numeric, 0);
  const padding = (max - min || 1) * 0.12;
  return {
    min: min - padding,
    max: max + padding,
  };
}

function scaleY(value: number, min: number, max: number) {
  const area = plotArea();
  if (max === min) {
    return area.y + area.height / 2;
  }

  return area.y + area.height - ((value - min) / (max - min)) * area.height;
}

function scaleX(index: number, total: number) {
  const area = plotArea();
  if (total <= 1) {
    return area.x + area.width / 2;
  }

  return area.x + (index / (total - 1)) * area.width;
}

function linePath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function renderSvg(svg: string) {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: WIDTH,
    },
  });

  return Buffer.from(resvg.render().asPng());
}

function chartShell(title: string, body: string, legend: string) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <rect width="100%" height="100%" fill="#ffffff" rx="24" />
      <rect x="1" y="1" width="${WIDTH - 2}" height="${HEIGHT - 2}" rx="24" fill="none" stroke="#a8c8d7" />
      <text x="${MARGIN.left}" y="28" fill="#0f172a" font-size="22" font-family="Georgia, serif" font-weight="700">${escapeXml(title)}</text>
      ${body}
      ${legend}
    </svg>
  `;
}

function gridLines(min: number, max: number) {
  const steps = 5;
  const area = plotArea();
  return Array.from({ length: steps }, (_, index) => {
    const ratio = index / (steps - 1);
    const value = max - ratio * (max - min);
    const y = area.y + ratio * area.height;
    return `
      <line x1="${area.x}" y1="${y}" x2="${area.x + area.width}" y2="${y}" stroke="#d5e5ed" stroke-dasharray="4 4" />
      <text x="${area.x - 12}" y="${y + 4}" fill="#475569" font-size="12" text-anchor="end" font-family="Arial">${escapeXml(formatCurrency(value, true))}</text>
    `;
  }).join("");
}

function xLabels(labels: Array<string | number>) {
  const area = plotArea();
  return labels
    .map((label, index) => {
      const x = scaleX(index, labels.length);
      return `
        <text x="${x}" y="${area.y + area.height + 26}" fill="#475569" font-size="12" text-anchor="middle" font-family="Arial">${escapeXml(String(label))}</text>
      `;
    })
    .join("");
}

function trendLegend() {
  const items = [
    { label: "First Solar net income", color: "#d97706" },
    { label: "First Solar CFO", color: "#f59e0b" },
    { label: "Brookfield net income", color: "#0f766e" },
    { label: "Brookfield CFO", color: "#14b8a6" },
  ];

  return items
    .map((item, index) => {
      const x = MARGIN.left + index * 250;
      return `
        <line x1="${x}" y1="${HEIGHT - 26}" x2="${x + 28}" y2="${HEIGHT - 26}" stroke="${item.color}" stroke-width="4" />
        <text x="${x + 38}" y="${HEIGHT - 22}" fill="#334155" font-size="12" font-family="Arial">${escapeXml(item.label)}</text>
      `;
    })
    .join("");
}

function buildTrendSvg(analysis: DashboardAnalysis) {
  const rows = buildTrendChartRows(analysis);
  const series = [
    { key: "first-solar-netIncome", color: "#d97706" },
    { key: "first-solar-cfo", color: "#f59e0b" },
    { key: "brookfield-netIncome", color: "#0f766e" },
    { key: "brookfield-cfo", color: "#14b8a6" },
  ];

  const values = rows.flatMap((row) =>
    series.map((item) => (typeof row[item.key] === "number" ? (row[item.key] as number) : null)),
  );
  const domain = valueDomain(values);
  const lines = series
    .map((item) => {
      const points = rows
        .map((row, index) => {
          const value = row[item.key];
          if (typeof value !== "number") {
            return null;
          }
          return {
            x: scaleX(index, rows.length),
            y: scaleY(value, domain.min, domain.max),
          };
        })
        .filter(Boolean) as Array<{ x: number; y: number }>;

      return `<path d="${linePath(points)}" fill="none" stroke="${item.color}" stroke-width="3" />`;
    })
    .join("");

  return chartShell(
    "Five-Year Net Income vs Cash Flow from Operations",
    `
      ${gridLines(domain.min, domain.max)}
      ${xLabels(rows.map((row) => row.year as number))}
      ${lines}
    `,
    trendLegend(),
  );
}

function buildBridgeSvg(company: CompanyAnalysis) {
  const rows = buildBridgeChartRows(company);
  const numeric = rows.map((row) => row.value);
  const domain = valueDomain(numeric);
  const area = plotArea();
  const barWidth = area.width / Math.max(rows.length * 1.7, 1);
  const step = area.width / rows.length;
  const zeroY = scaleY(0, domain.min, domain.max);

  const bars = rows
    .map((row, index) => {
      const x = area.x + index * step + (step - barWidth) / 2;
      const y = row.value >= 0 ? scaleY(row.value, domain.min, domain.max) : zeroY;
      const height = Math.abs(scaleY(row.value, domain.min, domain.max) - zeroY);
      return `
        <rect x="${x}" y="${Math.min(y, zeroY)}" width="${barWidth}" height="${Math.max(height, 2)}" rx="8" fill="${row.color}" />
        <text x="${x + barWidth / 2}" y="${area.y + area.height + 22}" fill="#475569" font-size="11" text-anchor="middle" font-family="Arial">${escapeXml(row.label)}</text>
      `;
    })
    .join("");

  return chartShell(
    `${company.company.ticker}: Net Income to CFO Bridge`,
    `
      ${gridLines(domain.min, domain.max)}
      <line x1="${area.x}" y1="${zeroY}" x2="${area.x + area.width}" y2="${zeroY}" stroke="#94a3b8" />
      ${bars}
    `,
    "",
  );
}

function buildValuationSvg(company: CompanyAnalysis) {
  const rows = buildValuationChartRows(company);
  const values = rows.flatMap((row) => [row.fcf, row.pv]);
  const domain = valueDomain(values);
  const area = plotArea();
  const zeroY = scaleY(0, domain.min, domain.max);
  const barWidth = area.width / Math.max(rows.length * 2.2, 1);
  const step = area.width / rows.length;

  const bars = rows
    .map((row, index) => {
      if (row.pv === null) {
        return "";
      }
      const x = area.x + index * step + (step - barWidth) / 2;
      const y = row.pv >= 0 ? scaleY(row.pv, domain.min, domain.max) : zeroY;
      const height = Math.abs(scaleY(row.pv, domain.min, domain.max) - zeroY);
      return `<rect x="${x}" y="${Math.min(y, zeroY)}" width="${barWidth}" height="${Math.max(height, 2)}" rx="8" fill="${company.company.accent}" />`;
    })
    .join("");

  const points = rows
    .map((row, index) => {
      if (row.fcf === null) {
        return null;
      }
      return {
        x: area.x + index * step + step / 2,
        y: scaleY(row.fcf, domain.min, domain.max),
      };
    })
    .filter(Boolean) as Array<{ x: number; y: number }>;

  return chartShell(
    `${company.company.ticker}: FCF History and Five-Year NPV Projection`,
    `
      ${gridLines(domain.min, domain.max)}
      ${xLabels(rows.map((row) => row.year))}
      <line x1="${area.x}" y1="${zeroY}" x2="${area.x + area.width}" y2="${zeroY}" stroke="#94a3b8" />
      ${bars}
      <path d="${linePath(points)}" fill="none" stroke="#111827" stroke-width="3" />
    `,
    `
      <rect x="${MARGIN.left}" y="${HEIGHT - 34}" width="18" height="18" rx="4" fill="${company.company.accent}" />
      <text x="${MARGIN.left + 28}" y="${HEIGHT - 20}" fill="#334155" font-size="12" font-family="Arial">Discounted PV</text>
      <line x1="${MARGIN.left + 170}" y1="${HEIGHT - 25}" x2="${MARGIN.left + 198}" y2="${HEIGHT - 25}" stroke="#111827" stroke-width="4" />
      <text x="${MARGIN.left + 208}" y="${HEIGHT - 20}" fill="#334155" font-size="12" font-family="Arial">FCF</text>
    `,
  );
}

export async function buildDashboardVisualImages(analysis: DashboardAnalysis) {
  return [
    {
      title: "Trend_Chart",
      buffer: renderSvg(buildTrendSvg(analysis)),
    },
    ...analysis.companies.flatMap((company) => [
      {
        title: `${company.company.ticker}_Bridge`,
        buffer: renderSvg(buildBridgeSvg(company)),
      },
      {
        title: `${company.company.ticker}_Valuation`,
        buffer: renderSvg(buildValuationSvg(company)),
      },
    ]),
  ];
}
