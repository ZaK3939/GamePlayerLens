import {z} from "zod";
import {
  type EvaluationHeading,
  sectionLines,
  tableRows,
} from "./evaluation-markdown-structure.js";

export const EVALUATION_DOMAINS = [
  "gameplay",
  "storefront",
  "ui",
  "price",
  "localization",
  "competition",
] as const;

export type EvaluationDomain = (typeof EVALUATION_DOMAINS)[number];

export const EVALUATION_COVERAGE_DIMENSIONS = Object.freeze({
  gameplay: Object.freeze([
    "player-facing core loop",
    "progression and reward",
    "failure and retry",
    "player response",
  ]),
  storefront: Object.freeze([
    "copy and metadata",
    "visual promise",
    "expectation match",
    "competitor context",
  ]),
  ui: Object.freeze([
    "target task state",
    "matched cohort",
    "provenance",
    "interaction flow",
    "localization and accessibility state",
  ]),
  price: Object.freeze([
    "current regional price",
    "price history",
    "player price response",
    "competitor price context",
  ]),
  localization: Object.freeze([
    "localized storefront",
    "target-language player response",
    "in-game rendering",
    "semantic quality",
  ]),
  competition: Object.freeze([
    "candidate discovery",
    "candidate validation",
    "current market signal",
    "historical context",
  ]),
} as const satisfies Record<EvaluationDomain, readonly string[]>);

type CoverageStatus = "observed" | "reported-zero" | "estimated" | "missing" | "N/A";

const COVERAGE_STATUSES = new Set<CoverageStatus>([
  "observed",
  "reported-zero",
  "estimated",
  "missing",
  "N/A",
]);
const COVERAGE_HEADERS = [
  "Domain",
  "Dimension",
  "Status",
  "Evidence IDs",
  "Limitation / mismatch",
  "Decision impact",
] as const;
const COVERAGE_SUMMARY_HEADERS = [
  "Scope",
  "Applicable dimensions",
  "Observed",
  "Reported-zero",
  "Estimated",
  "Missing",
  "Coverage rate",
  "Direct observation rate",
] as const;
const EVIDENCE_INDEX_HEADERS = [
  "Evidence ID",
  "artifact repository-relative path",
  "observedAt",
  "source",
  "Data status / warning",
] as const;

export function selectedDomains(lines: readonly string[]): EvaluationDomain[] {
  const firstSection = lines.findIndex((line) => /^ {0,3}##[ \t]+/.test(line));
  const metadataLines = lines.slice(0, firstSection === -1 ? lines.length : firstSection);
  const matches = metadataLines.flatMap((line) => {
    const match = /^\s*-[ \t]+Selected Domains:[ \t]*(\S.*)$/i.exec(line);
    return match?.[1] ? [match[1]] : [];
  });
  if (matches.length !== 1) {
    throw new Error(
      "evaluation Markdown is not canonical: exactly one Selected Domains metadata line is required",
    );
  }
  const values = matches[0]!.split(",").map((value) => value.trim().toLowerCase());
  if (values.length === 0 || values.some((value) => value.length === 0)) {
    throw new Error("evaluation Markdown is not canonical: Selected Domains is empty");
  }
  const domains: EvaluationDomain[] = [];
  for (const value of values) {
    if (!(value in EVALUATION_COVERAGE_DIMENSIONS)) {
      throw new Error(`evaluation Markdown is not canonical: unknown Selected Domain "${value}"`);
    }
    const domain = value as EvaluationDomain;
    if (domains.includes(domain)) {
      throw new Error(`evaluation Markdown is not canonical: duplicate Selected Domain "${domain}"`);
    }
    domains.push(domain);
  }
  return domains;
}


function cleanCodeCell(value: string): string {
  return /^`[^`]+`$/.test(value) ? value.slice(1, -1) : value;
}

function assertRepositoryRelativePath(value: string): void {
  const path = cleanCodeCell(value);
  if (
    path.startsWith("/")
    || path.startsWith("~")
    || path.includes("\\")
    || path.split("/").includes("..")
    || /^[a-z][a-z0-9+.-]*:/i.test(path)
    || !/^[\p{L}\p{N}._-]+(?:\/[\p{L}\p{N}._-]+)+$/u.test(path)
  ) {
    throw new Error(
      `evaluation Markdown is not canonical: Evidence Index path must be repository-relative: ${value}`,
    );
  }
}

export function validateEvidenceIndex(
  lines: string[],
  headings: EvaluationHeading[],
): Set<string> {
  const rows = tableRows(
    sectionLines(lines, headings, "Evidence Index", 2),
    EVIDENCE_INDEX_HEADERS,
    "Evidence Index",
  );
  if (rows.length === 0) {
    throw new Error("evaluation Markdown is not canonical: Evidence Index must contain evidence");
  }
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const [id, path, observedAt, source, status] = row;
    if (!id || !/^E-\d{3}$/.test(id) || ids.has(id)) {
      throw new Error(
        `evaluation Markdown is not canonical: Evidence Index row ${index + 1} has an invalid or duplicate Evidence ID`,
      );
    }
    assertRepositoryRelativePath(path!);
    if (!z.iso.datetime({offset: true}).safeParse(observedAt).success) {
      throw new Error(
        `evaluation Markdown is not canonical: Evidence Index ${id} observedAt must be ISO 8601 with an offset`,
      );
    }
    if (!source || !status || !/(?:^|[; ,])(observed|reported-zero|estimated|missing|N\/A)(?:$|[; ,])/u.test(status)) {
      throw new Error(
        `evaluation Markdown is not canonical: Evidence Index ${id} requires source and a canonical data status`,
      );
    }
    ids.add(id);
  }
  return ids;
}

interface CoverageCounts {
  applicable: number;
  observed: number;
  reportedZero: number;
  estimated: number;
  missing: number;
}

function percentage(numerator: number, denominator: number): string {
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function parseNonNegativeInteger(value: string, label: string): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`evaluation Markdown is not canonical: ${label} must be an integer`);
  }
  return Number(value);
}

export function validateCoverage(
  lines: string[],
  headings: EvaluationHeading[],
  domains: readonly EvaluationDomain[],
  evidenceIds: ReadonlySet<string>,
): void {
  const coverageLines = sectionLines(lines, headings, "Data Coverage Matrix", 2);
  const rows = tableRows(coverageLines, COVERAGE_HEADERS, "Data Coverage Matrix");
  const counts = new Map<EvaluationDomain, CoverageCounts>();
  const seen = new Set<string>();
  for (const domain of domains) {
    counts.set(domain, {applicable: 0, observed: 0, reportedZero: 0, estimated: 0, missing: 0});
  }
  for (const [index, row] of rows.entries()) {
    const [rawDomain, dimension, rawStatus, evidence] = row;
    const domain = rawDomain?.toLowerCase() as EvaluationDomain;
    if (!domains.includes(domain)) {
      throw new Error(
        `evaluation Markdown is not canonical: coverage row ${index + 1} uses a non-selected domain`,
      );
    }
    const expectedDimensions = EVALUATION_COVERAGE_DIMENSIONS[domain];
    if (!dimension || !(expectedDimensions as readonly string[]).includes(dimension)) {
      throw new Error(
        `evaluation Markdown is not canonical: coverage dimension for ${domain} must use the fixed rubric dimensions`,
      );
    }
    const key = `${domain}:${dimension}`;
    if (seen.has(key)) {
      throw new Error(`evaluation Markdown is not canonical: duplicate coverage dimension ${key}`);
    }
    seen.add(key);
    const status = rawStatus as CoverageStatus;
    if (!COVERAGE_STATUSES.has(status)) {
      throw new Error(
        `evaluation Markdown is not canonical: coverage status for ${key} is invalid`,
      );
    }
    const domainCounts = counts.get(domain)!;
    if (status !== "N/A") domainCounts.applicable += 1;
    if (status === "observed") domainCounts.observed += 1;
    if (status === "reported-zero") domainCounts.reportedZero += 1;
    if (status === "estimated") domainCounts.estimated += 1;
    if (status === "missing") domainCounts.missing += 1;
    if (status === "observed" || status === "reported-zero" || status === "estimated") {
      const rowEvidenceIds = evidence?.match(/E-\d{3}/g) ?? [];
      if (rowEvidenceIds.length === 0 || rowEvidenceIds.some((id) => !evidenceIds.has(id))) {
        throw new Error(
          `evaluation Markdown is not canonical: coverage ${key} must reference Evidence Index IDs`,
        );
      }
    }
  }
  for (const domain of domains) {
    for (const dimension of EVALUATION_COVERAGE_DIMENSIONS[domain]) {
      if (!seen.has(`${domain}:${dimension}`)) {
        throw new Error(
          `evaluation Markdown is not canonical: missing coverage dimension ${domain}:${dimension}`,
        );
      }
    }
  }

  const summaryRows = tableRows(
    coverageLines,
    COVERAGE_SUMMARY_HEADERS,
    "Coverage Summary",
  );
  const summaryByScope = new Map(summaryRows.map((row) => [row[0]!.toLowerCase(), row]));
  const expectedSummaryScopes = new Set<string>([...domains, "overall"]);
  if (
    summaryRows.length !== expectedSummaryScopes.size
    || summaryByScope.size !== summaryRows.length
    || summaryRows.some((row) => !expectedSummaryScopes.has(row[0]!.toLowerCase()))
  ) {
    throw new Error(
      "evaluation Markdown is not canonical: Coverage Summary must contain exactly one row for each selected domain and overall",
    );
  }
  const overall: CoverageCounts = {
    applicable: 0,
    observed: 0,
    reportedZero: 0,
    estimated: 0,
    missing: 0,
  };
  for (const domain of domains) {
    const value = counts.get(domain)!;
    overall.applicable += value.applicable;
    overall.observed += value.observed;
    overall.reportedZero += value.reportedZero;
    overall.estimated += value.estimated;
    overall.missing += value.missing;
    validateCoverageSummaryRow(summaryByScope.get(domain), domain, value);
  }
  validateCoverageSummaryRow(summaryByScope.get("overall"), "overall", overall);
}

function validateCoverageSummaryRow(
  row: string[] | undefined,
  scope: string,
  counts: CoverageCounts,
): void {
  if (!row) {
    throw new Error(`evaluation Markdown is not canonical: missing ${scope} Coverage Summary`);
  }
  if (counts.applicable === 0) {
    throw new Error(
      `evaluation Markdown is not canonical: ${scope} has no applicable coverage dimensions; remove it from Selected Domains or mark at least one fixed dimension applicable`,
    );
  }
  const actual = row.slice(1, 6).map((value, index) => parseNonNegativeInteger(
    value!,
    `${scope} Coverage Summary column ${index + 2}`,
  ));
  const expected = [
    counts.applicable,
    counts.observed,
    counts.reportedZero,
    counts.estimated,
    counts.missing,
  ];
  const coverage = counts.observed + counts.reportedZero + counts.estimated;
  const expectedCoverageRate = percentage(coverage, counts.applicable);
  const expectedDirectObservationRate = percentage(
    counts.observed + counts.reportedZero,
    counts.applicable,
  );
  if (
    actual.some((value, index) => value !== expected[index])
    || row[6] !== expectedCoverageRate
    || row[7] !== expectedDirectObservationRate
  ) {
    throw new Error(
      `evaluation Markdown is not canonical: ${scope} Coverage Summary does not match its fixed dimensions; expected rates ${expectedCoverageRate} and ${expectedDirectObservationRate}`,
    );
  }
}
