import {
  type EvaluationHeading,
  sectionLines,
} from "./evaluation-markdown-structure.js";

function fieldValues(lines: string[], label: string): string[] {
  const prefix = `- ${label}:`;
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim())
    .filter(Boolean);
}

function requireCount(
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

export function validateDecisionCard(
  lines: string[],
  headings: EvaluationHeading[],
  evidenceIds: ReadonlySet<string>,
): void {
  const decisionLines = sectionLines(lines, headings, "Decision Card", 2);
  const verdicts = fieldValues(decisionLines, "Verdict");
  const decisions = fieldValues(decisionLines, "Decision");
  const proven = fieldValues(decisionLines, "Proven");
  const unproven = fieldValues(decisionLines, "Unproven");
  const risks = fieldValues(decisionLines, "Highest risk");
  const playerProblems = fieldValues(decisionLines, "Player problem");
  const validations = fieldValues(decisionLines, "Next validation");
  const confidence = fieldValues(decisionLines, "Confidence");
  const revisit = fieldValues(decisionLines, "Revisit condition");

  for (const [label, values] of [
    ["Verdict", verdicts],
    ["Decision", decisions],
    ["Highest risk", risks],
    ["Player problem", playerProblems],
    ["Confidence", confidence],
    ["Revisit condition", revisit],
  ] as const) {
    requireCount(values, label, 1, 1);
  }
  requireCount(proven, "Proven", 1, 3);
  requireCount(unproven, "Unproven", 1, 3);
  requireCount(validations, "Next validation", 1, 3);

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
}

export function validateDomainFindingSeverities(
  lines: string[],
  headings: EvaluationHeading[],
): void {
  const findingLines = sectionLines(lines, headings, "Domain Findings", 2);
  const severities = fieldValues(findingLines, "Severity");
  if (severities.length < 1 || severities.some(
    (severity) => !/^(?:Blocker|Important|Suggestion)$/u.test(severity),
  )) {
    throw new Error("evaluation Markdown is not canonical: Domain Findings require Blocker, Important, or Suggestion severity");
  }
}
