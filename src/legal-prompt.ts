import {z} from "zod";
import {LegalSourcePlanSchema, type LegalSourcePlan} from "./legal.js";
import {
  ResultEnvelopeSchema,
  ResultHandleSchema,
  type ResultStore,
} from "./results.js";

const EvidenceArtifactIdsSchema = z.string().trim().max(4_096).superRefine(
  (input, context) => {
    const ids = [...new Set(
      input.split(",").map((id) => id.trim()).filter(Boolean),
    )];
    if (ids.length === 0) {
      context.addIssue({code: "custom", message: "At least one evidence artifact ID is required"});
      return;
    }
    if (ids.length > 100 || ids.some((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) {
      context.addIssue({
        code: "custom",
        message: "Evidence artifact IDs must contain at most 100 lowercase kebab-case IDs",
      });
      return;
    }
  },
);

export const GameLegalAuditPromptArgumentsSchema = z.object({
  sourcePlanResultHandle: ResultHandleSchema,
  evidenceArtifactIds: EvidenceArtifactIdsSchema.optional(),
  focus: z.string().trim().min(1).max(1_000).optional(),
}).strict();

export type GameLegalAuditPromptArguments = z.input<
  typeof GameLegalAuditPromptArgumentsSchema
>;

export interface LegalSourcePlanEvidence {
  sourcePlan: LegalSourcePlan;
  evidence: {
    sourceTool: "legal_source_plan";
    resultHandle: string;
    observedAt: string;
  };
}

function evidenceAccessPolicy(mode: LegalSourcePlan["releaseScope"]["evidenceAccessMode"]) {
  if (mode === "metadata-only") {
    return {
      mode,
      contentAccessAllowed: false,
      fullDocumentAccessAllowed: false,
      requiredHandling: "Do not call get_artifact for evidenceArtifactIds. Treat document contents, permissions, and obligations as cannot-assess.",
    } as const;
  }
  if (mode === "redacted-artifacts") {
    return {
      mode,
      contentAccessAllowed: true,
      fullDocumentAccessAllowed: false,
      requiredHandling: "Call get_artifact only for copies explicitly redacted and approved for this AI client. Limit every conclusion to the supplied excerpts.",
    } as const;
  }
  return {
    mode,
    contentAccessAllowed: true,
    fullDocumentAccessAllowed: true,
    requiredHandling: "Call get_artifact only within the user-approved processing environment. Preserve confidentiality and the bounded review scope.",
  } as const;
}

export function resolveLegalSourcePlanEvidence(
  store: Pick<ResultStore, "get">,
  resultHandle: string,
): LegalSourcePlanEvidence {
  const stored = store.get(resultHandle);
  if (stored.sourceTool !== "legal_source_plan") {
    throw new Error("sourcePlanResultHandle must come from legal_source_plan");
  }
  const envelope = ResultEnvelopeSchema.parse(stored.payload);
  const sourcePlan = LegalSourcePlanSchema.parse(envelope.data);
  if (sourcePlan.observedAt !== stored.observedAt) {
    throw new Error("legal source plan observedAt does not match its tracked result");
  }
  return {
    sourcePlan,
    evidence: {
      sourceTool: "legal_source_plan",
      resultHandle: ResultHandleSchema.parse(resultHandle),
      observedAt: stored.observedAt,
    },
  };
}

export function buildGameLegalAuditPrompt(
  skill: string,
  input: GameLegalAuditPromptArguments,
  context: LegalSourcePlanEvidence,
): string {
  const parsed = GameLegalAuditPromptArgumentsSchema.parse(input);
  if (context.evidence.resultHandle !== parsed.sourcePlanResultHandle) {
    throw new Error("legal source plan evidence does not match sourcePlanResultHandle");
  }
  const supplementalEvidenceArtifactIds = parsed.evidenceArtifactIds
    ? [...new Set(parsed.evidenceArtifactIds.split(",").map((id) => id.trim()).filter(Boolean))]
    : [];
  const releaseScope = context.sourcePlan.releaseScope;
  const evidenceArtifactIds = [...new Set([
    releaseScope.releaseInventoryEvidenceId,
    releaseScope.financialEligibilityEvidenceId,
    ...releaseScope.engines.flatMap((engine) => [
      engine.customTermsEvidenceId,
      ...engine.evidenceIds,
    ]),
    ...releaseScope.materials.flatMap((material) => material.evidenceIds),
    ...releaseScope.distributionChannels.map((channel) => channel.agreementEvidenceId),
    ...supplementalEvidenceArtifactIds,
  ].filter((id): id is string => typeof id === "string"))];
  return [
    skill,
    "",
    "--- END REPOSITORY SKILL ---",
    "",
    "--- BEGIN INPUT DATA (JSON) ---",
    JSON.stringify({
      sourcePlanEvidence: context.evidence,
      sourcePlan: context.sourcePlan,
      evidenceTarget: context.sourcePlan.target,
      evidenceArtifactIds,
      evidenceAccessPolicy: evidenceAccessPolicy(releaseScope.evidenceAccessMode),
      focus: parsed.focus ?? null,
    }, null, 2),
    "--- END INPUT DATA (JSON) ---",
  ].join("\n");
}
