import ExcelJS from "exceljs";
import JSZip from "jszip";

import { COMPANIES } from "@/lib/config";
import { buildYearMetrics } from "@/lib/server/analysis";
import { getLocalVisibleRowValue } from "@/lib/server/local-filings";
import { getYearEndPrice } from "@/lib/server/market";
import { getAnnualFilingSummary, getCompanyFacts, getFactForConcepts } from "@/lib/server/sec";
import type { CompanyProfile, DashboardAnalysis } from "@/lib/types";

type ExportRow = {
  year: number;
  revenue: number | null;
  cogs: number | null;
  expenses: number | null;
  netIncome: number | null;
  cashFromOperations: number | null;
  totalAssets: number | null;
  liabilities: number | null;
  equity: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  capex: number | null;
  debt: number | null;
  sharesOutstanding: number | null;
  yearEndPrice: number | null;
  notes: string;
};

type ExportCompanyData = {
  company: CompanyProfile;
  rows: ExportRow[];
};

const FINANCIAL_HEADERS = [
  "Year",
  "Revenue",
  "COGS",
  "Expenses",
  "Net Income",
  "Cash Flow Ops",
  "Total Assets",
  "Liabilities",
  "Equity",
  "Current Assets",
  "Current Liabilities",
  "CapEx",
  "Debt",
  "Shares Outstanding",
  "Year-End Price",
  "Notes",
] as const;

const FINANCIAL_INDEX = {
  year: 0,
  revenue: 1,
  cogs: 2,
  expenses: 3,
  netIncome: 4,
  cashFromOperations: 5,
  totalAssets: 6,
  liabilities: 7,
  equity: 8,
  currentAssets: 9,
  currentLiabilities: 10,
  capex: 11,
  debt: 12,
  sharesOutstanding: 13,
  yearEndPrice: 14,
  notes: 15,
} as const;

const FIRST_SOLAR_START_COL = 1;
const BROOKFIELD_START_COL = 18;
const DATA_START_ROW = 3;
const DATA_END_ROW = 7;
const DISCOUNT_RATE = 0.07;

function toColumn(columnNumber: number) {
  let current = columnNumber;
  let column = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    current = Math.floor((current - 1) / 26);
  }
  return column;
}

function cellAddress(columnNumber: number, rowNumber: number) {
  return `${toColumn(columnNumber)}${rowNumber}`;
}

function styleHeading(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF173042" },
  };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

function styleSheet(worksheet: ExcelJS.Worksheet) {
  worksheet.views = [{ state: "frozen", ySplit: 2 }];
}

function styleDataRow(row: ExcelJS.Row, index: number, isTotal = false) {
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: isTotal ? "FFD8EBF3" : index % 2 === 0 ? "FFFFFFFF" : "FFEEF7FB" },
  };
  if (isTotal) {
    row.font = { bold: true };
  }
}

function autosize(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    let max = 10;
    column.eachCell({ includeEmpty: true }, (cell) => {
      max = Math.max(max, String(cell.value ?? "").length + 2);
    });
    column.width = Math.min(max, 28);
  });
}

function setCurrency(cell: ExcelJS.Cell) {
  cell.numFmt = '$#,##0.00;($#,##0.00)';
}

function setAccounting(cell: ExcelJS.Cell) {
  cell.numFmt = '$#,##0;($#,##0)';
}

function setPercent(cell: ExcelJS.Cell) {
  cell.numFmt = "0.0%";
}

function setRatio(cell: ExcelJS.Cell) {
  cell.numFmt = '0.00"x"';
}

function setShares(cell: ExcelJS.Cell) {
  cell.numFmt = "#,##0";
}

function setFormula(
  cell: ExcelJS.Cell,
  formula: string,
  result: number | string | null,
  note?: string,
) {
  cell.value = { formula, result: result ?? "" };
  if (note) {
    cell.note = note;
  }
}

function financialCell(startColumn: number, rowNumber: number, index: number) {
  return `Financial_Data!$${toColumn(startColumn + index)}$${rowNumber}`;
}

async function buildExportData(
  company: CompanyProfile,
  yearsDescending: number[],
): Promise<ExportCompanyData> {
  const facts = await getCompanyFacts(company);

  const rows = await Promise.all(
    yearsDescending.map(async (year) => {
      const filing = await getAnnualFilingSummary(company, year);
      const metrics = await buildYearMetrics(company, year, filing);
      const yearEndPrice = await getYearEndPrice(company, year);

      let cogs: number | null = null;
      let expenses: number | null = null;
      let notes = "";

      if (company.key === "first-solar") {
        const costOfSales =
          getFactForConcepts(company, facts, year, ["CostOfGoodsAndServicesSold"], "flow")
            ?.value ?? (await getLocalVisibleRowValue(company, year, "Cost of sales"));

        cogs = costOfSales;
        expenses =
          metrics.revenue.value !== null &&
          cogs !== null &&
          metrics.operatingIncome.value !== null
            ? metrics.revenue.value - cogs - metrics.operatingIncome.value
            : null;
        notes = "Expenses = Revenue - COGS - Operating income";
      } else {
        const directOperatingCosts =
          getFactForConcepts(company, facts, year, ["OperatingExpense"], "flow")?.value ??
          (await getLocalVisibleRowValue(company, year, "Direct operating costs"));
        const managementServiceCosts = await getLocalVisibleRowValue(
          company,
          year,
          "Management service costs",
        );
        const depreciation = await getLocalVisibleRowValue(company, year, "Depreciation");

        cogs = directOperatingCosts === null ? null : Math.abs(directOperatingCosts);
        expenses =
          managementServiceCosts !== null && depreciation !== null
            ? Math.abs(managementServiceCosts) + Math.abs(depreciation)
            : null;
        notes =
          "COGS = Direct operating costs. Expenses = Management service costs + Depreciation";
      }

      return {
        year,
        revenue: metrics.revenue.value,
        cogs,
        expenses,
        netIncome: metrics.netIncome.value,
        cashFromOperations: metrics.cashFromOperations.value,
        totalAssets: metrics.assets.value,
        liabilities: metrics.liabilities.value,
        equity: metrics.equity.value,
        currentAssets: metrics.currentAssets.value,
        currentLiabilities: metrics.currentLiabilities.value,
        capex: metrics.capex.value,
        debt: metrics.debt.value,
        sharesOutstanding: metrics.sharesOutstanding.value,
        yearEndPrice,
        notes,
      } satisfies ExportRow;
    }),
  );

  return { company, rows };
}

function writeCompanyFinancialTable(
  worksheet: ExcelJS.Worksheet,
  startColumn: number,
  data: ExportCompanyData,
) {
  worksheet.getCell(cellAddress(startColumn, 1)).value = data.company.name;
  worksheet.getCell(cellAddress(startColumn, 1)).font = { bold: true, size: 14 };

  FINANCIAL_HEADERS.forEach((header, index) => {
    worksheet.getCell(cellAddress(startColumn + index, 2)).value = header;
  });
  styleHeading(worksheet.getRow(2));

  data.rows.forEach((row, index) => {
    const excelRow = DATA_START_ROW + index;
    const values = [
      row.year,
      row.revenue,
      row.cogs,
      row.expenses,
      row.netIncome,
      row.cashFromOperations,
      row.totalAssets,
      row.liabilities,
      row.equity,
      row.currentAssets,
      row.currentLiabilities,
      row.capex,
      row.debt,
      row.sharesOutstanding,
      row.yearEndPrice,
      row.notes,
    ];

    values.forEach((value, valueIndex) => {
      worksheet.getCell(cellAddress(startColumn + valueIndex, excelRow)).value = value ?? "";
    });

    styleDataRow(worksheet.getRow(excelRow), index);
    setAccounting(worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.revenue, excelRow)));
    setAccounting(worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.cogs, excelRow)));
    setAccounting(worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.expenses, excelRow)));
    setAccounting(worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.netIncome, excelRow)));
    setAccounting(
      worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.cashFromOperations, excelRow)),
    );
    setAccounting(
      worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.totalAssets, excelRow)),
    );
    setAccounting(
      worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.liabilities, excelRow)),
    );
    setAccounting(worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.equity, excelRow)));
    setAccounting(
      worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.currentAssets, excelRow)),
    );
    setAccounting(
      worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.currentLiabilities, excelRow)),
    );
    setAccounting(worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.capex, excelRow)));
    setAccounting(worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.debt, excelRow)));
    setShares(
      worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.sharesOutstanding, excelRow)),
    );
    setCurrency(
      worksheet.getCell(cellAddress(startColumn + FINANCIAL_INDEX.yearEndPrice, excelRow)),
    );
  });
}

function addVerticalSection(
  worksheet: ExcelJS.Worksheet,
  startColumn: number,
  title: string,
  companyStartColumn: number,
  selectedDataRow: number,
) {
  worksheet.getCell(cellAddress(startColumn, 1)).value = title;
  worksheet.getCell(cellAddress(startColumn, 1)).font = { bold: true, size: 14 };
  ["Metric", "Amount", "Vertical %", "Formula"].forEach((header, index) => {
    worksheet.getCell(cellAddress(startColumn + index, 2)).value = header;
  });
  styleHeading(worksheet.getRow(2));

  const metrics = [
    ["Revenue", FINANCIAL_INDEX.revenue, FINANCIAL_INDEX.revenue, "Revenue / Revenue"],
    ["COGS", FINANCIAL_INDEX.cogs, FINANCIAL_INDEX.revenue, "COGS / Revenue"],
    ["Expenses", FINANCIAL_INDEX.expenses, FINANCIAL_INDEX.revenue, "Expenses / Revenue"],
    ["Net Income", FINANCIAL_INDEX.netIncome, FINANCIAL_INDEX.revenue, "Net Income / Revenue"],
    ["Total Assets", FINANCIAL_INDEX.totalAssets, FINANCIAL_INDEX.totalAssets, "Assets / Assets"],
    ["Liabilities", FINANCIAL_INDEX.liabilities, FINANCIAL_INDEX.totalAssets, "Liabilities / Assets"],
    ["Equity", FINANCIAL_INDEX.equity, FINANCIAL_INDEX.totalAssets, "Equity / Assets"],
  ] as const;

  metrics.forEach(([label, numeratorIndex, denominatorIndex, formulaLabel], index) => {
    const rowNumber = 3 + index;
    const amountRef = financialCell(companyStartColumn, selectedDataRow, numeratorIndex);
    const denominatorRef = financialCell(companyStartColumn, selectedDataRow, denominatorIndex);

    worksheet.getCell(cellAddress(startColumn, rowNumber)).value = label;
    setFormula(
      worksheet.getCell(cellAddress(startColumn + 1, rowNumber)),
      amountRef,
      null,
      formulaLabel,
    );
    setFormula(
      worksheet.getCell(cellAddress(startColumn + 2, rowNumber)),
      `IFERROR(${amountRef}/${denominatorRef},"")`,
      null,
      formulaLabel,
    );
    worksheet.getCell(cellAddress(startColumn + 3, rowNumber)).value = formulaLabel;
    styleDataRow(worksheet.getRow(rowNumber), index, label === "Revenue" || label === "Total Assets");
    setAccounting(worksheet.getCell(cellAddress(startColumn + 1, rowNumber)));
    setPercent(worksheet.getCell(cellAddress(startColumn + 2, rowNumber)));
  });
}

function addHorizontalSection(
  worksheet: ExcelJS.Worksheet,
  startColumn: number,
  title: string,
  companyStartColumn: number,
  currentRow: number,
  priorRow: number,
) {
  worksheet.getCell(cellAddress(startColumn, 1)).value = title;
  worksheet.getCell(cellAddress(startColumn, 1)).font = { bold: true, size: 14 };
  ["Metric", "Current", "Prior", "Change", "Growth %", "Formula"].forEach((header, index) => {
    worksheet.getCell(cellAddress(startColumn + index, 2)).value = header;
  });
  styleHeading(worksheet.getRow(2));

  const metrics = [
    ["Revenue", FINANCIAL_INDEX.revenue],
    ["COGS", FINANCIAL_INDEX.cogs],
    ["Expenses", FINANCIAL_INDEX.expenses],
    ["Net Income", FINANCIAL_INDEX.netIncome],
    ["Cash Flow Ops", FINANCIAL_INDEX.cashFromOperations],
    ["Total Assets", FINANCIAL_INDEX.totalAssets],
    ["Liabilities", FINANCIAL_INDEX.liabilities],
    ["Equity", FINANCIAL_INDEX.equity],
  ] as const;

  metrics.forEach(([label, metricIndex], index) => {
    const rowNumber = 3 + index;
    const currentAddress = financialCell(companyStartColumn, currentRow, metricIndex);
    const priorAddress = financialCell(companyStartColumn, priorRow, metricIndex);
    worksheet.getCell(cellAddress(startColumn, rowNumber)).value = label;
    setFormula(worksheet.getCell(cellAddress(startColumn + 1, rowNumber)), currentAddress, null);
    setFormula(worksheet.getCell(cellAddress(startColumn + 2, rowNumber)), priorAddress, null);
    setFormula(
      worksheet.getCell(cellAddress(startColumn + 3, rowNumber)),
      `IFERROR(${currentAddress}-${priorAddress},"")`,
      null,
      "Current year - prior year",
    );
    setFormula(
      worksheet.getCell(cellAddress(startColumn + 4, rowNumber)),
      `IFERROR((${currentAddress}-${priorAddress})/${priorAddress},"")`,
      null,
      "(Current year - prior year) / prior year",
    );
    worksheet.getCell(cellAddress(startColumn + 5, rowNumber)).value =
      "(Current - Prior) / Prior";
    styleDataRow(worksheet.getRow(rowNumber), index, label === "Revenue");
    setAccounting(worksheet.getCell(cellAddress(startColumn + 1, rowNumber)));
    setAccounting(worksheet.getCell(cellAddress(startColumn + 2, rowNumber)));
    setAccounting(worksheet.getCell(cellAddress(startColumn + 3, rowNumber)));
    setPercent(worksheet.getCell(cellAddress(startColumn + 4, rowNumber)));
  });
}

function addRatioRows(
  worksheet: ExcelJS.Worksheet,
  firstSolarStart: number,
  brookfieldStart: number,
  selectedDataRow: number,
) {
  worksheet.getCell("A1").value = "Ratio analysis";
  worksheet.getCell("A1").font = { bold: true, size: 14 };
  worksheet.addRow(["Ratio", "First Solar", "Brookfield", "Formula", "What it shows"]);
  styleHeading(worksheet.getRow(2));

  const firstSolar = {
    revenue: financialCell(firstSolarStart, selectedDataRow, FINANCIAL_INDEX.revenue),
    netIncome: financialCell(firstSolarStart, selectedDataRow, FINANCIAL_INDEX.netIncome),
    currentAssets: financialCell(firstSolarStart, selectedDataRow, FINANCIAL_INDEX.currentAssets),
    currentLiabilities: financialCell(firstSolarStart, selectedDataRow, FINANCIAL_INDEX.currentLiabilities),
    liabilities: financialCell(firstSolarStart, selectedDataRow, FINANCIAL_INDEX.liabilities),
    equity: financialCell(firstSolarStart, selectedDataRow, FINANCIAL_INDEX.equity),
    assets: financialCell(firstSolarStart, selectedDataRow, FINANCIAL_INDEX.totalAssets),
    price: financialCell(firstSolarStart, selectedDataRow, FINANCIAL_INDEX.yearEndPrice),
    shares: financialCell(firstSolarStart, selectedDataRow, FINANCIAL_INDEX.sharesOutstanding),
  };
  const brookfield = {
    revenue: financialCell(brookfieldStart, selectedDataRow, FINANCIAL_INDEX.revenue),
    netIncome: financialCell(brookfieldStart, selectedDataRow, FINANCIAL_INDEX.netIncome),
    currentAssets: financialCell(brookfieldStart, selectedDataRow, FINANCIAL_INDEX.currentAssets),
    currentLiabilities: financialCell(brookfieldStart, selectedDataRow, FINANCIAL_INDEX.currentLiabilities),
    liabilities: financialCell(brookfieldStart, selectedDataRow, FINANCIAL_INDEX.liabilities),
    equity: financialCell(brookfieldStart, selectedDataRow, FINANCIAL_INDEX.equity),
    assets: financialCell(brookfieldStart, selectedDataRow, FINANCIAL_INDEX.totalAssets),
    price: financialCell(brookfieldStart, selectedDataRow, FINANCIAL_INDEX.yearEndPrice),
    shares: financialCell(brookfieldStart, selectedDataRow, FINANCIAL_INDEX.sharesOutstanding),
  };

  const ratios = [
    ["Profit Margin", `IFERROR(${firstSolar.netIncome}/${firstSolar.revenue},"")`, `IFERROR(${brookfield.netIncome}/${brookfield.revenue},"")`, "Net Income / Revenue", "Bottom-line profitability per dollar of revenue.", "percent"],
    ["Current Ratio", `IFERROR(${firstSolar.currentAssets}/${firstSolar.currentLiabilities},"")`, `IFERROR(${brookfield.currentAssets}/${brookfield.currentLiabilities},"")`, "Current Assets / Current Liabilities", "Short-term liquidity coverage.", "ratio"],
    ["Debt-to-Equity", `IFERROR(${firstSolar.liabilities}/${firstSolar.equity},"")`, `IFERROR(${brookfield.liabilities}/${brookfield.equity},"")`, "Liabilities / Equity", "Leverage relative to the equity base.", "ratio"],
    ["Return on Assets", `IFERROR(${firstSolar.netIncome}/${firstSolar.assets},"")`, `IFERROR(${brookfield.netIncome}/${brookfield.assets},"")`, "Net Income / Total Assets", "Profitability generated from the asset base.", "percent"],
    ["Market Capitalization", `IFERROR(${firstSolar.price}*${firstSolar.shares},"")`, `IFERROR(${brookfield.price}*${brookfield.shares},"")`, "Year-End Price * Shares Outstanding", "Equity market value at year end.", "usd"],
    ["Price-to-Book", `IFERROR(${firstSolar.price}/(${firstSolar.equity}/${firstSolar.shares}),"")`, `IFERROR(${brookfield.price}/(${brookfield.equity}/${brookfield.shares}),"")`, "Year-End Price / (Equity / Shares Outstanding)", "Market price relative to book value per share.", "ratio"],
  ] as const;

  ratios.forEach(([label, firstFormula, secondFormula, formulaText, meaning, format], index) => {
    const rowNumber = 3 + index;
    worksheet.getCell(`A${rowNumber}`).value = label;
    setFormula(worksheet.getCell(`B${rowNumber}`), firstFormula, null, formulaText);
    setFormula(worksheet.getCell(`C${rowNumber}`), secondFormula, null, formulaText);
    worksheet.getCell(`D${rowNumber}`).value = formulaText;
    worksheet.getCell(`E${rowNumber}`).value = meaning;
    styleDataRow(worksheet.getRow(rowNumber), index);
    if (format === "percent") {
      setPercent(worksheet.getCell(`B${rowNumber}`));
      setPercent(worksheet.getCell(`C${rowNumber}`));
    } else if (format === "ratio") {
      setRatio(worksheet.getCell(`B${rowNumber}`));
      setRatio(worksheet.getCell(`C${rowNumber}`));
    } else {
      setAccounting(worksheet.getCell(`B${rowNumber}`));
      setAccounting(worksheet.getCell(`C${rowNumber}`));
    }
  });
}

function addYearData(
  worksheet: ExcelJS.Worksheet,
  firstSolarStart: number,
  brookfieldStart: number,
  yearsDescending: number[],
) {
  worksheet.getCell("A1").value = "Trend data for linked Excel charts";
  worksheet.getCell("A1").font = { bold: true, size: 14 };
  worksheet.getCell("A2").value = "Year";
  worksheet.getCell("B2").value = "First Solar Net Income";
  worksheet.getCell("C2").value = "First Solar CFO";
  worksheet.getCell("D2").value = "Brookfield Net Income";
  worksheet.getCell("E2").value = "Brookfield CFO";
  styleHeading(worksheet.getRow(2));

  yearsDescending.slice().reverse().forEach((year, index) => {
    const rowNumber = 3 + index;
    const financialRow = DATA_START_ROW + (yearsDescending.length - 1 - index);
    worksheet.getCell(`A${rowNumber}`).value = year;
    setFormula(worksheet.getCell(`B${rowNumber}`), financialCell(firstSolarStart, financialRow, FINANCIAL_INDEX.netIncome), null);
    setFormula(worksheet.getCell(`C${rowNumber}`), financialCell(firstSolarStart, financialRow, FINANCIAL_INDEX.cashFromOperations), null);
    setFormula(worksheet.getCell(`D${rowNumber}`), financialCell(brookfieldStart, financialRow, FINANCIAL_INDEX.netIncome), null);
    setFormula(worksheet.getCell(`E${rowNumber}`), financialCell(brookfieldStart, financialRow, FINANCIAL_INDEX.cashFromOperations), null);
    styleDataRow(worksheet.getRow(rowNumber), index);
    ["B", "C", "D", "E"].forEach((column) => setAccounting(worksheet.getCell(`${column}${rowNumber}`)));
  });

  worksheet.getCell("H2").value = "Ratio";
  worksheet.getCell("I2").value = "First Solar";
  worksheet.getCell("J2").value = "Brookfield";
  worksheet.getCell("L2").value = "Common-Size Metric";
  worksheet.getCell("M2").value = "First Solar";
  worksheet.getCell("N2").value = "Brookfield";

  ["H2", "I2", "J2", "L2", "M2", "N2"].forEach((address) => {
    const cell = worksheet.getCell(address);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173042" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  [
    ["Profit Margin", 3, "percent"],
    ["Current Ratio", 4, "ratio"],
    ["Debt-to-Equity", 5, "ratio"],
    ["Return on Assets", 6, "percent"],
  ].forEach(([label, sourceRow, format], index) => {
    const rowNumber = 3 + index;
    worksheet.getCell(`H${rowNumber}`).value = label;
    setFormula(worksheet.getCell(`I${rowNumber}`), `'Ratio_Analysis'!B${sourceRow}`, null);
    setFormula(worksheet.getCell(`J${rowNumber}`), `'Ratio_Analysis'!C${sourceRow}`, null);
    if (format === "percent") {
      setPercent(worksheet.getCell(`I${rowNumber}`));
      setPercent(worksheet.getCell(`J${rowNumber}`));
    } else {
      setRatio(worksheet.getCell(`I${rowNumber}`));
      setRatio(worksheet.getCell(`J${rowNumber}`));
    }
  });

  [
    ["COGS / Revenue", 4],
    ["Expenses / Revenue", 5],
    ["Net Income / Revenue", 6],
    ["Liabilities / Assets", 8],
    ["Equity / Assets", 9],
  ].forEach(([label, sourceRow], index) => {
    const rowNumber = 3 + index;
    worksheet.getCell(`L${rowNumber}`).value = label;
    setFormula(worksheet.getCell(`M${rowNumber}`), `'Vertical_Analysis'!C${sourceRow}`, null);
    setFormula(worksheet.getCell(`N${rowNumber}`), `'Vertical_Analysis'!H${sourceRow}`, null);
    setPercent(worksheet.getCell(`M${rowNumber}`));
    setPercent(worksheet.getCell(`N${rowNumber}`));
  });
}

function addFcfSection(
  worksheet: ExcelJS.Worksheet,
  startColumn: number,
  title: string,
  financialStartColumn: number,
  yearsDescending: number[],
) {
  worksheet.getCell(cellAddress(startColumn, 1)).value = title;
  worksheet.getCell(cellAddress(startColumn, 1)).font = { bold: true, size: 14 };
  ["Year", "CFO", "CapEx", "FCF", "Projected FCF", "Discount Factor", "Present Value"].forEach((header, index) => {
    worksheet.getCell(cellAddress(startColumn + index, 2)).value = header;
  });
  styleHeading(worksheet.getRow(2));

  yearsDescending.slice().reverse().forEach((year, index) => {
    const rowNumber = 3 + index;
    const financialRow = DATA_START_ROW + (yearsDescending.length - 1 - index);
    worksheet.getCell(cellAddress(startColumn, rowNumber)).value = year;
    setFormula(worksheet.getCell(cellAddress(startColumn + 1, rowNumber)), financialCell(financialStartColumn, financialRow, FINANCIAL_INDEX.cashFromOperations), null);
    setFormula(worksheet.getCell(cellAddress(startColumn + 2, rowNumber)), financialCell(financialStartColumn, financialRow, FINANCIAL_INDEX.capex), null);
    setFormula(worksheet.getCell(cellAddress(startColumn + 3, rowNumber)), `IFERROR(${cellAddress(startColumn + 1, rowNumber)}-${cellAddress(startColumn + 2, rowNumber)},"")`, null, "Free Cash Flow = CFO - CapEx");
    [1, 2, 3].forEach((offset) => setAccounting(worksheet.getCell(cellAddress(startColumn + offset, rowNumber))));
  });

  const growthMethodRow = 9;
  const growthRateRow = 10;
  const discountRow = 11;
  const earliestFcf = cellAddress(startColumn + 3, 3);
  const latestFcf = cellAddress(startColumn + 3, 7);
  const earliestRevenue = financialCell(financialStartColumn, DATA_END_ROW, FINANCIAL_INDEX.revenue);
  const latestRevenue = financialCell(financialStartColumn, DATA_START_ROW, FINANCIAL_INDEX.revenue);

  worksheet.getCell(cellAddress(startColumn, growthMethodRow)).value = "Growth Method";
  setFormula(worksheet.getCell(cellAddress(startColumn + 1, growthMethodRow)), `IF(AND(${latestFcf}>0,${earliestFcf}>0),"FCF CAGR","Revenue CAGR fallback")`, null);
  worksheet.getCell(cellAddress(startColumn, growthRateRow)).value = "Growth Rate";
  setFormula(worksheet.getCell(cellAddress(startColumn + 1, growthRateRow)), `IF(AND(${latestFcf}>0,${earliestFcf}>0),POWER(${latestFcf}/${earliestFcf},1/4)-1,POWER(${latestRevenue}/${earliestRevenue},1/4)-1)`, null, "Use FCF CAGR when first and last FCF are positive; otherwise use revenue CAGR.");
  worksheet.getCell(cellAddress(startColumn, discountRow)).value = "Discount Rate";
  worksheet.getCell(cellAddress(startColumn + 1, discountRow)).value = DISCOUNT_RATE;
  setPercent(worksheet.getCell(cellAddress(startColumn + 1, growthRateRow)));
  setPercent(worksheet.getCell(cellAddress(startColumn + 1, discountRow)));

  for (let index = 0; index < 5; index += 1) {
    const rowNumber = 13 + index;
    worksheet.getCell(cellAddress(startColumn, rowNumber)).value = yearsDescending[0] + index + 1;
    setFormula(worksheet.getCell(cellAddress(startColumn + 4, rowNumber)), `${latestFcf}*(1+${cellAddress(startColumn + 1, growthRateRow)})^${index + 1}`, null, "Projected FCF = Latest FCF * (1 + growth rate)^n");
    setFormula(worksheet.getCell(cellAddress(startColumn + 5, rowNumber)), `1/(1+${cellAddress(startColumn + 1, discountRow)})^${index + 1}`, null, "Discount factor = 1 / (1 + 7%)^n");
    setFormula(worksheet.getCell(cellAddress(startColumn + 6, rowNumber)), `${cellAddress(startColumn + 4, rowNumber)}*${cellAddress(startColumn + 5, rowNumber)}`, null, "Present value = Projected FCF * Discount factor");
    setAccounting(worksheet.getCell(cellAddress(startColumn + 4, rowNumber)));
    worksheet.getCell(cellAddress(startColumn + 5, rowNumber)).numFmt = "0.0000";
    setAccounting(worksheet.getCell(cellAddress(startColumn + 6, rowNumber)));
  }

  worksheet.getCell(cellAddress(startColumn, 19)).value = "NPV";
  setFormula(worksheet.getCell(cellAddress(startColumn + 1, 19)), `SUM(${cellAddress(startColumn + 6, 13)}:${cellAddress(startColumn + 6, 17)})`, null, "NPV = Sum of discounted projected free cash flows");
  setAccounting(worksheet.getCell(cellAddress(startColumn + 1, 19)));
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildLineChartXml(
  title: string,
  categoryFormula: string,
  seriesItems: Array<{ name: string; formula: string; color: string }>,
  axisIds: [string, string],
) {
  const series = seriesItems.map((item, index) => `
    <c:ser>
      <c:idx val="${index}"/><c:order val="${index}"/>
      <c:tx><c:v>${escapeXml(item.name)}</c:v></c:tx>
      <c:spPr><a:ln xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" w="28575"><a:solidFill><a:srgbClr val="${item.color}"/></a:solidFill></a:ln></c:spPr>
      <c:marker><c:symbol val="circle"/></c:marker>
      <c:cat><c:strRef><c:f>${escapeXml(categoryFormula)}</c:f></c:strRef></c:cat>
      <c:val><c:numRef><c:f>${escapeXml(item.formula)}</c:f></c:numRef></c:val>
    </c:ser>`).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <c:lang val="en-US"/>
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(title)}</a:t></a:r></a:p></c:rich></c:tx></c:title>
    <c:plotArea><c:layout/><c:lineChart><c:grouping val="standard"/>${series}<c:axId val="${axisIds[0]}"/><c:axId val="${axisIds[1]}"/></c:lineChart>
      <c:catAx><c:axId val="${axisIds[0]}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="${axisIds[1]}"/><c:crosses val="autoZero"/></c:catAx>
      <c:valAx><c:axId val="${axisIds[1]}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="$#,##0;($#,##0)" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="${axisIds[0]}"/><c:crosses val="autoZero"/></c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="r"/></c:legend><c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

function buildBarChartXml(
  title: string,
  categoryFormula: string,
  seriesItems: Array<{ name: string; formula: string; color: string; formatCode: string }>,
  axisIds: [string, string],
) {
  const series = seriesItems.map((item, index) => `
    <c:ser>
      <c:idx val="${index}"/><c:order val="${index}"/>
      <c:tx><c:v>${escapeXml(item.name)}</c:v></c:tx>
      <c:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:solidFill><a:srgbClr val="${item.color}"/></a:solidFill></c:spPr>
      <c:cat><c:strRef><c:f>${escapeXml(categoryFormula)}</c:f></c:strRef></c:cat>
      <c:val><c:numRef><c:f>${escapeXml(item.formula)}</c:f></c:numRef></c:val>
    </c:ser>`).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <c:lang val="en-US"/>
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(title)}</a:t></a:r></a:p></c:rich></c:tx></c:title>
    <c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${series}<c:axId val="${axisIds[0]}"/><c:axId val="${axisIds[1]}"/></c:barChart>
      <c:catAx><c:axId val="${axisIds[0]}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="${axisIds[1]}"/><c:crosses val="autoZero"/></c:catAx>
      <c:valAx><c:axId val="${axisIds[1]}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="${escapeXml(seriesItems[0].formatCode)}" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="${axisIds[0]}"/><c:crosses val="autoZero"/></c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="r"/></c:legend><c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

function buildDrawingXml() {
  const anchors = [
    { id: 2, name: "Net Income Chart", rel: "rId1", fromCol: 0, fromRow: 1, toCol: 8, toRow: 18 },
    { id: 3, name: "Cash Flow Chart", rel: "rId2", fromCol: 8, fromRow: 1, toCol: 16, toRow: 18 },
    { id: 4, name: "Ratio Chart", rel: "rId3", fromCol: 0, fromRow: 20, toCol: 8, toRow: 37 },
    { id: 5, name: "Common Size Chart", rel: "rId4", fromCol: 8, fromRow: 20, toCol: 16, toRow: 37 },
  ];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${anchors.map((anchor) => `
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>${anchor.fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchor.fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>${anchor.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchor.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${anchor.id}" name="${anchor.name}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${anchor.rel}"/></a:graphicData></a:graphic></xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`).join("")}
</xdr:wsDr>`;
}

async function injectCharts(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const charts = [
    buildLineChartXml("Net Income Trend", "Year_Data!$A$3:$A$7", [{ name: "First Solar", formula: "Year_Data!$B$3:$B$7", color: "D97706" }, { name: "Brookfield", formula: "Year_Data!$D$3:$D$7", color: "0F766E" }], ["501", "502"]),
    buildLineChartXml("Cash Flow From Operations Trend", "Year_Data!$A$3:$A$7", [{ name: "First Solar", formula: "Year_Data!$C$3:$C$7", color: "D97706" }, { name: "Brookfield", formula: "Year_Data!$E$3:$E$7", color: "0F766E" }], ["601", "602"]),
    buildBarChartXml("Ratio Comparison", "Year_Data!$H$3:$H$6", [{ name: "First Solar", formula: "Year_Data!$I$3:$I$6", color: "D97706", formatCode: "0.0%" }, { name: "Brookfield", formula: "Year_Data!$J$3:$J$6", color: "0F766E", formatCode: "0.0%" }], ["701", "702"]),
    buildBarChartXml("Common-Size Comparison", "Year_Data!$L$3:$L$7", [{ name: "First Solar", formula: "Year_Data!$M$3:$M$7", color: "D97706", formatCode: "0.0%" }, { name: "Brookfield", formula: "Year_Data!$N$3:$N$7", color: "0F766E", formatCode: "0.0%" }], ["801", "802"]),
  ];

  charts.forEach((chart, index) => zip.file(`xl/charts/chart${index + 1}.xml`, chart));
  zip.file("xl/drawings/drawing1.xml", buildDrawingXml());
  zip.file("xl/drawings/_rels/drawing1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart4.xml"/></Relationships>`);

  const sheetXml = await zip.file("xl/worksheets/sheet7.xml")?.async("string");
  if (sheetXml) {
    zip.file("xl/worksheets/sheet7.xml", sheetXml.includes("<drawing ") ? sheetXml : sheetXml.replace(/<pageMargins/, '<drawing r:id="rId1"/><pageMargins'));
  }
  zip.file("xl/worksheets/_rels/sheet7.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);

  const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
  if (contentTypes) {
    let updated = contentTypes;
    if (!updated.includes('/xl/drawings/drawing1.xml')) {
      updated = updated.replace("</Types>", '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>');
    }
    for (let index = 1; index <= 4; index += 1) {
      if (!updated.includes(`/xl/charts/chart${index}.xml`)) {
        updated = updated.replace("</Types>", `<Override PartName="/xl/charts/chart${index}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>\n</Types>`);
      }
    }
    zip.file("[Content_Types].xml", updated);
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

export async function buildWorkbook(analysis: DashboardAnalysis) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Codex";
  workbook.company = "MBA515 SEC Financial Dashboard";
  workbook.calcProperties.fullCalcOnLoad = true;

  const yearsDescending = analysis.availableYears.slice(-5).sort((left, right) => right - left);
  const [firstSolarData, brookfieldData] = await Promise.all(
    COMPANIES.map((company) => buildExportData(company, yearsDescending)),
  );

  const financial = workbook.addWorksheet("Financial_Data");
  styleSheet(financial);
  writeCompanyFinancialTable(financial, FIRST_SOLAR_START_COL, firstSolarData);
  writeCompanyFinancialTable(financial, BROOKFIELD_START_COL, brookfieldData);

  const vertical = workbook.addWorksheet("Vertical_Analysis");
  styleSheet(vertical);
  addVerticalSection(vertical, 1, `${firstSolarData.company.name} (${analysis.year})`, FIRST_SOLAR_START_COL, DATA_START_ROW);
  addVerticalSection(vertical, 6, `${brookfieldData.company.name} (${analysis.year})`, BROOKFIELD_START_COL, DATA_START_ROW);

  const horizontal = workbook.addWorksheet("Horizontal_Analysis");
  styleSheet(horizontal);
  addHorizontalSection(horizontal, 1, `${firstSolarData.company.name} ${analysis.year} vs ${analysis.previousYear}`, FIRST_SOLAR_START_COL, DATA_START_ROW, DATA_START_ROW + 1);
  addHorizontalSection(horizontal, 8, `${brookfieldData.company.name} ${analysis.year} vs ${analysis.previousYear}`, BROOKFIELD_START_COL, DATA_START_ROW, DATA_START_ROW + 1);

  const ratios = workbook.addWorksheet("Ratio_Analysis");
  styleSheet(ratios);
  addRatioRows(ratios, FIRST_SOLAR_START_COL, BROOKFIELD_START_COL, DATA_START_ROW);

  const yearData = workbook.addWorksheet("Year_Data");
  styleSheet(yearData);
  addYearData(yearData, FIRST_SOLAR_START_COL, BROOKFIELD_START_COL, yearsDescending);

  const fcfNpv = workbook.addWorksheet("FCF_NPV");
  styleSheet(fcfNpv);
  addFcfSection(fcfNpv, 1, firstSolarData.company.name, FIRST_SOLAR_START_COL, yearsDescending);
  addFcfSection(fcfNpv, 10, brookfieldData.company.name, BROOKFIELD_START_COL, yearsDescending);

  const charts = workbook.addWorksheet("Charts");
  charts.getCell("A1").value = "Linked Excel charts";
  charts.getCell("A1").font = { bold: true, size: 16 };
  charts.getCell("A2").value = "Chart objects on this sheet are linked to Year_Data, Vertical_Analysis, and Ratio_Analysis.";
  charts.getCell("A4").value = "Net Income Trend";
  charts.getCell("I4").value = "Cash Flow From Operations Trend";
  charts.getCell("A23").value = "Ratio Comparison";
  charts.getCell("I23").value = "Common-Size Comparison";

  [financial, vertical, horizontal, ratios, yearData, fcfNpv, charts].forEach(autosize);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return injectCharts(buffer);
}
