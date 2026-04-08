import type { CompanyProfile } from "@/lib/types";

export type SecFact = {
  accn: string;
  end: string;
  filed: string;
  form: string;
  frame?: string;
  start?: string;
  val: number;
};

function parseDate(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function isAnnualForm(company: CompanyProfile, form: string) {
  return company.key === "brookfield" ? form === "20-F" : form === "10-K";
}

function getDurationDays(fact: SecFact) {
  if (!fact.start) {
    return null;
  }
  const start = parseDate(fact.start);
  const end = parseDate(fact.end);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function selectBestFact(
  company: CompanyProfile,
  unitFacts: SecFact[] | undefined,
  year: number,
  mode: "flow" | "instant",
) {
  if (!unitFacts?.length) {
    return null;
  }

  const candidates = unitFacts
    .filter((fact) => isAnnualForm(company, fact.form))
    .filter((fact) => parseDate(fact.end).getUTCFullYear() === year)
    .filter((fact) => {
      if (mode === "instant") {
        return true;
      }
      const durationDays = getDurationDays(fact);
      return durationDays !== null && durationDays >= 330 && durationDays <= 370;
    })
    .sort((left, right) => {
      const leftExactYearEnd = left.end === `${year}-12-31` ? 1 : 0;
      const rightExactYearEnd = right.end === `${year}-12-31` ? 1 : 0;
      if (leftExactYearEnd !== rightExactYearEnd) {
        return rightExactYearEnd - leftExactYearEnd;
      }

      const leftFramePenalty = left.frame ? 1 : 0;
      const rightFramePenalty = right.frame ? 1 : 0;
      if (leftFramePenalty !== rightFramePenalty) {
        return leftFramePenalty - rightFramePenalty;
      }

      return parseDate(right.filed).getTime() - parseDate(left.filed).getTime();
    });

  return candidates[0] ?? null;
}
