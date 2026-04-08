import { COMPANIES } from "@/lib/config";
import { selectBestFact, type SecFact } from "@/lib/sec-fact-selection";

describe("selectBestFact", () => {
  it("prefers exact year-end facts without frames", () => {
    const company = COMPANIES[0];
    const facts: SecFact[] = [
      {
        accn: "older",
        end: "2025-12-30",
        filed: "2026-02-24",
        form: "10-K",
        val: 100,
      },
      {
        accn: "framed",
        end: "2025-12-31",
        filed: "2026-03-01",
        form: "10-K",
        frame: "CY2025",
        val: 110,
      },
      {
        accn: "best",
        end: "2025-12-31",
        filed: "2026-02-24",
        form: "10-K",
        val: 120,
      },
    ];

    const selected = selectBestFact(company, facts, 2025, "instant");
    expect(selected?.accn).toBe("best");
  });

  it("filters flow facts to annual durations", () => {
    const company = COMPANIES[0];
    const facts: SecFact[] = [
      {
        accn: "quarter",
        start: "2025-10-01",
        end: "2025-12-31",
        filed: "2026-02-24",
        form: "10-K",
        val: 10,
      },
      {
        accn: "annual",
        start: "2025-01-01",
        end: "2025-12-31",
        filed: "2026-02-24",
        form: "10-K",
        val: 99,
      },
    ];

    const selected = selectBestFact(company, facts, 2025, "flow");
    expect(selected?.accn).toBe("annual");
  });
});
