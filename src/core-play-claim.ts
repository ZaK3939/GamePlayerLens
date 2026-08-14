import {z} from "zod";
import {addSafeSchemaIssues} from "./prompt-validation.js";
import {RewardFamilySchema} from "./project-brief.js";

const CoreClaimTextSchema = z.string().trim().min(1).max(2_000);

export const CorePlayClaimObjectSchema = z.object({
  oneSentencePromise: CoreClaimTextSchema,
  theme: CoreClaimTextSchema,
  distinctiveSystem: CoreClaimTextSchema,
  intendedExperience: CoreClaimTextSchema,
  rewardFamily: RewardFamilySchema,
  intendedReward: CoreClaimTextSchema,
  proofMoment: CoreClaimTextSchema,
  amplifier: CoreClaimTextSchema.optional(),
}).strict();

export type CorePlayClaim = z.infer<typeof CorePlayClaimObjectSchema>;

const CORE_CLAIM_SAFE_FIELDS = new Set<string>([
  "oneSentencePromise",
  "theme",
  "distinctiveSystem",
  "intendedExperience",
  "rewardFamily",
  "intendedReward",
  "proofMoment",
  "amplifier",
]);

export const CorePlayClaimSchema = z.string().trim().min(2).max(16_000).transform(
  (input, context) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      context.addIssue({code: "custom", message: "coreClaim must be valid JSON"});
      return z.NEVER;
    }
    const result = CorePlayClaimObjectSchema.safeParse(parsed);
    if (!result.success) {
      addSafeSchemaIssues(
        context,
        "coreClaim",
        result.error.issues,
        CORE_CLAIM_SAFE_FIELDS,
      );
      return z.NEVER;
    }
    return JSON.stringify(result.data);
  },
);

export function buildCorePlayClaimDiagnostics(claim: CorePlayClaim) {
  return {
    evidenceClass: "declared-design-hypothesis" as const,
    amplifierDeclared: claim.amplifier !== undefined,
    feltRewardRequiresHumanReport: true,
    interpretationLimit: "Operate the build to inspect delivery signals; the claim does not prove player feeling, fun, demand, or retention.",
  };
}
