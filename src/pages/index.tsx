import Head from "next/head";

import { AnalysisDashboard } from "@/components/analysis-dashboard";
import { getDashboardAnalysis } from "@/lib/server/analysis";
import type { DashboardAnalysis } from "@/lib/types";

type PageProps = {
  analysis: DashboardAnalysis;
};

export default function Home({ analysis }: PageProps) {
  return (
    <>
      <Head>
        <title>SEC Financial Comparison Dashboard</title>
        <meta
          name="description"
          content="MBA515 dashboard for SEC-based financial comparison, visualization, and Excel export."
        />
      </Head>
      <AnalysisDashboard analysis={analysis} />
    </>
  );
}

export async function getServerSideProps({
  query,
}: {
  query: Record<string, string | string[] | undefined>;
}) {
  const yearParam = Array.isArray(query.year) ? query.year[0] : query.year;
  const parsedYear = yearParam ? Number.parseInt(yearParam, 10) : undefined;
  const analysis = await getDashboardAnalysis(
    Number.isNaN(parsedYear) ? undefined : parsedYear,
  );

  return {
    props: {
      analysis,
    },
  };
}
