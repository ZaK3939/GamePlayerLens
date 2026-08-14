import type {RefinementCtx} from "zod";
import {
  buildProjectBriefDiagnostics,
  type ProjectBrief,
  type SubjectKind,
} from "./project-brief.js";

interface RunRelationShape {
  mode: "baseline" | "change";
  selectedDomains: string[];
  scenarios: Array<{id: string}>;
  personaIds: string[];
  evidenceRefs: Array<{
    ref: string;
    kind: string;
    sourceTool?: string;
    indieStrategyMode?: string;
  }>;
  rounds: Array<{
    sequence: number;
    phase: "persona" | "domain" | "critic" | "synthesis";
    scenarioId?: string;
    domain?: string;
    personaId?: string;
    evidenceRefs: string[];
  }>;
  finalEvaluationRef: string;
}

interface RevisionReferenceShape {
  mode: "baseline" | "change";
  revisionBundleRef?: string;
  evidenceRefs: RunRelationShape["evidenceRefs"];
}

function issue(
  context: RefinementCtx,
  path: Array<string | number>,
  message: string,
): void {
  context.addIssue({code: "custom", path, message});
}

function duplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

export function validateRunRelations(
  value: RunRelationShape,
  context: RefinementCtx,
): void {
  if (value.mode === "baseline" && value.scenarios.length !== 1) {
    issue(context, ["scenarios"], "baseline runs require exactly one scenario");
  }
  if (value.mode === "change" && value.scenarios.length < 2) {
    issue(context, ["scenarios"], "change runs require at least two scenarios");
  }
  for (const [path, values] of [
    [["selectedDomains"], value.selectedDomains],
    [["scenarios"], value.scenarios.map((scenario) => scenario.id)],
    [["personaIds"], value.personaIds],
    [["evidence"], value.evidenceRefs.map((evidence) => evidence.ref)],
  ] as const) {
    const repeated = duplicate([...values]);
    if (repeated) issue(context, [...path], `duplicate id: ${repeated}`);
  }

  const scenarioIds = new Set(value.scenarios.map((scenario) => scenario.id));
  const personaIds = new Set(value.personaIds);
  const evidenceIds = new Set(value.evidenceRefs.map((evidence) => evidence.ref));
  value.rounds.forEach((round, index) => {
    if (round.sequence !== index + 1) {
      issue(context, ["rounds", index, "sequence"], "round sequences must be consecutive from 1");
    }
    if (round.scenarioId && !scenarioIds.has(round.scenarioId)) {
      issue(context, ["rounds", index, "scenarioId"], "unknown scenario reference");
    }
    if (round.personaId && !personaIds.has(round.personaId)) {
      issue(context, ["rounds", index, "personaId"], "unknown persona reference");
    }
    if (round.phase === "persona" && !round.personaId) {
      issue(context, ["rounds", index, "personaId"], "persona rounds require a persona reference");
    }
    if (round.phase === "domain" && !round.domain) {
      issue(context, ["rounds", index, "domain"], "domain rounds require a domain");
    }
    if (round.domain && !value.selectedDomains.includes(round.domain)) {
      issue(context, ["rounds", index, "domain"], "round domain is outside the selected domains");
    }
    const repeatedEvidence = duplicate(round.evidenceRefs);
    if (repeatedEvidence) {
      issue(context, ["rounds", index, "evidenceRefs"], `duplicate evidence: ${repeatedEvidence}`);
    }
    for (const reference of round.evidenceRefs) {
      if (!evidenceIds.has(reference)) {
        issue(context, ["rounds", index, "evidenceRefs"], `unknown evidence reference: ${reference}`);
      }
    }
  });

  for (const scenarioId of scenarioIds) {
    if (!value.rounds.some((round) => round.scenarioId === scenarioId)) {
      issue(context, ["rounds"], `scenario has no recorded round: ${scenarioId}`);
    }
  }
  for (const personaId of personaIds) {
    if (!value.rounds.some((round) =>
      round.phase === "persona" && round.personaId === personaId)) {
      issue(context, ["rounds"], `persona has no recorded persona round: ${personaId}`);
    }
  }
  for (const domain of value.selectedDomains) {
    if (!value.rounds.some((round) =>
      round.phase === "domain" && round.domain === domain)) {
      issue(context, ["rounds"], `selected domain has no recorded round: ${domain}`);
    }
  }
  for (const requiredPhase of ["critic", "synthesis"] as const) {
    if (!value.rounds.some((round) => round.phase === requiredPhase)) {
      issue(context, ["rounds"], `simulation run requires a ${requiredPhase} round`);
    }
  }
  const finalEvidence = value.evidenceRefs.find(
    (evidence) => evidence.ref === value.finalEvaluationRef,
  );
  if (!finalEvidence || finalEvidence.kind !== "evaluation") {
    issue(context, ["finalEvaluationRef"], "final evaluation must reference evaluation evidence");
  }
}

export function validateRunCompleteness(
  value: RunRelationShape,
  context: RefinementCtx,
): void {
  for (const scenario of value.scenarios) {
    for (const domain of value.selectedDomains) {
      if (!value.rounds.some((round) =>
        round.phase === "domain"
        && round.scenarioId === scenario.id
        && round.domain === domain)) {
        issue(
          context,
          ["rounds"],
          `scenario/domain cell has no recorded round: ${scenario.id}/${domain}`,
        );
      }
    }
  }
  for (const personaId of value.personaIds) {
    for (const scenario of value.scenarios) {
      if (!value.rounds.some((round) =>
        round.phase === "persona"
        && round.personaId === personaId
        && round.scenarioId === scenario.id)) {
        issue(
          context,
          ["rounds"],
          `persona/scenario cell has no recorded round: ${personaId}/${scenario.id}`,
        );
      }
    }
  }

  value.rounds.forEach((round, index) => {
    if (round.evidenceRefs.includes(value.finalEvaluationRef)) {
      issue(
        context,
        ["rounds", index, "evidenceRefs"],
        "rounds cannot cite the final evaluation created after synthesis",
      );
    }
  });
  const usedEvidence = new Set(value.rounds.flatMap((round) => round.evidenceRefs));
  for (const evidence of value.evidenceRefs) {
    if (evidence.ref !== value.finalEvaluationRef && !usedEvidence.has(evidence.ref)) {
      issue(context, ["evidence"], `analysis evidence is not used by any round: ${evidence.ref}`);
    }
  }
}

export function validateDeveloperProjectBrief(
  value: {subjectKind: SubjectKind; projectBrief?: ProjectBrief},
  context: RefinementCtx,
): void {
  if (value.subjectKind !== "developer-concept" && value.subjectKind !== "developer-project") {
    return;
  }
  if (!value.projectBrief) {
    issue(context, ["projectBrief"], "developer runs require projectBrief");
    return;
  }
  const diagnostics = buildProjectBriefDiagnostics(value.projectBrief);
  const missingFields = [...new Set([
    ...diagnostics.conceptRoute.missingFields,
    ...diagnostics.rewardMechanism.missingFields,
    ...diagnostics.mechanismTransfer.missingFields,
  ])];
  for (const field of missingFields) {
    issue(
      context,
      ["projectBrief", field],
      `developer run projectBrief is missing route field: ${field}`,
    );
  }
}

export function validateSaveRevisionBundleReference(
  value: RevisionReferenceShape,
  context: RefinementCtx,
): void {
  if (value.mode === "change") {
    if (!value.revisionBundleRef) {
      issue(context, ["revisionBundleRef"], "change runs require an exact-saved revision bundle");
      return;
    }
    const revisionEvidence = value.evidenceRefs.find(
      (evidence) => evidence.ref === value.revisionBundleRef,
    );
    if (revisionEvidence?.kind !== "intel") {
      issue(context, ["revisionBundleRef"], "revisionBundleRef must reference intel evidence");
    }
  } else if (value.revisionBundleRef) {
    issue(
      context,
      ["revisionBundleRef"],
      "baseline runs cannot contain a current-versus-candidate revision bundle",
    );
  }
}

export function validateStoredDeveloperEvaluation(
  value: Pick<RunRelationShape, "evidenceRefs" | "finalEvaluationRef"> & {
    subjectKind: SubjectKind;
  },
  context: RefinementCtx,
): void {
  const finalEvaluation = value.evidenceRefs.find(
    (item) => item.ref === value.finalEvaluationRef && item.kind === "evaluation",
  );
  if (
    (value.subjectKind === "developer-concept" || value.subjectKind === "developer-project")
    && finalEvaluation?.indieStrategyMode !== "detailed"
  ) {
    issue(
      context,
      ["finalEvaluationRef"],
      "developer runs require a detailed Indie Survival Strategy",
    );
  }
}

export function validateStoredRevisionBundleReference(
  value: RevisionReferenceShape,
  context: RefinementCtx,
): void {
  if (value.mode === "change") {
    const revisionEvidence = value.evidenceRefs.find(
      (item) => item.ref === value.revisionBundleRef,
    );
    if (
      !value.revisionBundleRef
      || revisionEvidence?.kind !== "intel"
      || revisionEvidence.sourceTool !== "manual"
    ) {
      issue(
        context,
        ["revisionBundleRef"],
        "stored change runs require manual revision-bundle evidence",
      );
    }
  } else if (value.revisionBundleRef) {
    issue(
      context,
      ["revisionBundleRef"],
      "stored baseline runs cannot contain a revision bundle",
    );
  }
}
