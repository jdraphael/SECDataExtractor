import type { CompanyProfile, MetricKey, StatementKey } from "@/lib/types";

export const DEFAULT_ANALYSIS_YEAR = 2025;
export const TREND_YEARS = 5;
export const DISCOUNT_RATE = 0.07;

export const SEC_HEADERS = {
  "User-Agent":
    process.env.SEC_USER_AGENT ??
    "SEC Financial Dashboard academic project contact@example.com",
  "Accept-Encoding": "gzip, deflate",
};

export const COMPANIES: CompanyProfile[] = [
  {
    key: "first-solar",
    name: "First Solar, Inc.",
    ticker: "FSLR",
    cik: "0001274494",
    taxonomy: "us-gaap",
    baseCurrency: "USD",
    fiscalYearEnd: "1231",
    annualForm: "10-K",
    localFilingPath: "ProjectGuidance/FirstSolar.htm",
    accent: "#d97706",
  },
  {
    key: "brookfield",
    name: "Brookfield Renewable Corp",
    ticker: "BEPC",
    cik: "0001791863",
    taxonomy: "ifrs-full",
    baseCurrency: "USD",
    fiscalYearEnd: "1231",
    annualForm: "20-F",
    localFilingPath: "ProjectGuidance/brookfield.htm",
    accent: "#0f766e",
  },
];

export const PRICE_OVERRIDES: Partial<Record<string, Record<number, number>>> = {};

export const METRIC_LABELS: Record<MetricKey, string> = {
  revenue: "Revenue",
  operatingIncome: "Operating income",
  netIncome: "Net income",
  cashFromOperations: "Cash flow from operations",
  capex: "Capital expenditures",
  assets: "Total assets",
  currentAssets: "Current assets",
  currentLiabilities: "Current liabilities",
  liabilities: "Total liabilities",
  equity: "Equity",
  cash: "Cash and equivalents",
  receivables: "Receivables",
  inventory: "Inventory",
  ppe: "Property, plant and equipment",
  debt: "Debt / borrowings",
  sharesOutstanding: "Shares outstanding",
  depreciation: "Depreciation and amortization",
  receivablesChange: "Change in receivables",
  payablesChange: "Change in payables",
  inventoryChange: "Change in inventory",
  deferredTax: "Deferred tax",
  shareBasedCompensation: "Share-based compensation",
};

export const INCOME_STATEMENT_ORDER: StatementKey[] = [
  "revenue",
  "operatingCosts",
  "operatingIncome",
  "netIncome",
  "cashFromOperations",
  "capex",
  "freeCashFlow",
];

export const BALANCE_SHEET_ORDER: StatementKey[] = [
  "assets",
  "currentAssets",
  "cash",
  "receivables",
  "inventory",
  "ppe",
  "liabilities",
  "currentLiabilities",
  "debt",
  "equity",
];

export const CONCEPT_MAP: Record<
  CompanyProfile["key"],
  Record<MetricKey, string[]>
> = {
  "first-solar": {
    revenue: ["Revenues", "SalesRevenueNet"],
    operatingIncome: ["OperatingIncomeLoss"],
    netIncome: ["NetIncomeLoss"],
    cashFromOperations: ["NetCashProvidedByUsedInOperatingActivities"],
    capex: ["PaymentsToAcquirePropertyPlantAndEquipment"],
    assets: ["Assets"],
    currentAssets: ["AssetsCurrent"],
    currentLiabilities: ["LiabilitiesCurrent"],
    liabilities: ["Liabilities"],
    equity: ["StockholdersEquity"],
    cash: ["CashAndCashEquivalentsAtCarryingValue"],
    receivables: ["AccountsReceivableNetCurrent"],
    inventory: ["InventoryNet"],
    ppe: ["PropertyPlantAndEquipmentNet"],
    debt: [
      "LongTermDebtAndCapitalLeaseObligations",
      "LongTermDebt",
      "DebtInstrumentCarryingAmount",
    ],
    sharesOutstanding: ["EntityCommonStockSharesOutstanding"],
    depreciation: ["DepreciationDepletionAndAmortization"],
    receivablesChange: ["IncreaseDecreaseInAccountsReceivable"],
    payablesChange: [
      "IncreaseDecreaseInAccountsPayableAndAccruedLiabilities",
      "IncreaseDecreaseInAccountsPayable",
    ],
    inventoryChange: ["IncreaseDecreaseInInventories"],
    deferredTax: [
      "DeferredIncomeTaxExpenseBenefit",
      "DeferredTaxExpenseBenefit",
    ],
    shareBasedCompensation: ["ShareBasedCompensation"],
  },
  brookfield: {
    revenue: ["Revenue"],
    operatingIncome: ["OperatingProfitLoss", "ProfitLossFromOperatingActivities"],
    netIncome: ["ProfitLoss", "ProfitLossAttributableToOwnersOfParent"],
    cashFromOperations: ["CashFlowsFromUsedInOperatingActivities"],
    capex: ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
    assets: ["Assets"],
    currentAssets: ["CurrentAssets"],
    currentLiabilities: ["CurrentLiabilities"],
    liabilities: ["Liabilities"],
    equity: ["Equity", "EquityAttributableToOwnersOfParent"],
    cash: ["CashAndCashEquivalents", "Cash"],
    receivables: [
      "TradeAndOtherCurrentReceivables",
      "CurrentTradeReceivables",
      "OtherCurrentReceivables",
    ],
    inventory: ["Inventories"],
    ppe: ["PropertyPlantAndEquipment"],
    debt: ["Borrowings", "NoncurrentBorrowings", "CurrentBorrowings"],
    sharesOutstanding: ["EntityCommonStockSharesOutstanding"],
    depreciation: ["DepreciationExpense", "DepreciationPropertyPlantAndEquipment"],
    receivablesChange: [
      "AdjustmentsForDecreaseIncreaseInTradeAccountReceivable",
      "AdjustmentsForDecreaseIncreaseInOtherOperatingReceivables",
    ],
    payablesChange: ["AdjustmentsForIncreaseDecreaseInTradeAccountPayable"],
    inventoryChange: ["AdjustmentsForDecreaseIncreaseInInventories"],
    deferredTax: ["DeferredTaxExpenseIncome"],
    shareBasedCompensation: ["SharebasedPaymentExpense"],
  },
};

export const SOURCE_LINKS = [
  {
    label: "SEC API documentation",
    url: "https://www.sec.gov/edgar/sec-api-documentation",
  },
  {
    label: "EDGAR application programming interfaces",
    url: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
  },
  {
    label: "Accessing EDGAR Data",
    url: "https://www.sec.gov/os/accessing-edgar-data",
  },
  {
    label: "Team Project Guidelines",
    url: "d:/Justin/SECDataExtractor/ProjectGuidance/Team%20Project%20Guidelines.md",
  },
];
