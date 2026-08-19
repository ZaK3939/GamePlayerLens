import {hasActualCalendarDate} from "./calendar-date.js";
import {
  canonicalToken,
  sectionLines,
  tableRows,
} from "./evaluation-markdown-structure.js";
import type {EvaluationHeading} from "./evaluation-markdown-structure.js";

export const PRICING_DECISION_TRACE_HEADERS = ["Field", "Value"] as const;
export const PRICING_DECISION_TRACE_FIELDS = [
  "primary objective",
  "other objectives",
  "base price",
  "package / edition",
  "region",
  "launch discount",
  "post-offer price",
  "value / quality signal",
  "matched competitor evidence",
  "matched player-response evidence",
  "official rules checked at",
  "success signal",
  "observation window",
  "guardrail",
  "revisit condition",
] as const;
export const PRICING_PRIMARY_OBJECTIVES = new Set([
  "net-revenue",
  "paid-reach",
  "qualified-feedback",
  "positioning",
]);
export const PRICING_PLATFORM_FEASIBILITY = new Set([
  "rule-valid",
  "rule-invalid",
  "not-steam",
  "unresolved",
]);

const EVIDENCE_FIELDS = new Set([
  "matched competitor evidence",
  "matched player-response evidence",
]);

function requiredBulletValue(lines: readonly string[], label: string): string {
  const prefix = `- ${label}:`;
  const matches = lines.flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith(prefix)) return [];
    return [trimmed.slice(prefix.length).trim()];
  });
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(
      `evaluation Markdown is not canonical: Pricing Decision Trace requires exactly one ${label} metadata line`,
    );
  }
  return matches[0];
}

function pricingTraceLines(findingLines: readonly string[]): string[] {
  const start = findingLines.findIndex((line) =>
    /^ {0,3}#{2,4}[ \t]+Pricing Decision Trace[ \t]*#*[ \t]*$/.test(line),
  );
  if (start === -1) {
    throw new Error(
      "evaluation Markdown is not canonical: price requires a Pricing Decision Trace",
    );
  }
  const rest = findingLines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {0,3}#{2,4}[ \t]+/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

function requireEvidenceRef(value: string, evidenceIds: ReadonlySet<string>, field: string): void {
  if (canonicalToken(value).toLowerCase() === "missing") return;
  const ids = [...value.matchAll(/E-\d{3,}/gu)].map((match) => match[0]);
  if (ids.length === 0 || ids.some((id) => !evidenceIds.has(id))) {
    throw new Error(
      `evaluation Markdown is not canonical: Pricing Decision Trace ${field} must be missing or cite Evidence Index IDs`,
    );
  }
}

export function validatePricingDecisionTrace(
  lines: string[],
  headings: EvaluationHeading[],
  evidenceIds: ReadonlySet<string>,
): void {
  const traceLines = pricingTraceLines(sectionLines(lines, headings, "Domain Findings", 2));
  const primary = canonicalToken(requiredBulletValue(traceLines, "Primary objective"));
  const feasibility = canonicalToken(requiredBulletValue(traceLines, "Platform feasibility"));
  if (!PRICING_PRIMARY_OBJECTIVES.has(primary)) {
    throw new Error(
      "evaluation Markdown is not canonical: Pricing Decision Trace Primary objective must be net-revenue, paid-reach, qualified-feedback, or positioning",
    );
  }
  if (!PRICING_PLATFORM_FEASIBILITY.has(feasibility)) {
    throw new Error(
      "evaluation Markdown is not canonical: Pricing Decision Trace Platform feasibility must be rule-valid, rule-invalid, not-steam, or unresolved",
    );
  }

  const rows = tableRows(
    traceLines,
    PRICING_DECISION_TRACE_HEADERS,
    "Pricing Decision Trace",
  );
  if (rows.length !== PRICING_DECISION_TRACE_FIELDS.length) {
    throw new Error(
      "evaluation Markdown is not canonical: Pricing Decision Trace requires the 15 Field | Value rows in canonical order",
    );
  }
  for (const [index, field] of PRICING_DECISION_TRACE_FIELDS.entries()) {
    const [actualField, value] = rows[index]!;
    if (actualField !== field) {
      throw new Error(
        `evaluation Markdown is not canonical: Pricing Decision Trace row ${index + 1} must be ${field}`,
      );
    }
    if (field === "primary objective" && canonicalToken(value) !== primary) {
      throw new Error(
        "evaluation Markdown is not canonical: Pricing Decision Trace primary objective must match the metadata line",
      );
    }
    if (field === "primary objective" && !PRICING_PRIMARY_OBJECTIVES.has(canonicalToken(value))) {
      throw new Error(
        "evaluation Markdown is not canonical: Pricing Decision Trace primary objective must be one supported token",
      );
    }
    if (EVIDENCE_FIELDS.has(field)) {
      requireEvidenceRef(value, evidenceIds, field);
    }
    if (field === "official rules checked at") {
      const official = value.toLowerCase();
      const citesSteamworks = official.includes("partner.steamgames.com");
      if (feasibility === "rule-valid" || feasibility === "rule-invalid") {
        if (!citesSteamworks || !hasActualCalendarDate(value)) {
          throw new Error(
            "evaluation Markdown is not canonical: rule-valid and rule-invalid Pricing Decision Trace official rules checked at must cite a Steamworks URL and accessedAt date",
          );
        }
      } else if (canonicalToken(value).toLowerCase() !== "n/a" && !citesSteamworks) {
        throw new Error(
          "evaluation Markdown is not canonical: Pricing Decision Trace official rules checked at must be a Steamworks URL or N/A",
        );
      }
    }
  }
}
