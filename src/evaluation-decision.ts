import {
  type EvaluationHeading,
  evaluationHeadings,
  sectionLines,
} from "./evaluation-markdown-structure.js";

export interface StructuredDecisionCard {
  verdict: "GO" | "HOLD" | "NO-GO";
  decision: "fix-now" | "test-next-build" | "investigate" | "defer";
  proven: string[];
  unproven: string[];
  highestRisk: string;
  playerProblem: string;
  nextValidations: Array<{
    test: string;
    successSignal: string;
    guardrail: string;
  }>;
  confidence: string;
  revisitCondition: string;
}

export interface DeveloperDecisionSummary {
  verdict: StructuredDecisionCard["verdict"];
  decision: StructuredDecisionCard["decision"];
  highestRisk: string;
  nextAction: string;
  successSignal: string;
}

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

function decisionCardValues(
  lines: string[],
  headings: EvaluationHeading[],
) {
  const decisionLines = sectionLines(lines, headings, "Decision Card", 2);
  return {
    verdicts: fieldValues(decisionLines, "Verdict"),
    decisions: fieldValues(decisionLines, "Decision"),
    proven: fieldValues(decisionLines, "Proven"),
    unproven: fieldValues(decisionLines, "Unproven"),
    risks: fieldValues(decisionLines, "Highest risk"),
    playerProblems: fieldValues(decisionLines, "Player problem"),
    validations: fieldValues(decisionLines, "Next validation"),
    confidence: fieldValues(decisionLines, "Confidence"),
    revisit: fieldValues(decisionLines, "Revisit condition"),
  };
}

function parseNextValidation(value: string): StructuredDecisionCard["nextValidations"][number] {
  const match = /^Test:\s*(\S[\s\S]*?)\s*\|\s*Success signal:\s*(\S[\s\S]*?)\s*\|\s*Guardrail:\s*(\S[\s\S]*)$/iu.exec(value);
  if (!match) {
    throw new Error("evaluation Markdown is not canonical: every Next validation requires Test, Success signal, and Guardrail");
  }
  return {test: match[1]!, successSignal: match[2]!, guardrail: match[3]!};
}

export function extractDecisionCard(content: string): StructuredDecisionCard {
  const lines = content.split(/\r?\n/u);
  const values = decisionCardValues(lines, evaluationHeadings(lines));
  return {
    verdict: values.verdicts[0] as StructuredDecisionCard["verdict"],
    decision: values.decisions[0] as StructuredDecisionCard["decision"],
    proven: values.proven,
    unproven: values.unproven,
    highestRisk: values.risks[0]!,
    playerProblem: values.playerProblems[0]!,
    nextValidations: values.validations.map(parseNextValidation),
    confidence: values.confidence[0]!,
    revisitCondition: values.revisit[0]!,
  };
}

export function buildDeveloperDecisionSummary(
  decisionCard: StructuredDecisionCard,
): DeveloperDecisionSummary {
  const next = decisionCard.nextValidations[0]!;
  return {
    verdict: decisionCard.verdict,
    decision: decisionCard.decision,
    highestRisk: decisionCard.highestRisk,
    nextAction: next.test,
    successSignal: next.successSignal,
  };
}

export function validateDecisionCard(
  lines: string[],
  headings: EvaluationHeading[],
  evidenceIds: ReadonlySet<string>,
): void {
  const {
    verdicts,
    decisions,
    proven,
    unproven,
    risks,
    playerProblems,
    validations,
    confidence,
    revisit,
  } = decisionCardValues(lines, headings);

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
  validations.forEach(parseNextValidation);
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
