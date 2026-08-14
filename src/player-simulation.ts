import type {Persona} from "./persona-schemas.js";
import {
  PlaytestCohortObjectSchema,
  PlaytestSessionObjectSchema,
} from "./playtest-evidence.js";
import type {
  ResolvedEvidenceResult,
  ResolvedPersonaResult,
} from "./run-evidence.js";
import type {SaveRunInput} from "./run-schemas.js";

function voiceKey(reference: {sourceAppid: number; recommendationId: string}): string {
  return `${reference.sourceAppid}:${reference.recommendationId}`;
}

function personaVoiceKeys(persona: Persona): Set<string> {
  return new Set(persona.voice.map((voice) => voiceKey({
    sourceAppid: voice.source_appid,
    recommendationId: voice.recommendation_id,
  })));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasAiOperatedSession(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const data = isRecord(payload.data) ? payload.data : payload;
  const session = PlaytestSessionObjectSchema.safeParse(data);
  if (session.success) return session.data.testerType === "ai-operated";
  const cohort = PlaytestCohortObjectSchema.safeParse(data);
  return cohort.success && cohort.data.sessions.some(
    (item) => item.testerType === "ai-operated",
  );
}

export function assertPlayerSimulationGrounding(
  input: SaveRunInput,
  personas: ResolvedPersonaResult[],
  evidence: ResolvedEvidenceResult[],
): void {
  const byId = new Map(personas.map((persona) => [persona.persona.id, persona.persona]));
  const evidenceByRef = new Map(evidence.map((item) => [item.record.ref, item]));
  for (const round of input.rounds) {
    if (round.phase !== "persona" || !round.personaId || !round.playerSimulation) continue;
    const persona = byId.get(round.personaId);
    if (!persona) throw new Error(`player simulation persona does not exist: ${round.personaId}`);
    const availableVoice = personaVoiceKeys(persona);
    for (const reference of round.playerSimulation.memory.voiceEvidence) {
      if (!availableVoice.has(voiceKey(reference))) {
        throw new Error(
          `player simulation voice evidence is not present in persona: ${round.personaId}`,
        );
      }
    }
    const referencedEvidence = round.evidenceRefs.flatMap((reference) => {
      const item = evidenceByRef.get(reference);
      return item ? [item] : [];
    });
    const hasVisualEvidence = referencedEvidence.some(({record}) =>
      record.kind === "capture" || record.kind === "ui-reference");
    if (round.playerSimulation.exposure === "visual-evidence" && !hasVisualEvidence) {
      throw new Error(
        `visual player simulation requires cited visual evidence: ${round.personaId}`,
      );
    }
    if (
      round.playerSimulation.exposure === "ai-operated"
      && !referencedEvidence.some(({payload}) => hasAiOperatedSession(payload))
    ) {
      throw new Error(
        `AI-operated player simulation requires a cited AI-operated session: ${round.personaId}`,
      );
    }
    if (input.selectedDomains.includes("ui")) {
      if (round.playerSimulation.exposure === "scenario-only" || !hasVisualEvidence) {
        throw new Error(
          `UI player simulation requires cited visual evidence: ${round.personaId}`,
        );
      }
    }
    if (input.selectedDomains.includes("competition")) {
      const competitorAppids = new Set(persona.target_context.source_roles
        .filter((source) => source.role === "competitor")
        .map((source) => source.appid));
      const citesCompetitorVoice = round.playerSimulation.memory.voiceEvidence.some(
        (reference) => competitorAppids.has(reference.sourceAppid),
      );
      if (!citesCompetitorVoice) {
        throw new Error(
          `competition player simulation requires competitor review voice evidence: ${round.personaId}`,
        );
      }
    }
  }
}
