import {validateCompetitorSelectionLedger} from "./evaluation-competitors.js";
import {
  type EvaluationDomain,
  selectedDomains,
  validateCoverage,
  validateEvidenceIndex,
} from "./evaluation-coverage.js";
import {
  type EvaluationHeading,
  evaluationHeadings,
  requireOrderedSections,
  sameCells,
  sectionLines,
  tableRows,
} from "./evaluation-markdown-structure.js";

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

export type EvaluationIndieStrategyMode = "detailed" | "not-applicable";
export interface CanonicalEvaluationMetadata {
  indieStrategyMode: EvaluationIndieStrategyMode;
  selectedDomains: EvaluationDomain[];
}

function decisionFieldValues(lines: string[], label: string): string[] {
  const prefix = `- ${label}:`;
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim())
    .filter(Boolean);
}

function requireDecisionCount(
  values: string[],
  label: string,
  minimum: number,
  maximum: number,
): void {
  if (values.length < minimum || values.length > maximum) {
    throw new Error(
      `evaluation Markdown is not canonical: Decision Card ${label} requires ${minimum === maximum ? `exactly ${minimum}` : `${minimum} to ${maximum}`} entr${maximum === 1 ? "y" : "ies"}`,
    );
  }
}

function validateDecisionCard(
  lines: string[],
  headings: EvaluationHeading[],
  evidenceIds: ReadonlySet<string>,
): void {
  const decisionLines = sectionLines(lines, headings, "Decision Card", 2);
  const verdicts = decisionFieldValues(decisionLines, "Verdict");
  const decisions = decisionFieldValues(decisionLines, "Decision");
  const proven = decisionFieldValues(decisionLines, "Proven");
  const unproven = decisionFieldValues(decisionLines, "Unproven");
  const risks = decisionFieldValues(decisionLines, "Highest risk");
  const playerProblems = decisionFieldValues(decisionLines, "Player problem");
  const validations = decisionFieldValues(decisionLines, "Next validation");
  const confidence = decisionFieldValues(decisionLines, "Confidence");
  const revisit = decisionFieldValues(decisionLines, "Revisit condition");

  for (const [label, values] of [
    ["Verdict", verdicts],
    ["Decision", decisions],
    ["Highest risk", risks],
    ["Player problem", playerProblems],
    ["Confidence", confidence],
    ["Revisit condition", revisit],
  ] as const) {
    requireDecisionCount(values, label, 1, 1);
  }
  requireDecisionCount(proven, "Proven", 1, 3);
  requireDecisionCount(unproven, "Unproven", 1, 3);
  requireDecisionCount(validations, "Next validation", 1, 3);

  if (!/^(?:GO|HOLD|NO-GO)$/u.test(verdicts[0]!)) {
    throw new Error("evaluation Markdown is not canonical: Decision Card Verdict must be GO, HOLD, or NO-GO");
  }
  if (!/^(?:fix-now|test-next-build|investigate|defer)$/u.test(decisions[0]!)) {
    throw new Error("evaluation Markdown is not canonical: Decision Card Decision is invalid");
  }
  if (!/^(?:high|medium|low)\b/iu.test(confidence[0]!)) {
    throw new Error("evaluation Markdown is not canonical: Decision Card Confidence must begin with high, medium, or low");
  }
  for (const claim of proven) {
    const cited = [...claim.matchAll(/\bE-\d+\b/gu)].map((match) => match[0]);
    if (cited.length === 0 || cited.some((id) => !evidenceIds.has(id))) {
      throw new Error("evaluation Markdown is not canonical: every Decision Card Proven entry requires a valid Evidence Index ID");
    }
  }
  if (unproven.some((claim) => !/(?:missing|unproven|未証明|根拠不足)/iu.test(claim))) {
    throw new Error("evaluation Markdown is not canonical: every Decision Card Unproven entry must state its missing-evidence status");
  }
  if (validations.some((item) => !/^Test:\s*\S[\s\S]*\|\s*Success signal:\s*\S[\s\S]*\|\s*Guardrail:\s*\S/iu.test(item))) {
    throw new Error("evaluation Markdown is not canonical: every Next validation requires Test, Success signal, and Guardrail");
  }

  const findingLines = sectionLines(lines, headings, "Domain Findings", 2);
  const severities = decisionFieldValues(findingLines, "Severity");
  if (severities.length < 1 || severities.some(
    (severity) => !/^(?:Blocker|Important|Suggestion)$/u.test(severity),
  )) {
    throw new Error("evaluation Markdown is not canonical: Domain Findings require Blocker, Important, or Suggestion severity");
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
  validateDecisionCard(lines, headings, evidenceIds);
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
