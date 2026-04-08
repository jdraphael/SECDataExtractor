import type { NextApiRequest, NextApiResponse } from "next";

import { getDashboardAnalysis } from "@/lib/server/analysis";
import { buildWorkbook } from "@/lib/server/excel";

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
) {
  const yearParam = Array.isArray(request.query.year)
    ? request.query.year[0]
    : request.query.year;
  const parsedYear = yearParam ? Number.parseInt(yearParam, 10) : undefined;
  const analysis = await getDashboardAnalysis(
    Number.isNaN(parsedYear) ? undefined : parsedYear,
  );
  const buffer = await buildWorkbook(analysis);

  response.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="mba515-sec-analysis-${analysis.year}.xlsx"`,
  );
  response.status(200).send(buffer);
}
