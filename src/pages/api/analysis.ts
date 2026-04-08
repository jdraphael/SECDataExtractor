import type { NextApiRequest, NextApiResponse } from "next";

import { getDashboardAnalysis } from "@/lib/server/analysis";

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

  response.status(200).json(analysis);
}
