import {z} from "zod";
import {canonicalSha256} from "./integrity.js";
import type {Persona} from "./persona-schemas.js";

const BoundedTextSchema = z.string().trim().min(1).max(2_000);
const EvidenceRefSchema = z.string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i);
const PersonaIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i);
const ResearchQuestionIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i);
const ConfidenceSchema = z.enum(["low", "medium", "high"]);
const ClarityStatusSchema = z.enum([
  "visible",
  "partial",
  "not-observed",
  "not-assessable",
]);

const StimulusMomentSchema = z.object({
  sequence: z.number().int().min(1).max(100),
  intent: BoundedTextSchema,
  input: BoundedTextSchema,
  observedSystemResponse: BoundedTextSchema,
  friction: BoundedTextSchema,
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(12).refine(
    (values) => new Set(values).size === values.length,
    "evidenceRefs must be unique",
  ),
}).strict();

const ClarityCheckSchema = z.object({
  status: ClarityStatusSchema,
  finding: BoundedTextSchema,
  evidenceRefs: z.array(EvidenceRefSchema).max(12).refine(
    (values) => new Set(values).size === values.length,
    "evidenceRefs must be unique",
  ),
}).strict().superRefine((value, context) => {
  if (
    (value.status === "visible" || value.status === "partial")
    && value.evidenceRefs.length === 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["evidenceRefs"],
      message: "visible and partial clarity findings require evidenceRefs",
    });
  }
});

const PlayerLensInputSchema = z.object({
  personaId: PersonaIdSchema,
  researchQuestionId: ResearchQuestionIdSchema,
  voiceEvidence: z.array(z.object({
    sourceAppid: z.number().int().positive(),
    recommendationId: z.string().trim().min(1).max(128),
  }).strict()).min(1).max(3).refine(
    (values) => new Set(values.map(
      ({sourceAppid, recommendationId}) => `${sourceAppid}:${recommendationId}`,
    )).size === values.length,
    "voiceEvidence must be unique",
  ),
  predictedResponse: BoundedTextSchema,
  nextChoice: BoundedTextSchema,
  confidence: ConfidenceSchema,
  humanFalsifier: BoundedTextSchema,
}).strict();

export const PlayerPanelInputSchema = z.object({
  target: z.string().trim().min(1).max(120),
  observedAt: z.iso.datetime({offset: true}),
  buildId: z.string().trim().min(1).max(120),
  task: BoundedTextSchema,
  startState: BoundedTextSchema,
  endState: BoundedTextSchema,
  outcome: z.enum(["completed", "blocked", "failed"]),
  stimulus: z.array(StimulusMomentSchema).min(1).max(12),
  neutral: z.object({
    summary: BoundedTextSchema,
    nextChoice: BoundedTextSchema,
    uncertainties: z.array(BoundedTextSchema).min(1).max(8),
  }).strict(),
  coreClarity: z.object({
    distinctiveness: ClarityCheckSchema,
    communication: ClarityCheckSchema,
    sceneLegibility: ClarityCheckSchema,
  }).strict(),
  lenses: z.array(PlayerLensInputSchema).min(1).max(12),
}).strict().superRefine((value, context) => {
  const personaIds = value.lenses.map(({personaId}) => personaId);
  if (new Set(personaIds).size !== personaIds.length) {
    context.addIssue({
      code: "custom",
      path: ["lenses"],
      message: "lenses must use unique personaIds",
    });
  }
  const sequences = value.stimulus.map(({sequence}) => sequence);
  if (new Set(sequences).size !== sequences.length) {
    context.addIssue({
      code: "custom",
      path: ["stimulus"],
      message: "stimulus sequence values must be unique",
    });
  }
  if (sequences.some((sequence, index) => index > 0 && sequence <= sequences[index - 1]!)) {
    context.addIssue({
      code: "custom",
      path: ["stimulus"],
      message: "stimulus must be ordered by sequence",
    });
  }
});

const GroundedMemorySchema = z.object({
  sourceAppid: z.number().int().positive(),
  recommendationId: z.string().min(1),
  text: z.string().min(1),
  language: z.string().min(1),
  votedUp: z.boolean(),
}).strict();

export const PlayerPanelRecordSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal("player-panel"),
  target: z.string().min(1),
  observedAt: z.iso.datetime({offset: true}),
  buildId: z.string().min(1),
  task: z.string().min(1),
  startState: z.string().min(1),
  endState: z.string().min(1),
  outcome: z.enum(["completed", "blocked", "failed"]),
  stimulus: z.array(StimulusMomentSchema).min(1),
  neutral: PlayerPanelInputSchema.shape.neutral,
  coreClarity: PlayerPanelInputSchema.shape.coreClarity,
  lenses: z.array(z.object({
    personaId: PersonaIdSchema,
    personaSha256: z.string().regex(/^[a-f0-9]{64}$/),
    researchQuestion: z.object({
      id: ResearchQuestionIdSchema,
      question: z.string().min(1),
    }).strict(),
    groundedMemory: z.array(GroundedMemorySchema).min(1),
    predictedResponse: z.string().min(1),
    nextChoice: z.string().min(1),
    confidence: ConfidenceSchema,
    humanFalsifier: z.string().min(1),
  }).strict()).min(1),
  limitations: z.array(z.string().min(1)).min(1),
}).strict();

export type PlayerPanelInput = z.infer<typeof PlayerPanelInputSchema>;
export type PlayerPanelRecord = z.infer<typeof PlayerPanelRecordSchema>;
export type PersonaLoader = (id: string) => Promise<Persona>;

function evidenceKey(sourceAppid: number, recommendationId: string): string {
  return `${sourceAppid}:${recommendationId}`;
}

export async function buildPlayerPanelRecord(
  input: PlayerPanelInput,
  loadPersona: PersonaLoader,
): Promise<PlayerPanelRecord> {
  const parsed = PlayerPanelInputSchema.parse(input);
  const lenses = [];

  for (const lens of parsed.lenses) {
    let persona: Persona;
    try {
      persona = await loadPersona(lens.personaId);
    } catch (error) {
      throw new Error(
        `saved persona ${lens.personaId} could not be loaded`,
        {cause: error},
      );
    }
    if (persona.id !== lens.personaId) {
      throw new Error(`saved persona id does not match requested lens: ${lens.personaId}`);
    }
    const researchQuestion = persona.target_context.research_questions.find(
      ({id}) => id === lens.researchQuestionId,
    );
    if (!researchQuestion) {
      throw new Error(
        `research question ${lens.researchQuestionId} is not present in persona ${lens.personaId}`,
      );
    }
    const groundingKeys = new Set(persona.evidence_basis.observed_patterns
      .filter(({research_question_id}) => research_question_id === lens.researchQuestionId)
      .flatMap(({evidence}) => evidence.map(({source_appid, recommendation_id}) =>
        evidenceKey(source_appid, recommendation_id))));
    const groundedMemory = lens.voiceEvidence.map(({sourceAppid, recommendationId}) => {
      const key = evidenceKey(sourceAppid, recommendationId);
      const voice = persona.voice.find((candidate) =>
        candidate.source_appid === sourceAppid
        && candidate.recommendation_id === recommendationId);
      if (!voice) {
        throw new Error(
          `voice evidence ${recommendationId} is not present in persona ${lens.personaId}`,
        );
      }
      if (!groundingKeys.has(key)) {
        throw new Error(
          `voice evidence ${recommendationId} does not ground research question ${lens.researchQuestionId}`,
        );
      }
      return {
        sourceAppid: voice.source_appid,
        recommendationId: voice.recommendation_id,
        text: voice.text,
        language: voice.language,
        votedUp: voice.voted_up,
      };
    });

    lenses.push({
      personaId: persona.id,
      personaSha256: canonicalSha256(persona),
      researchQuestion: {
        id: researchQuestion.id,
        question: researchQuestion.question,
      },
      groundedMemory,
      predictedResponse: lens.predictedResponse,
      nextChoice: lens.nextChoice,
      confidence: lens.confidence,
      humanFalsifier: lens.humanFalsifier,
    });
  }

  return PlayerPanelRecordSchema.parse({
    schemaVersion: 1,
    artifactType: "player-panel",
    target: parsed.target,
    observedAt: parsed.observedAt,
    buildId: parsed.buildId,
    task: parsed.task,
    startState: parsed.startState,
    endState: parsed.endState,
    outcome: parsed.outcome,
    stimulus: parsed.stimulus,
    neutral: parsed.neutral,
    coreClarity: parsed.coreClarity,
    lenses,
    limitations: [
      "Predicted responses are hypotheses, not reports from people who played the target build.",
      "The panel does not establish population size, demand, enjoyment, retention, or purchase intent.",
      "Core clarity findings describe this observed stimulus and do not by themselves explain sales performance.",
    ],
  });
}
