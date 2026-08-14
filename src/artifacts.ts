import {randomUUID} from "node:crypto";
import {constants, type Dirent, type Stats} from "node:fs";
import {
  link as nodeLink,
  lstat as nodeLstat,
  mkdir as nodeMkdir,
  open as nodeOpen,
  readdir as nodeReaddir,
  rename as nodeRename,
  type FileHandle,
  unlink as nodeUnlink,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import {basename, dirname, join} from "node:path";
import {z} from "zod";
import type {JsonValue} from "./http.js";
import type {
  PathResolver,
  ResolvedEvaluationPath,
  ResolvedIntelArtifactPath,
} from "./paths.js";

export const MAX_INTEL_PAYLOAD_BYTES = 1024 * 1024;
export const MAX_EVALUATION_BYTES = 512 * 1024;

export const REQUIRED_EVALUATION_SECTIONS = [
  "Decision Card",
  "Detailed Scope",
  "Indie Survival Strategy",
  "Overall Assessment",
  "Who Plays and Why — Flow Analysis",
  "Flow Summary",
  "Domain Findings",
  "Data Semantics",
  "Data Coverage Matrix",
  "Evidence Index",
  "Final Recommendation",
] as const;

export const REQUIRED_INDIE_STRATEGY_SECTIONS = [
  "Indie Strategy Card",
  "Core Experience Map",
  "Concept Origin Route",
  "Reward Mechanism Trace",
  "Moment-to-Moment Experience Loop",
  "Mechanism Transfer Map",
  "Core Legibility Gate",
  "Core Revision Ledger",
  "First-contact Asset Readiness",
  "Concept Test Trace",
  "Promise-Delivery Trace",
  "Delivered Experience Playtest Trace",
  "Playtest Cohort Summary",
  "Funnel Health",
  "Milestone Readiness",
  "Capability Reinvestment Gate",
  "Repair Backlog",
  "Experiment Queue",
  "Survival Scenarios",
] as const;

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
const EXPERIMENT_HEADERS = [
  "Priority",
  "Hypothesis",
  "Stage",
  "Primary metric",
  "Source",
  "Guardrail",
  "Smallest build / asset",
  "Experiment ID",
] as const;
const REPAIR_HEADERS = [
  "Priority",
  "Blocking failure",
  "Evidence ID",
  "Owner surface",
  "Success gate",
  "Must not change",
] as const;
const CAPABILITY_REINVESTMENT_HEADERS = [
  "Decision",
  "Bottleneck",
  "Evidence ID",
  "Capacity / runway boundary",
  "Reversible next step",
  "Expansion trigger",
] as const;
const CAPABILITY_REINVESTMENT_DECISIONS = new Set([
  "learn",
  "simplify",
  "outsource",
  "hire",
  "defer",
  "not-applicable",
]);
const SURVIVAL_HEADERS = [
  "Scenario",
  "Revenue assumptions",
  "Cost / fee / refund / tax assumptions",
  "Runway impact",
  "Decision",
] as const;
const COMPETITOR_SELECTION_HEADERS = [
  "Appid",
  "Game",
  "Fit role",
  "Market role",
  "Release stage",
  "Released at",
  "Freshness",
  "Core-loop / purchase-reason evidence",
  "Review signal",
  "Scale / momentum signal",
  "Evidence IDs",
  "Decision",
] as const;
const COMPETITOR_FIT_ROLES = new Set([
  "direct-competitor",
  "adjacent-competitor",
  "system-reference",
  "visual-reference",
  "rejected-candidate",
]);
const COMPETITOR_MARKET_ROLES = new Set([
  "recent-success",
  "breakout-anchor",
  "comparison-control",
  "unproven",
  "not-assessed",
]);
const COMPETITOR_RELEASE_STAGES = new Set([
  "demo",
  "early-access",
  "released",
  "upcoming",
  "unknown",
]);
const COMPETITOR_FRESHNESS = new Set([
  "current-window",
  "historical",
  "upcoming",
  "unknown",
]);
const COMPETITOR_CANDIDATE_ROUTES = new Set([
  "known-name",
  "steam-discover",
  "steam-sonar",
  "store-copy",
  "review-mention",
]);

export type EvaluationIndieStrategyMode = "detailed" | "not-applicable";
export interface CanonicalEvaluationMetadata {
  indieStrategyMode: EvaluationIndieStrategyMode;
  selectedDomains: EvaluationDomain[];
}

interface EvaluationHeading {
  level: 2 | 3;
  title: string;
  line: number;
}

function evaluationHeadings(lines: string[]): EvaluationHeading[] {
  const headings: EvaluationHeading[] = [];
  let fence: "`" | "~" | undefined;
  for (const [line, value] of lines.entries()) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(value);
    if (fenceMatch) {
      const marker = fenceMatch[1]?.[0] as "`" | "~";
      if (!fence) fence = marker;
      else if (fence === marker) fence = undefined;
      continue;
    }
    if (fence) continue;
    const match = /^ {0,3}(#{2,3})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(value);
    if (!match) continue;
    headings.push({
      level: match[1]?.length as 2 | 3,
      title: match[2] ?? "",
      line,
    });
  }
  return headings;
}

function evaluationSectionBody(
  lines: string[],
  headings: EvaluationHeading[],
  heading: EvaluationHeading,
): string {
  const next = headings.find(
    (candidate) => candidate.line > heading.line && candidate.level <= heading.level,
  );
  return lines
    .slice(heading.line + 1, next?.line ?? lines.length)
    .filter((line) => !/^ {0,3}#{1,6}[ \t]+/.test(line))
    .join("\n")
    .trim();
}

function markdownTableCells(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined;
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function sameCells(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && actual.every((cell, index) => cell === expected[index]);
}

function tableRows(
  sectionLines: readonly string[],
  headers: readonly string[],
  label: string,
): string[][] {
  const matchingHeaders = sectionLines.flatMap((line, index) => {
    const cells = markdownTableCells(line);
    return cells && sameCells(cells, headers) ? [index] : [];
  });
  if (matchingHeaders.length !== 1) {
    throw new Error(
      `evaluation Markdown is not canonical: ${label} requires exactly one canonical table header`,
    );
  }
  const headerIndex = matchingHeaders[0]!;
  const separator = markdownTableCells(sectionLines[headerIndex + 1] ?? "");
  if (
    !separator
    || separator.length !== headers.length
    || separator.some((cell) => !/^:?-{3,}:?$/.test(cell))
  ) {
    throw new Error(
      `evaluation Markdown is not canonical: ${label} table separator is invalid`,
    );
  }
  const rows: string[][] = [];
  for (let index = headerIndex + 2; index < sectionLines.length; index += 1) {
    const cells = markdownTableCells(sectionLines[index] ?? "");
    if (!cells) break;
    if (cells.length !== headers.length || cells.some((cell) => cell.length === 0)) {
      throw new Error(
        `evaluation Markdown is not canonical: ${label} table row has invalid cells`,
      );
    }
    rows.push(cells);
  }
  return rows;
}

function sectionLines(
  lines: string[],
  headings: EvaluationHeading[],
  title: string,
  level: 2 | 3,
): string[] {
  const heading = headings.find(
    (candidate) => candidate.level === level && candidate.title === title,
  );
  if (!heading) {
    throw new Error(`evaluation Markdown is not canonical: missing section ${title}`);
  }
  const next = headings.find(
    (candidate) => candidate.line > heading.line && candidate.level <= heading.level,
  );
  return lines.slice(heading.line + 1, next?.line ?? lines.length);
}

function selectedDomains(lines: readonly string[]): EvaluationDomain[] {
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

function requiredBulletValue(
  lines: readonly string[],
  label: string,
): string {
  const prefix = `- ${label}:`;
  const matches = lines.flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith(prefix)) return [];
    return [trimmed.slice(prefix.length).trim()];
  });
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(
      `evaluation Markdown is not canonical: competition requires exactly one ${label} metadata line`,
    );
  }
  return matches[0];
}

function dateMonthsBefore(date: string, months: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const day = parsed.getUTCDate();
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  parsed.setUTCDate(Math.min(day, lastDay));
  return parsed.toISOString().slice(0, 10);
}

function validateCompetitorSelectionLedger(
  lines: string[],
  headings: EvaluationHeading[],
  evidenceIds: ReadonlySet<string>,
): void {
  const findingLines = sectionLines(lines, headings, "Domain Findings", 2);
  const freshnessWindow = requiredBulletValue(
    findingLines,
    "Competitor freshness window",
  );
  const freshnessMatch = /^(\d{1,2}) months from (\d{4}-\d{2}-\d{2})$/.exec(
    freshnessWindow,
  );
  const freshnessMonths = Number(freshnessMatch?.[1]);
  const referenceDate = freshnessMatch?.[2];
  if (
    !freshnessMatch
    || freshnessMonths < 1
    || freshnessMonths > 60
    || !referenceDate
    || !isActualDate(referenceDate)
  ) {
    throw new Error(
      "evaluation Markdown is not canonical: Competitor freshness window must be 1-60 months from an actual YYYY-MM-DD date",
    );
  }
  const currentWindowStart = dateMonthsBefore(referenceDate, freshnessMonths);

  const matchAxes = requiredBulletValue(
    findingLines,
    "Competitor must-match axes",
  ).split(";").map((value) => value.trim()).filter(Boolean);
  if (matchAxes.length < 3 || new Set(matchAxes).size !== matchAxes.length) {
    throw new Error(
      "evaluation Markdown is not canonical: Competitor must-match axes requires at least three unique semicolon-separated axes",
    );
  }

  const candidateRoutes = requiredBulletValue(
    findingLines,
    "Competitor candidate routes",
  ).split(";").map((value) => value.trim()).filter(Boolean);
  if (
    candidateRoutes.length < 2
    || new Set(candidateRoutes).size !== candidateRoutes.length
    || candidateRoutes.some((route) => !COMPETITOR_CANDIDATE_ROUTES.has(route))
  ) {
    throw new Error(
      "evaluation Markdown is not canonical: Competitor candidate routes requires at least two unique routes from known-name, steam-discover, steam-sonar, store-copy, or review-mention",
    );
  }

  const rows = tableRows(
    findingLines,
    COMPETITOR_SELECTION_HEADERS,
    "Competitor Selection Ledger",
  );
  if (rows.length < 3 || rows.length > 8) {
    throw new Error(
      "evaluation Markdown is not canonical: Competitor Selection Ledger requires 3-8 candidates",
    );
  }
  const appids = new Set<string>();
  let hasIncludedFit = false;
  let hasIncludedSuccess = false;
  let hasControlOrRejection = false;
  for (const [index, row] of rows.entries()) {
    const [
      appid,
      ,
      fitRole,
      marketRole,
      releaseStage,
      releasedAt,
      freshness,
      ,
      reviewSignal,
      scaleSignal,
      evidence,
      decision,
    ] = row;
    if (!appid || !/^[1-9]\d{0,9}$/.test(appid) || appids.has(appid)) {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} has an invalid or duplicate appid`,
      );
    }
    appids.add(appid);
    if (!fitRole || !COMPETITOR_FIT_ROLES.has(fitRole)) {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} has an invalid Fit role`,
      );
    }
    if (!marketRole || !COMPETITOR_MARKET_ROLES.has(marketRole)) {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} has an invalid Market role`,
      );
    }
    if (!releaseStage || !COMPETITOR_RELEASE_STAGES.has(releaseStage)) {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} has an invalid Release stage`,
      );
    }
    if (!freshness || !COMPETITOR_FRESHNESS.has(freshness)) {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} has an invalid Freshness`,
      );
    }
    const releasedIsDate = Boolean(releasedAt && isActualDate(releasedAt));
    if (!releasedIsDate && releasedAt !== "upcoming" && releasedAt !== "unknown") {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} has an invalid Released at value`,
      );
    }
    if (
      freshness === "current-window"
      && (!releasedIsDate || releasedAt! < currentWindowStart || releasedAt! > referenceDate)
    ) {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} is outside the declared current-window freshness range`,
      );
    }
    if (
      freshness === "historical"
      && (!releasedIsDate || releasedAt! >= currentWindowStart)
    ) {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} is not historical under the declared freshness window`,
      );
    }
    if (
      freshness === "upcoming"
      && (
        releaseStage !== "upcoming"
        || (releasedAt !== "upcoming" && (!releasedIsDate || releasedAt! <= referenceDate))
      )
    ) {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} has inconsistent upcoming release data`,
      );
    }
    if (freshness === "unknown" && releasedAt !== "unknown") {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} must keep unknown release freshness explicit`,
      );
    }
    if (releaseStage === "upcoming" && freshness !== "upcoming") {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} must classify an upcoming release as upcoming`,
      );
    }
    if (releaseStage === "unknown" && freshness !== "unknown") {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} must classify an unknown release as unknown`,
      );
    }
    if (decision !== "include" && decision !== "exclude") {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} Decision must be include or exclude`,
      );
    }
    if ((fitRole === "rejected-candidate") !== (decision === "exclude")) {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} must pair rejected-candidate with exclude and every other Fit role with include`,
      );
    }
    const rowEvidenceIds = evidence?.match(/E-\d{3}/g) ?? [];
    if (
      rowEvidenceIds.length === 0
      || rowEvidenceIds.some((id) => !evidenceIds.has(id))
    ) {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger row ${index + 1} must reference Evidence Index IDs`,
      );
    }
    const successRole = marketRole === "recent-success" || marketRole === "breakout-anchor";
    const missingSignal = (value: string | undefined) => (
      !value || /^(?:missing|unknown|N\/A)$/i.test(value)
    );
    if (successRole && (missingSignal(reviewSignal) || missingSignal(scaleSignal))) {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger success row ${index + 1} requires both Review signal and Scale / momentum signal`,
      );
    }
    if (
      successRole
      && (releaseStage === "upcoming" || releaseStage === "unknown"
        || freshness === "upcoming" || freshness === "unknown")
    ) {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger ${marketRole} row ${index + 1} requires released market evidence`,
      );
    }
    if (marketRole === "recent-success" && freshness !== "current-window") {
      throw new Error(
        `evaluation Markdown is not canonical: Competitor Selection Ledger recent-success row ${index + 1} must be current-window`,
      );
    }
    if (
      decision === "include"
      && (fitRole === "direct-competitor" || fitRole === "adjacent-competitor")
    ) {
      hasIncludedFit = true;
    }
    if (decision === "include" && successRole) hasIncludedSuccess = true;
    if (marketRole === "comparison-control" || fitRole === "rejected-candidate") {
      hasControlOrRejection = true;
    }
  }
  if (!hasIncludedFit) {
    throw new Error(
      "evaluation Markdown is not canonical: Competitor Selection Ledger requires an included direct-competitor or adjacent-competitor",
    );
  }
  if (!hasIncludedSuccess) {
    throw new Error(
      "evaluation Markdown is not canonical: Competitor Selection Ledger requires an included recent-success or breakout-anchor",
    );
  }
  if (!hasControlOrRejection) {
    throw new Error(
      "evaluation Markdown is not canonical: Competitor Selection Ledger requires a comparison-control or rejected-candidate",
    );
  }
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

function validateEvidenceIndex(
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

function validateCoverage(
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

function validateDetailedIndieTables(
  lines: string[],
  headings: EvaluationHeading[],
  evidenceIds: ReadonlySet<string>,
): void {
  const capabilityRows = tableRows(
    sectionLines(lines, headings, "Capability Reinvestment Gate", 3),
    CAPABILITY_REINVESTMENT_HEADERS,
    "Capability Reinvestment Gate",
  );
  if (
    capabilityRows.length !== 1
    || !CAPABILITY_REINVESTMENT_DECISIONS.has(capabilityRows[0]![0]!)
    || !evidenceIds.has(capabilityRows[0]![2]!)
  ) {
    throw new Error(
      "evaluation Markdown is not canonical: Capability Reinvestment Gate requires one supported decision grounded in an Evidence Index ID",
    );
  }
  const repairRows = tableRows(
    sectionLines(lines, headings, "Repair Backlog", 3),
    REPAIR_HEADERS,
    "Repair Backlog",
  );
  for (const [index, row] of repairRows.entries()) {
    if (row[0] !== String(index + 1) || !evidenceIds.has(row[2]!)) {
      throw new Error(
        "evaluation Markdown is not canonical: Repair Backlog priorities must be contiguous and reference Evidence Index IDs",
      );
    }
  }
  const experimentRows = tableRows(
    sectionLines(lines, headings, "Experiment Queue", 3),
    EXPERIMENT_HEADERS,
    "Experiment Queue",
  );
  if (experimentRows.length > 3) {
    throw new Error("evaluation Markdown is not canonical: Experiment Queue allows at most three experiments");
  }
  const experimentIds = new Set<string>();
  for (const [index, row] of experimentRows.entries()) {
    const experimentId = row[7]!;
    if (
      row[0] !== String(index + 1)
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(experimentId)
      || experimentIds.has(experimentId)
    ) {
      throw new Error(
        "evaluation Markdown is not canonical: Experiment Queue priorities and IDs must be unique and canonical",
      );
    }
    experimentIds.add(experimentId);
  }
  const survivalRows = tableRows(
    sectionLines(lines, headings, "Survival Scenarios", 3),
    SURVIVAL_HEADERS,
    "Survival Scenarios",
  );
  const scenarios = survivalRows.map((row) => row[0]);
  if (!sameCells(scenarios, ["conservative", "base", "upside"])) {
    throw new Error(
      "evaluation Markdown is not canonical: Survival Scenarios must contain conservative, base, and upside rows",
    );
  }
}

function requireOrderedSections(
  lines: string[],
  headings: EvaluationHeading[],
  required: readonly string[],
  level: 2 | 3,
): void {
  let previousLine = -1;
  for (const title of required) {
    const matches = headings.filter(
      (heading) => heading.level === level && heading.title === title,
    );
    const label = `${"#".repeat(level)} ${title}`;
    if (matches.length === 0) {
      throw new Error(`evaluation Markdown is not canonical: missing section "${label}"`);
    }
    if (matches.length > 1) {
      throw new Error(`evaluation Markdown is not canonical: duplicate section "${label}"`);
    }
    const heading = matches[0];
    if (!heading || heading.line <= previousLine) {
      throw new Error(`evaluation Markdown is not canonical: section out of order "${label}"`);
    }
    if (!evaluationSectionBody(lines, headings, heading)) {
      throw new Error(`evaluation Markdown is not canonical: empty section "${label}"`);
    }
    previousLine = heading.line;
  }
}

export function assertCanonicalEvaluationMarkdown(
  content: string,
): CanonicalEvaluationMetadata {
  if (/[［］]/u.test(content)) {
    throw new Error("evaluation Markdown contains an unfilled template placeholder");
  }
  const lines = content.split(/\r?\n/);
  const headings = evaluationHeadings(lines);
  requireOrderedSections(lines, headings, REQUIRED_EVALUATION_SECTIONS, 2);
  const domains = selectedDomains(lines);
  const evidenceIds = validateEvidenceIndex(lines, headings);
  validateCoverage(lines, headings, domains, evidenceIds);
  if (domains.includes("competition")) {
    validateCompetitorSelectionLedger(lines, headings, evidenceIds);
  }

  const indieHeading = headings.find(
    (heading) => heading.level === 2 && heading.title === "Indie Survival Strategy",
  );
  if (!indieHeading) {
    throw new Error("evaluation Markdown is not canonical: missing Indie Survival Strategy");
  }
  const nextTopLevelLine = headings.find(
    (heading) => heading.level === 2 && heading.line > indieHeading.line,
  )?.line ?? lines.length;
  const indieLines = lines.slice(indieHeading.line + 1, nextTopLevelLine);
  const indieHeadings = headings.filter(
    (heading) => heading.line > indieHeading.line && heading.line < nextTopLevelLine,
  );
  if (indieHeadings.length === 0) {
    if (indieLines.some((line) => /^適用外:[ \t]*\S/u.test(line.trim()))) {
      return {indieStrategyMode: "not-applicable", selectedDomains: [...domains]};
    }
    throw new Error(
      "evaluation Markdown is not canonical: Indie Survival Strategy requires detailed sections or an applicable N/A reason",
    );
  }
  requireOrderedSections(
    lines,
    indieHeadings,
    REQUIRED_INDIE_STRATEGY_SECTIONS,
    3,
  );
  validateDetailedIndieTables(lines, indieHeadings, evidenceIds);
  return {indieStrategyMode: "detailed", selectedDomains: [...domains]};
}

export const ArtifactKindSchema = z.enum(["intel", "evaluation"]);
export const ImageArtifactKindSchema = z.enum(["capture", "ui-reference"]);
export const RunArtifactKindSchema = z.literal("run");
export const AnyArtifactKindSchema = z.union([
  ArtifactKindSchema,
  ImageArtifactKindSchema,
  RunArtifactKindSchema,
]);
export const SourceToolSchema = z.enum([
  "steam_search",
  "steam_brief",
  "steam_discover",
  "steam_fetch",
  "steam_reviews",
  "steam_timeline",
  "steam_updates",
  "derive_personas",
  "ui_capture",
  "manual",
]);

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type ImageArtifactKind = z.infer<typeof ImageArtifactKindSchema>;
export type RunArtifactKind = z.infer<typeof RunArtifactKindSchema>;
export type AnyArtifactKind = z.infer<typeof AnyArtifactKindSchema>;
export type SourceTool = z.infer<typeof SourceToolSchema>;

const CanonicalIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{Nd}]+(?:-[\p{L}\p{Nd}]+)*$/u);

function isActualDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000-")) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

const CalendarDateSchema = z.string().refine(isActualDate, "invalid calendar date");
const IsoDateTimeSchema = z.iso.datetime({offset: true}).refine(
  (value) => isActualDate(value.slice(0, 10)),
  "invalid ISO date-time",
);

function isJsonSafe(value: unknown, ancestors = new WeakSet<object>()): value is JsonValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) return false;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const ownNames = Object.getOwnPropertyNames(value);
      if (
        ownNames.length !== value.length + 1
        || ownNames.some((key) => key !== "length" && !/^(0|[1-9]\d*)$/.test(key))
      ) {
        return false;
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          !descriptor
          || !descriptor.enumerable
          || !("value" in descriptor)
          || !isJsonSafe(descriptor.value, ancestors)
        ) {
          return false;
        }
      }
      return true;
    }
    return Object.getOwnPropertyNames(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return Boolean(
        descriptor
        && descriptor.enumerable
        && "value" in descriptor
        && isJsonSafe(descriptor.value, ancestors),
      );
    });
  } finally {
    ancestors.delete(value);
  }
}

const JsonSafeInputSchema = z.custom<JsonValue>(isJsonSafe, {
  message: "payload must be JSON-safe",
});

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number().finite(),
  z.string(),
  z.array(JsonValueSchema),
  z.record(z.string(), JsonValueSchema),
]));

export const SaveIntelInputSchema = z.object({
  target: z.string().min(1),
  id: z.string().min(1),
  sourceTool: SourceToolSchema,
  observedAt: IsoDateTimeSchema.optional(),
  payload: JsonSafeInputSchema,
}).strict();

export const SaveEvaluationInputSchema = z.object({
  target: z.string().min(1),
  topic: z.string().min(1),
  date: CalendarDateSchema.optional(),
  content: z.string().min(1),
}).strict();

export const IntelRecordSchema = z.object({
  schemaVersion: z.literal(1),
  targetId: CanonicalIdSchema,
  artifactId: CanonicalIdSchema,
  sourceTool: SourceToolSchema,
  observedAt: IsoDateTimeSchema,
  savedAt: IsoDateTimeSchema,
  payload: JsonValueSchema,
}).strict();

export const IntelArtifactMetadataSchema = z.object({
  path: z.string().min(1),
  targetId: CanonicalIdSchema,
  id: CanonicalIdSchema,
  artifactId: CanonicalIdSchema,
  sourceTool: SourceToolSchema,
  observedAt: IsoDateTimeSchema,
  savedAt: IsoDateTimeSchema,
  sizeBytes: z.number().int().nonnegative(),
}).strict();

export const EvaluationArtifactMetadataSchema = z.object({
  path: z.string().min(1),
  targetId: CanonicalIdSchema,
  id: z.string().min(12).max(75),
  date: CalendarDateSchema,
  topicId: CanonicalIdSchema,
  savedAt: IsoDateTimeSchema,
  sizeBytes: z.number().int().nonnegative(),
}).strict();

export const ArtifactMetadataSchema = z.union([
  IntelArtifactMetadataSchema,
  EvaluationArtifactMetadataSchema,
]);

export type SaveIntelInput = z.infer<typeof SaveIntelInputSchema>;
export type SaveEvaluationInput = z.infer<typeof SaveEvaluationInputSchema>;
export type IntelRecord = z.infer<typeof IntelRecordSchema>;
export type IntelArtifactMetadata = z.infer<typeof IntelArtifactMetadataSchema>;
export type EvaluationArtifactMetadata = z.infer<typeof EvaluationArtifactMetadataSchema>;
export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;

export interface EvaluationArtifact {
  metadata: EvaluationArtifactMetadata;
  content: string;
}

export interface ArtifactFileOps {
  mkdir(path: string, options: {recursive: true}): Promise<string | undefined>;
  writeFile(
    path: string,
    data: string,
    options: {encoding: "utf8"; flag: "wx"},
  ): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  open(path: string, flags: number): Promise<ArtifactFileHandle>;
  readdir(path: string, options: {withFileTypes: true}): Promise<Dirent[]>;
  lstat(path: string): Promise<Stats>;
}

interface ArtifactFileHandle {
  stat(): Promise<Stats>;
  readFile(options: {encoding: "utf8"}): Promise<string>;
  close(): Promise<void>;
}

const nodeFileOps: ArtifactFileOps = {
  mkdir: (path, options) => nodeMkdir(path, options),
  writeFile: (path, data, options) => nodeWriteFile(path, data, options),
  link: nodeLink,
  rename: nodeRename,
  unlink: nodeUnlink,
  open: (path, flags) => nodeOpen(path, flags) as Promise<FileHandle>,
  readdir: (path, options) => nodeReaddir(path, options),
  lstat: nodeLstat,
};

export interface ArtifactStoreDependencies {
  clock?: () => Date;
  fileOps?: Partial<ArtifactFileOps>;
}

export type OverwriteOption = boolean | {overwrite?: boolean};

export interface ArtifactStore {
  saveIntel(
    input: SaveIntelInput,
    overwrite?: OverwriteOption,
  ): Promise<IntelArtifactMetadata>;
  saveEvaluation(
    input: SaveEvaluationInput,
    overwrite?: OverwriteOption,
  ): Promise<EvaluationArtifactMetadata>;
  listTargets(kind: ArtifactKind): Promise<string[]>;
  listArtifacts(kind: "intel", target: string): Promise<IntelArtifactMetadata[]>;
  listArtifacts(
    kind: "evaluation",
    target: string,
  ): Promise<EvaluationArtifactMetadata[]>;
  listArtifacts(kind: ArtifactKind, target: string): Promise<ArtifactMetadata[]>;
  readIntel(target: string, id: string): Promise<IntelRecord>;
  readEvaluation(target: string, id: string): Promise<EvaluationArtifact>;
}

export class ArtifactSchemaError extends Error {
  override name = "ArtifactSchemaError";
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function overwriteEnabled(option: OverwriteOption | undefined): boolean {
  return option === true || (typeof option === "object" && option.overwrite === true);
}

function payloadSize(payload: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

function intelMetadata(
  record: IntelRecord,
  path: string,
  sizeBytes: number,
): IntelArtifactMetadata {
  return IntelArtifactMetadataSchema.parse({
    path,
    targetId: record.targetId,
    id: record.artifactId,
    artifactId: record.artifactId,
    sourceTool: record.sourceTool,
    observedAt: record.observedAt,
    savedAt: record.savedAt,
    sizeBytes,
  });
}

function evaluationMetadata(
  resolved: ResolvedEvaluationPath,
  date: string,
  stats: Stats,
): EvaluationArtifactMetadata {
  return EvaluationArtifactMetadataSchema.parse({
    path: resolved.relativePath,
    targetId: resolved.targetId,
    id: `${date}-${resolved.topicId}`,
    date,
    topicId: resolved.topicId,
    savedAt: stats.mtime.toISOString(),
    sizeBytes: stats.size,
  });
}

function evaluationId(id: string): {date: string; topic: string} {
  const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(id);
  if (!match || !match[1] || !match[2] || !isActualDate(match[1])) {
    throw new Error("invalid evaluation artifact id");
  }
  return {date: match[1], topic: match[2]};
}

export function createArtifactStore(
  resolver: Pick<
    PathResolver,
    "root" | "resolveIntelArtifactPath" | "resolveEvaluationPath"
  >,
  dependencies: ArtifactStoreDependencies = {},
): ArtifactStore {
  const clock = dependencies.clock ?? (() => new Date());
  const ops = {...nodeFileOps, ...dependencies.fileOps};

  function resolveProbe(kind: ArtifactKind): ResolvedIntelArtifactPath | ResolvedEvaluationPath {
    return kind === "intel"
      ? resolver.resolveIntelArtifactPath("artifact-list-probe", "artifact-list-probe")
      : resolver.resolveEvaluationPath(
        "artifact-list-probe",
        "2000-01-01",
        "artifact-list-probe",
      );
  }

  function rootDirectory(kind: ArtifactKind): string {
    return dirname(dirname(resolveProbe(kind).absolutePath));
  }

  function targetDirectory(kind: ArtifactKind, target: string): {path: string; targetId: string} {
    const resolved = kind === "intel"
      ? resolver.resolveIntelArtifactPath(target, "artifact-list-probe")
      : resolver.resolveEvaluationPath(target, "2000-01-01", "artifact-list-probe");
    return {path: dirname(resolved.absolutePath), targetId: resolved.targetId};
  }

  async function atomicWrite(
    destination: string,
    data: string,
    overwrite: boolean,
    artifactId: string,
  ): Promise<void> {
    const temporary = join(
      dirname(destination),
      `.${basename(destination)}.${randomUUID()}.tmp`,
    );
    let failed = false;

    try {
      await ops.writeFile(temporary, data, {encoding: "utf8", flag: "wx"});
      if (overwrite) {
        await ops.rename(temporary, destination);
      } else {
        try {
          await ops.link(temporary, destination);
        } catch (error) {
          if (isNodeError(error, "EEXIST")) {
            throw new Error(`artifact already exists: ${artifactId}`);
          }
          throw error;
        }
      }
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      try {
        await ops.unlink(temporary);
      } catch (error) {
        if (!isNodeError(error, "ENOENT") && !failed) throw error;
      }
    }
  }

  async function ensureIntelDestination(
    target: string,
    id: string,
  ): Promise<ResolvedIntelArtifactPath> {
    const initial = resolver.resolveIntelArtifactPath(target, id);
    await ops.mkdir(dirname(initial.absolutePath), {recursive: true});
    const verified = resolver.resolveIntelArtifactPath(target, id);
    if (verified.absolutePath !== initial.absolutePath) {
      throw new Error("artifact destination changed during creation");
    }
    return verified;
  }

  async function ensureEvaluationDestination(
    target: string,
    date: string,
    topic: string,
  ): Promise<ResolvedEvaluationPath> {
    const initial = resolver.resolveEvaluationPath(target, date, topic);
    await ops.mkdir(dirname(initial.absolutePath), {recursive: true});
    const verified = resolver.resolveEvaluationPath(target, date, topic);
    if (verified.absolutePath !== initial.absolutePath) {
      throw new Error("artifact destination changed during creation");
    }
    return verified;
  }

  async function readRegularFile(path: string): Promise<{raw: string; stats: Stats}> {
    let handle: ArtifactFileHandle;
    try {
      handle = await ops.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if (isNodeError(error, "ELOOP")) {
        throw new Error("symlink artifacts are not allowed", {cause: error});
      }
      if (isNodeError(error, "ENOENT")) {
        throw new Error("artifact does not exist", {cause: error});
      }
      throw new Error("artifact could not be opened", {cause: error});
    }
    try {
      const stats = await handle.stat();
      if (stats.isSymbolicLink()) throw new Error("symlink artifacts are not allowed");
      if (!stats.isFile()) throw new Error("artifact is not a regular file");
      const raw = await handle.readFile({encoding: "utf8"});
      const finalStats = await handle.stat();
      if (
        finalStats.dev !== stats.dev
        || finalStats.ino !== stats.ino
        || finalStats.size !== stats.size
        || finalStats.mtimeMs !== stats.mtimeMs
        || Buffer.byteLength(raw, "utf8") !== stats.size
      ) {
        throw new Error("artifact changed while reading");
      }
      return {raw, stats};
    } catch (error) {
      if (error instanceof Error && !("code" in error)) throw error;
      throw new Error("artifact could not be read", {cause: error});
    } finally {
      await handle.close();
    }
  }

  function parseIntelRecord(
    raw: string,
    expected: ResolvedIntelArtifactPath,
  ): IntelRecord {
    try {
      const parsed = IntelRecordSchema.parse(JSON.parse(raw) as unknown);
      if (
        parsed.targetId !== expected.targetId
        || parsed.artifactId !== expected.artifactId
        || payloadSize(parsed.payload) > MAX_INTEL_PAYLOAD_BYTES
      ) {
        throw new Error("record does not match its artifact path");
      }
      return parsed;
    } catch (error) {
      throw new ArtifactSchemaError(
        `invalid intel schema at ${expected.relativePath}`,
        {cause: error},
      );
    }
  }

  async function readIntelWithMetadata(
    target: string,
    id: string,
  ): Promise<{record: IntelRecord; metadata: IntelArtifactMetadata}> {
    const resolved = resolver.resolveIntelArtifactPath(target, id);
    const {raw, stats} = await readRegularFile(resolved.absolutePath);
    const record = parseIntelRecord(raw, resolved);
    return {
      record,
      metadata: intelMetadata(record, resolved.relativePath, stats.size),
    };
  }

  async function readEvaluationArtifact(target: string, id: string): Promise<EvaluationArtifact> {
    const parsedId = evaluationId(id);
    const resolved = resolver.resolveEvaluationPath(target, parsedId.date, parsedId.topic);
    const {raw, stats} = await readRegularFile(resolved.absolutePath);
    const sizeBytes = Buffer.byteLength(raw, "utf8");
    if (sizeBytes < 1 || sizeBytes > MAX_EVALUATION_BYTES || stats.size !== sizeBytes) {
      throw new ArtifactSchemaError(`invalid evaluation artifact at ${resolved.relativePath}`);
    }
    return {
      metadata: evaluationMetadata(resolved, parsedId.date, stats),
      content: raw,
    };
  }

  async function saveIntel(
    input: SaveIntelInput,
    overwrite?: OverwriteOption,
  ): Promise<IntelArtifactMetadata> {
    const parsed = SaveIntelInputSchema.parse(input);
    const serializedPayloadBytes = payloadSize(parsed.payload);
    if (serializedPayloadBytes > MAX_INTEL_PAYLOAD_BYTES) {
      throw new Error("intel serialized payload exceeds 1 MiB");
    }
    const savedAt = clock().toISOString();
    IsoDateTimeSchema.parse(savedAt);
    const observedAt = parsed.observedAt ?? savedAt;
    const resolved = await ensureIntelDestination(parsed.target, parsed.id);
    const record = IntelRecordSchema.parse({
      schemaVersion: 1,
      targetId: resolved.targetId,
      artifactId: resolved.artifactId,
      sourceTool: parsed.sourceTool,
      observedAt,
      savedAt,
      payload: parsed.payload,
    });
    const serialized = `${JSON.stringify(record, null, 2)}\n`;
    await atomicWrite(
      resolved.absolutePath,
      serialized,
      overwriteEnabled(overwrite),
      resolved.artifactId,
    );
    return intelMetadata(
      record,
      resolved.relativePath,
      Buffer.byteLength(serialized, "utf8"),
    );
  }

  async function saveEvaluation(
    input: SaveEvaluationInput,
    overwrite?: OverwriteOption,
  ): Promise<EvaluationArtifactMetadata> {
    const parsed = SaveEvaluationInputSchema.parse(input);
    const sizeBytes = Buffer.byteLength(parsed.content, "utf8");
    if (sizeBytes > MAX_EVALUATION_BYTES) {
      throw new Error("evaluation Markdown exceeds 512 KiB");
    }
    assertCanonicalEvaluationMarkdown(parsed.content);
    let date = parsed.date;
    if (!date) {
      const current = clock();
      if (Number.isNaN(current.getTime())) throw new Error("clock returned an invalid date");
      date = current.toISOString().slice(0, 10);
    }
    const resolved = await ensureEvaluationDestination(parsed.target, date, parsed.topic);
    await atomicWrite(
      resolved.absolutePath,
      parsed.content,
      overwriteEnabled(overwrite),
      `${date}-${resolved.topicId}`,
    );
    const stats = await ops.lstat(resolved.absolutePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error("saved evaluation is not a regular file");
    }
    return evaluationMetadata(resolved, date, stats);
  }

  async function listTargets(kind: ArtifactKind): Promise<string[]> {
    ArtifactKindSchema.parse(kind);
    const entries = await ops.readdir(rootDirectory(kind), {withFileTypes: true});
    const targets: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || (kind === "intel" && entry.name === "captures")) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`symlink artifact target is not allowed: ${entry.name}`);
      }
      if (!entry.isDirectory()) continue;
      if (!CanonicalIdSchema.safeParse(entry.name).success) continue;
      const resolved = targetDirectory(kind, entry.name);
      if (resolved.targetId === entry.name) targets.push(entry.name);
    }
    return targets.sort((left, right) => left.localeCompare(right));
  }

  async function directoryEntries(kind: ArtifactKind, target: string): Promise<Dirent[]> {
    const directory = targetDirectory(kind, target).path;
    try {
      return await ops.readdir(directory, {withFileTypes: true});
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return [];
      throw error;
    }
  }

  async function listIntelArtifacts(target: string): Promise<IntelArtifactMetadata[]> {
    const entries = await directoryEntries("intel", target);
    const metadata: IntelArtifactMetadata[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || !entry.name.endsWith(".json")) continue;
      if (entry.isSymbolicLink()) throw new Error("symlink artifacts are not allowed");
      if (!entry.isFile()) continue;
      const id = entry.name.slice(0, -5);
      const resolved = resolver.resolveIntelArtifactPath(target, id);
      if (resolved.artifactId !== id || basename(resolved.absolutePath) !== entry.name) continue;
      metadata.push((await readIntelWithMetadata(target, id)).metadata);
    }
    return metadata.sort((left, right) => left.id.localeCompare(right.id));
  }

  async function listEvaluationArtifacts(
    target: string,
  ): Promise<EvaluationArtifactMetadata[]> {
    const entries = await directoryEntries("evaluation", target);
    const metadata: EvaluationArtifactMetadata[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || !entry.name.endsWith(".md")) continue;
      if (entry.isSymbolicLink()) throw new Error("symlink artifacts are not allowed");
      if (!entry.isFile()) continue;
      const id = entry.name.slice(0, -3);
      let parsedId: {date: string; topic: string};
      try {
        parsedId = evaluationId(id);
      } catch {
        continue;
      }
      const resolved = resolver.resolveEvaluationPath(target, parsedId.date, parsedId.topic);
      if (`${parsedId.date}-${resolved.topicId}` !== id) continue;
      metadata.push((await readEvaluationArtifact(target, id)).metadata);
    }
    return metadata.sort((left, right) =>
      right.date.localeCompare(left.date) || left.id.localeCompare(right.id));
  }

  function listArtifacts(
    kind: "intel",
    target: string,
  ): Promise<IntelArtifactMetadata[]>;
  function listArtifacts(
    kind: "evaluation",
    target: string,
  ): Promise<EvaluationArtifactMetadata[]>;
  function listArtifacts(kind: ArtifactKind, target: string): Promise<ArtifactMetadata[]>;
  function listArtifacts(
    kind: ArtifactKind,
    target: string,
  ): Promise<IntelArtifactMetadata[] | EvaluationArtifactMetadata[]> {
    ArtifactKindSchema.parse(kind);
    return kind === "intel"
      ? listIntelArtifacts(target)
      : listEvaluationArtifacts(target);
  }

  return {
    saveIntel,
    saveEvaluation,
    listTargets,
    listArtifacts,
    readIntel: async (target, id) => (await readIntelWithMetadata(target, id)).record,
    readEvaluation: readEvaluationArtifact,
  };
}
