import { CONCEPT_MAP, SEC_HEADERS } from "@/lib/config";
import { selectBestFact, type SecFact } from "@/lib/sec-fact-selection";
import type {
  CompanyProfile,
  FilingSummary,
  MetricKey,
  Provenance,
  ScalarMetric,
  Taxonomy,
  ValueExplanation,
} from "@/lib/types";

type SecUnitCollection = {
  USD?: SecFact[];
  shares?: SecFact[];
};

type CompanyFactsResponse = {
  facts: Record<string, Record<string, { units: SecUnitCollection }>>;
};

type SubmissionRecent = {
  accessionNumber: string[];
  filingDate: string[];
  form: string[];
  reportDate: string[];
  primaryDocument: string[];
};

type SubmissionsResponse = {
  filings: {
    recent: SubmissionRecent;
  };
};

const SEC_BASE_URL = "https://data.sec.gov";
const RESPONSE_CACHE = new Map<string, Promise<unknown>>();
let nextRequestTimestamp = 0;

async function rateLimit() {
  const now = Date.now();
  const wait = Math.max(0, nextRequestTimestamp - now);
  nextRequestTimestamp = Math.max(now, nextRequestTimestamp) + 125;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

async function fetchJson<T>(path: string) {
  const url = `${SEC_BASE_URL}${path}`;
  if (!RESPONSE_CACHE.has(url)) {
    RESPONSE_CACHE.set(
      url,
      (async () => {
        await rateLimit();
        const response = await fetch(url, {
          headers: SEC_HEADERS,
          next: { revalidate: 60 * 60 * 24 },
        });
        if (!response.ok) {
          throw new Error(`SEC request failed for ${path}: ${response.status}`);
        }
        return (await response.json()) as T;
      })(),
    );
  }

  return RESPONSE_CACHE.get(url) as Promise<T>;
}

export async function getCompanyFacts(company: CompanyProfile) {
  return fetchJson<CompanyFactsResponse>(
    `/api/xbrl/companyfacts/CIK${company.cik}.json`,
  );
}

export async function getSubmissions(company: CompanyProfile) {
  return fetchJson<SubmissionsResponse>(`/submissions/CIK${company.cik}.json`);
}

function parseDate(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function toProvenance(
  taxonomy: Taxonomy,
  concept: string,
  fact: SecFact | null,
): Provenance | null {
  if (!fact) {
    return null;
  }

  return {
    sourceKind: "sec-api",
    sourceLabel: "SEC companyfacts API",
    concept,
    taxonomy,
    accession: fact.accn,
    filed: fact.filed,
    form: fact.form,
    start: fact.start ?? null,
    end: fact.end,
    frame: fact.frame ?? null,
    filingPath: null,
    primaryDocument: null,
  };
}

function buildExplanation(
  key: MetricKey,
  provenance: Provenance | null,
  label: string,
): ValueExplanation {
  return {
    definition: `${key} sourced from SEC companyfacts using concept ${label}.`,
    formula: null,
    displayFormula: null,
    sourceKind: provenance?.sourceKind ?? "sec-api",
    sourceLabel: provenance?.sourceLabel ?? "SEC companyfacts API",
    provenance,
    notes: [],
  };
}

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

export async function getMetricForYear(
  company: CompanyProfile,
  facts: CompanyFactsResponse,
  year: number,
  key: MetricKey,
): Promise<ScalarMetric> {
  const concepts = CONCEPT_MAP[company.key][key];
  const taxonomy = key === "sharesOutstanding" ? "dei" : company.taxonomy;
  const unitName = key === "sharesOutstanding" ? "shares" : "USD";
  const mode = inferMode(key);

  for (const concept of concepts) {
    const unitCollection = facts.facts?.[taxonomy]?.[concept]?.units;
    const fact = selectBestFact(
      company,
      unitCollection?.[unitName as keyof SecUnitCollection],
      year,
      mode,
    );
    if (fact) {
      const provenance = toProvenance(taxonomy, concept, fact);
      return {
        key,
        label: concept,
        unit: key === "sharesOutstanding" ? "shares" : "USD",
        value: fact.val,
        provenance,
        explanation: buildExplanation(key, provenance, concept),
      };
    }
  }

  return {
    key,
    label: concepts[0],
    unit: key === "sharesOutstanding" ? "shares" : "USD",
    value: null,
    provenance: null,
    explanation: buildExplanation(key, null, concepts[0]),
  };
}

export function getFactForConcepts(
  company: CompanyProfile,
  facts: CompanyFactsResponse,
  year: number,
  concepts: string[],
  mode: "flow" | "instant",
  options?: {
    taxonomy?: Taxonomy;
    unit?: "USD" | "shares";
  },
) {
  const taxonomy = options?.taxonomy ?? company.taxonomy;
  const unitName = options?.unit ?? "USD";

  for (const concept of concepts) {
    const unitCollection = facts.facts?.[taxonomy]?.[concept]?.units;
    const fact = selectBestFact(
      company,
      unitCollection?.[unitName as keyof SecUnitCollection],
      year,
      mode,
    );
    if (fact) {
      const provenance = toProvenance(taxonomy, concept, fact);
      return {
        value: fact.val,
        concept,
        provenance,
      };
    }
  }

  return null;
}

export async function getAnnualFilingSummary(
  company: CompanyProfile,
  year: number,
): Promise<FilingSummary | null> {
  const submissions = await getSubmissions(company);
  const { recent } = submissions.filings;

  for (let index = 0; index < recent.form.length; index += 1) {
    if (
      recent.form[index] === company.annualForm &&
      recent.reportDate[index]?.startsWith(`${year}-`)
    ) {
      return {
        accession: recent.accessionNumber[index],
        filed: recent.filingDate[index],
        form: recent.form[index],
        reportDate: recent.reportDate[index],
        primaryDocument: recent.primaryDocument[index] || null,
      };
    }
  }

  return null;
}

export async function getAvailableYears(company: CompanyProfile) {
  const submissions = await getSubmissions(company);
  const years = new Set<number>();

  submissions.filings.recent.form.forEach((form, index) => {
    if (form !== company.annualForm) {
      return;
    }
    const reportDate = submissions.filings.recent.reportDate[index];
    if (reportDate) {
      years.add(parseDate(reportDate).getUTCFullYear());
    }
  });

  return [...years].sort((left, right) => left - right);
}
