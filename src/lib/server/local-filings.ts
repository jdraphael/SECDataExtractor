import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  CompanyProfile,
  FilingSummary,
  MetricKey,
  Provenance,
  ScalarMetric,
  Taxonomy,
  ValueExplanation,
} from "@/lib/types";

type FilingContext = {
  id: string;
  start: string | null;
  end: string | null;
  instant: string | null;
  hasSegment: boolean;
};

type LocalFact = {
  name: string;
  taxonomy: Taxonomy;
  concept: string;
  contextRef: string;
  unitRef: string;
  value: number | null;
};

type VisibleRow = {
  label: string;
  values: number[];
  text: string;
};

type ParsedLocalFiling = {
  contexts: Record<string, FilingContext>;
  facts: LocalFact[];
  visibleRows: VisibleRow[];
};

const FILING_CACHE = new Map<string, Promise<ParsedLocalFiling>>();
const LOCAL_FALLBACK_CONCEPTS: Partial<Record<MetricKey, string[]>> = {
  debt: [
    "Borrowings",
    "LongtermBorrowings",
    "NonRecourseBorrowings",
    "NonRecourseBorrowingsNoncurrent",
    "CurrentPortionOfNonRecourseBorrowings",
  ],
  sharesOutstanding: [
    "EntityCommonStockSharesOutstanding",
    "NumberOfSharesOutstanding",
    "ShareOutstandingValue",
  ],
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#8212;|&mdash;/gi, "—")
    .replace(/&#160;|&nbsp;/gi, " ")
    .replace(/&#8217;/gi, "'")
    .replace(/&#8220;|&#8221;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumericValue(
  text: string,
  scaleText: string | undefined,
  signText: string | undefined,
) {
  const stripped = stripTags(text);
  if (!stripped || stripped === "—" || stripped === "-") {
    return null;
  }

  const negativeByParens = stripped.startsWith("(") && stripped.endsWith(")");
  const normalized = stripped.replace(/[(),]/g, "").replace(/\$/g, "");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    return null;
  }

  const scale = scaleText ? Number(scaleText) : 0;
  const scaled = parsed * 10 ** scale;
  if (negativeByParens || signText === "-") {
    return -Math.abs(scaled);
  }

  return scaled;
}

function parseContexts(content: string) {
  const contexts: Record<string, FilingContext> = {};
  const contextRegex = /<xbrli:context id="([^"]+)">([\s\S]*?)<\/xbrli:context>/g;

  for (const match of content.matchAll(contextRegex)) {
    const [, id, body] = match;
    const start = body.match(/<xbrli:startDate>([^<]+)<\/xbrli:startDate>/)?.[1] ?? null;
    const end = body.match(/<xbrli:endDate>([^<]+)<\/xbrli:endDate>/)?.[1] ?? null;
    const instant = body.match(/<xbrli:instant>([^<]+)<\/xbrli:instant>/)?.[1] ?? null;
    contexts[id] = {
      id,
      start,
      end,
      instant,
      hasSegment: body.includes("<xbrli:segment>"),
    };
  }

  return contexts;
}

function parseFacts(content: string) {
  const facts: LocalFact[] = [];
  const factRegex =
    /<ix:nonFraction\b([^>]*?)name="([^"]+)"([^>]*?)>([\s\S]*?)<\/ix:nonFraction>/g;

  for (const match of content.matchAll(factRegex)) {
    const [, preAttrs, name, postAttrs, body] = match;
    const attrs = `${preAttrs} ${postAttrs}`;
    const contextRef = attrs.match(/contextRef="([^"]+)"/)?.[1];
    const unitRef = attrs.match(/unitRef="([^"]+)"/)?.[1] ?? "";
    const scale = attrs.match(/scale="([^"]+)"/)?.[1];
    const sign = attrs.match(/sign="([^"]+)"/)?.[1];

    if (!contextRef) {
      continue;
    }

    const [taxonomyPrefix, concept] = name.split(":");
    if (!concept) {
      continue;
    }

    const taxonomy =
      taxonomyPrefix === "dei"
        ? "dei"
        : taxonomyPrefix === "ifrs-full"
          ? "ifrs-full"
          : "us-gaap";

    facts.push({
      name,
      taxonomy,
      concept,
      contextRef,
      unitRef,
      value: parseNumericValue(body, scale, sign),
    });
  }

  return facts;
}

function parseVisibleRows(content: string) {
  const rows: VisibleRow[] = [];

  for (const match of content.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const text = stripTags(match[1]);
    if (!text) {
      continue;
    }

    const values = [...text.matchAll(/\(?\d[\d,]*(?:\.\d+)?\)?/g)]
      .map((item) => item[0])
      .map((raw) => {
        const negative = raw.startsWith("(") && raw.endsWith(")");
        const parsed = Number(raw.replace(/[(),]/g, ""));
        if (Number.isNaN(parsed)) {
          return null;
        }
        return negative ? -parsed : parsed;
      })
      .filter((value): value is number => value !== null);

    const label = text
      .replace(/\$+/g, " ")
      .replace(/\(?\d[\d,]*(?:\.\d+)?\)?/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!label) {
      continue;
    }

    rows.push({ label, values, text });
  }

  return rows;
}

async function parseLocalFiling(company: CompanyProfile) {
  const absolutePath = path.resolve(process.cwd(), company.localFilingPath);
  if (!FILING_CACHE.has(absolutePath)) {
    FILING_CACHE.set(
      absolutePath,
      readFile(absolutePath, "utf8").then((content) => ({
        contexts: parseContexts(content),
        facts: parseFacts(content),
        visibleRows: parseVisibleRows(content),
      })),
    );
  }

  return FILING_CACHE.get(absolutePath) as Promise<ParsedLocalFiling>;
}

function isMatchingPeriod(
  context: FilingContext | undefined,
  year: number,
  mode: "flow" | "instant",
) {
  if (!context) {
    return false;
  }

  if (mode === "instant") {
    return (context.instant ?? context.end) === `${year}-12-31`;
  }

  return context.start === `${year}-01-01` && context.end === `${year}-12-31`;
}

function conceptPriority(key: MetricKey, company: CompanyProfile, concept: string) {
  const configured = key === "sharesOutstanding"
    ? LOCAL_FALLBACK_CONCEPTS.sharesOutstanding ?? []
    : key === "debt"
      ? LOCAL_FALLBACK_CONCEPTS.debt ?? []
      : [];

  const companySpecific =
    key === "sharesOutstanding" && company.key === "brookfield"
      ? [
          "EntityCommonStockSharesOutstanding",
          "NumberOfSharesOutstanding",
          "ShareOutstandingValue",
        ]
      : configured;

  const concepts = companySpecific.length ? companySpecific : configured;
  const index = concepts.indexOf(concept);
  return index === -1 ? 99 : index;
}

function chooseBestFact(
  company: CompanyProfile,
  parsed: ParsedLocalFiling,
  year: number,
  key: MetricKey,
  concepts: string[],
  mode: "flow" | "instant",
  unit: "USD" | "shares",
) {
  const conceptSet = new Set([
    ...concepts,
    ...(LOCAL_FALLBACK_CONCEPTS[key] ?? []),
  ]);

  return parsed.facts
    .filter((fact) => {
      if (fact.value === null) {
        return false;
      }
      if (!conceptSet.has(fact.concept)) {
        return false;
      }
      if (unit === "USD" && fact.unitRef !== "usd") {
        return false;
      }
      if (unit === "shares" && fact.unitRef !== "shares") {
        return false;
      }
      return isMatchingPeriod(parsed.contexts[fact.contextRef], year, mode);
    })
    .sort((left, right) => {
      const leftContext = parsed.contexts[left.contextRef];
      const rightContext = parsed.contexts[right.contextRef];
      const leftSegmentPenalty = leftContext?.hasSegment ? 1 : 0;
      const rightSegmentPenalty = rightContext?.hasSegment ? 1 : 0;
      if (leftSegmentPenalty !== rightSegmentPenalty) {
        return leftSegmentPenalty - rightSegmentPenalty;
      }

      const leftPriority = conceptPriority(key, company, left.concept);
      const rightPriority = conceptPriority(key, company, right.concept);
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.concept.localeCompare(right.concept);
    })[0] ?? null;
}

function buildProvenance(
  company: CompanyProfile,
  filing: FilingSummary | null,
  fact: LocalFact,
  context: FilingContext | undefined,
): Provenance {
  return {
    sourceKind: "local-filing",
    sourceLabel: `${company.name} saved filing HTML`,
    concept: fact.concept,
    taxonomy: fact.taxonomy,
    accession: filing?.accession ?? "",
    filed: filing?.filed ?? "",
    form: filing?.form ?? company.annualForm,
    start: context?.start ?? null,
    end: context?.instant ?? context?.end ?? "",
    frame: null,
    filingPath: company.localFilingPath,
    primaryDocument: filing?.primaryDocument ?? null,
  };
}

function buildExplanation(
  company: CompanyProfile,
  key: MetricKey,
  provenance: Provenance | null,
  notes: string[] = [],
): ValueExplanation {
  return {
    definition: `${key} sourced from the saved ${company.annualForm} filing fallback.`,
    formula: null,
    displayFormula: null,
    sourceKind: provenance?.sourceKind ?? "local-filing",
    sourceLabel: provenance?.sourceLabel ?? `${company.name} saved filing HTML`,
    provenance,
    notes,
  };
}

export async function getLocalMetricForYear(
  company: CompanyProfile,
  year: number,
  key: MetricKey,
  concepts: string[],
  mode: "flow" | "instant",
  unit: "USD" | "shares",
  filing: FilingSummary | null,
): Promise<ScalarMetric | null> {
  const parsed = await parseLocalFiling(company);
  const fact = chooseBestFact(company, parsed, year, key, concepts, mode, unit);
  if (!fact) {
    return null;
  }

  const provenance = buildProvenance(company, filing, fact, parsed.contexts[fact.contextRef]);
  return {
    key,
    label: fact.concept,
    unit,
    value: fact.value,
    provenance,
    explanation: buildExplanation(company, key, provenance),
  };
}

export async function getLocalConceptValue(
  company: CompanyProfile,
  year: number,
  concepts: string[],
  mode: "flow" | "instant",
  unit: "USD" | "shares",
  filing: FilingSummary | null,
) {
  const parsed = await parseLocalFiling(company);
  const fact = chooseBestFact(company, parsed, year, "revenue", concepts, mode, unit);
  if (!fact) {
    return null;
  }

  const provenance = buildProvenance(company, filing, fact, parsed.contexts[fact.contextRef]);
  return {
    value: fact.value,
    provenance,
  };
}

export async function getLocalVisibleRowValue(
  company: CompanyProfile,
  year: number,
  label: string,
) {
  const parsed = await parseLocalFiling(company);
  const row = parsed.visibleRows.find(
    (candidate) => candidate.label === label && candidate.values.length >= 3,
  );

  if (!row) {
    return null;
  }

  const offset = 2025 - year;
  if (offset < 0 || offset >= row.values.length) {
    return null;
  }

  return row.values[offset] * 1_000_000;
}

export function buildDerivedExplanation(
  definition: string,
  formula: string,
  displayFormula: string,
  notes: string[],
  provenance: Provenance | null,
  sourceLabel: string,
): ValueExplanation {
  return {
    definition,
    formula,
    displayFormula,
    sourceKind: "derived",
    sourceLabel,
    provenance,
    notes,
  };
}
