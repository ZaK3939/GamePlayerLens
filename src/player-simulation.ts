import type {Persona} from "./persona-schemas.js";
import {assertPersonaMatchesDerivationEvidence} from "./persona-grounding.js";
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
  const voiceOwners = new Map<string, string>();
  for (const {persona} of personas) {
    for (const voice of persona.voice) {
      const key = voiceKey({
        sourceAppid: voice.source_appid,
        recommendationId: voice.recommendation_id,
      });
      const owner = voiceOwners.get(key);
      if (owner && owner !== persona.id) {
        throw new Error(`review voice is reused across personas: ${owner}/${persona.id}`);
      }
      voiceOwners.set(key, persona.id);
    }
  }
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
    const derivationRef = round.playerSimulation.memory.derivationEvidenceRef;
    const derivationEvidence = evidenceByRef.get(derivationRef);
    if (
      !derivationEvidence
      || derivationEvidence.record.kind !== "intel"
      || derivationEvidence.record.sourceTool !== "derive_personas"
      || derivationEvidence.payload === undefined
    ) {
      throw new Error(
        `player simulation requires exact derive_personas evidence: ${round.personaId}`,
      );
    }
    assertPersonaMatchesDerivationEvidence(persona, derivationEvidence.payload);

    const stimulusEvidence = round.playerSimulation.stimulusEvidenceRefs.flatMap(
      (reference) => {
        const item = evidenceByRef.get(reference);
        return item ? [item] : [];
      },
    );
    if (stimulusEvidence.length !== round.playerSimulation.stimulusEvidenceRefs.length) {
      throw new Error(`player simulation stimulus evidence is missing: ${round.personaId}`);
    }
    const hasVisualEvidence = stimulusEvidence.some(({record}) =>
      record.kind === "capture" || record.kind === "ui-reference");
    if (
      round.playerSimulation.exposure === "visual-evidence"
      && !hasVisualEvidence
    ) {
      throw new Error(
        `visual player simulation requires explicit visual stimulus: ${round.personaId}`,
      );
    }
    if (
      round.playerSimulation.exposure === "ai-operated"
      && !stimulusEvidence.some(({payload}) => hasAiOperatedSession(payload))
    ) {
      throw new Error(
        `AI-operated player simulation requires an explicit AI-operated session stimulus: ${round.personaId}`,
      );
    }

    if (input.selectedDomains.includes("ui")) {
      if (round.playerSimulation.exposure === "scenario-only" || !hasVisualEvidence) {
        throw new Error(
          `UI player simulation requires explicit visual stimulus evidence: ${round.personaId}`,
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
