import {isActualCalendarDate} from "./calendar-date.js";
import {
  type EvaluationHeading,
  sectionLines,
  tableRows,
} from "./evaluation-markdown-structure.js";

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

export function validateCompetitorSelectionLedger(
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
    || !isActualCalendarDate(referenceDate)
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
    const releasedIsDate = Boolean(releasedAt && isActualCalendarDate(releasedAt));
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
