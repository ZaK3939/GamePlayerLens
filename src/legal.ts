import {createHash} from "node:crypto";
import {z} from "zod";
import type {FetchResult} from "./http.js";

const CanonicalIdSchema = z.string().trim().min(1).max(64).regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "IDs must use lowercase kebab-case",
);
const BoundedTextSchema = z.string().trim().min(1).max(500);
const CountryCodeSchema = z.string().trim().toUpperCase().regex(
  /^[A-Z]{2}$/,
  "jurisdictions must use ISO 3166-1 alpha-2 country codes",
);
const EvidenceIdSchema = CanonicalIdSchema;
const HttpsUrlSchema = z.url().transform((input, context) => {
  const parsed = new URL(input);
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
  ) {
    context.addIssue({
      code: "custom",
      message: "license URLs must be credential-free HTTPS URLs",
    });
    return z.NEVER;
  }
  parsed.hash = "";
  return parsed.href;
});

export const LegalDecisionSchema = z.enum([
  "demo-release",
  "commercial-release",
  "platform-port",
  "publisher-due-diligence",
  "asset-reuse",
  "team-transfer",
  "other",
]);

export const LegalEngineSchema = z.object({
  provider: z.enum(["unity", "unreal", "godot", "custom", "other"]),
  version: BoundedTextSchema,
  usage: z.enum([
    "interactive-game",
    "rendered-media",
    "plugin-or-tool",
    "client-work",
    "internal-prototype",
    "other",
  ]),
  licenseTier: BoundedTextSchema.optional(),
  termsAcceptedAt: z.iso.date().optional(),
  customTermsEvidenceId: EvidenceIdSchema.optional(),
  evidenceIds: z.array(EvidenceIdSchema).max(20),
}).strict();

export const LegalMaterialSchema = z.object({
  materialId: CanonicalIdSchema,
  category: z.enum([
    "2d-asset",
    "3d-asset",
    "animation",
    "audio",
    "font",
    "code-plugin",
    "sdk",
    "voice-or-likeness",
    "generated-content",
    "trademark-or-brand",
    "other",
  ]),
  source: z.enum([
    "unity-asset-store",
    "fab",
    "epic-content",
    "open-source",
    "direct-license",
    "contractor",
    "in-house",
    "generated-ai",
    "other",
  ]),
  licenseName: BoundedTextSchema.optional(),
  licenseUrl: HttpsUrlSchema.optional(),
  acquiredAt: z.iso.date().optional(),
  licensee: z.enum(["individual", "studio", "client", "unknown"]),
  uses: z.array(z.enum([
    "compiled-game",
    "rendered-marketing",
    "source-distribution",
    "ugc-or-modding",
    "training-ai",
    "generative-ai-input",
    "other",
  ])).min(1).max(7),
  evidenceIds: z.array(EvidenceIdSchema).max(20),
}).strict();

export const LegalDistributionChannelSchema = z.object({
  channel: z.enum([
    "steam",
    "epic-games-store",
    "itch-io",
    "apple-app-store",
    "google-play",
    "playstation",
    "xbox",
    "nintendo",
    "direct",
    "other",
  ]),
  agreementEvidenceId: EvidenceIdSchema.optional(),
  termsUrl: HttpsUrlSchema.optional(),
}).strict();

export const LegalSourcePlanInputSchema = z.object({
  target: CanonicalIdSchema,
  releaseId: CanonicalIdSchema,
  releaseDescription: BoundedTextSchema,
  plannedReleaseDate: z.iso.date().optional(),
  releaseInventoryEvidenceId: EvidenceIdSchema.optional(),
  decision: LegalDecisionSchema,
  jurisdictions: z.array(CountryCodeSchema).min(1).max(10),
  financialEligibilityEvidenceId: EvidenceIdSchema.optional(),
  engines: z.array(LegalEngineSchema).min(1).max(5),
  materials: z.array(LegalMaterialSchema).max(250),
  distributionChannels: z.array(LegalDistributionChannelSchema).min(1).max(10),
}).strict().superRefine((value, context) => {
  const unique = <T>(
    values: readonly T[],
    key: (value: T) => string,
    path: string,
    message: string,
  ) => {
    const seen = new Set<string>();
    for (const [index, item] of values.entries()) {
      const id = key(item);
      if (seen.has(id)) {
        context.addIssue({code: "custom", path: [path, index], message});
      }
      seen.add(id);
    }
  };
  unique(value.materials, (item) => item.materialId, "materials", "materialId values must be unique");
  unique(
    value.distributionChannels,
    (item) => item.channel,
    "distributionChannels",
    "distribution channel values must be unique",
  );
});

export type LegalSourcePlanInput = z.infer<typeof LegalSourcePlanInputSchema>;

export const LegalReleaseScopeSchema = z.object({
  releaseId: CanonicalIdSchema,
  releaseDescription: BoundedTextSchema,
  plannedReleaseDate: z.iso.date().nullable(),
  releaseInventoryEvidenceId: EvidenceIdSchema.nullable(),
  financialEligibilityEvidenceId: EvidenceIdSchema.nullable(),
  engines: z.array(LegalEngineSchema).min(1).max(5),
  materials: z.array(LegalMaterialSchema).max(250),
  distributionChannels: z.array(LegalDistributionChannelSchema).min(1).max(10),
}).strict();

export const LegalSourceRequirementSchema = z.object({
  id: CanonicalIdSchema,
  provider: z.string().min(1),
  topic: z.string().min(1),
  sourceClass: z.enum(["official-public", "private-agreement", "item-specific"]),
  url: z.string().url().nullable(),
  retrievalStatus: z.enum([
    "must-refresh-official-page",
    "user-must-supply-current-copy",
    "verify-item-specific-license",
  ]),
  reason: z.string().min(1),
}).strict();

export const LegalIntakeGapSchema = z.object({
  code: CanonicalIdSchema,
  path: z.string().min(1),
  severity: z.enum(["blocking", "important"]),
  question: z.string().min(1),
}).strict();

export const LegalSourcePlanSchema = z.object({
  schemaVersion: z.literal(1),
  observedAt: z.iso.datetime({offset: true}),
  target: CanonicalIdSchema,
  decision: LegalDecisionSchema,
  jurisdictions: z.array(CountryCodeSchema),
  releaseScope: LegalReleaseScopeSchema,
  intakeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRequirements: z.array(LegalSourceRequirementSchema),
  intakeGaps: z.array(LegalIntakeGapSchema),
  readiness: z.object({
    status: z.enum(["ready-for-source-review", "needs-input"]),
    blockingGapCount: z.number().int().nonnegative(),
    importantGapCount: z.number().int().nonnegative(),
    interpretation: z.string().min(1),
  }).strict(),
  claimsPolicy: z.object({
    allowed: z.array(z.string().min(1)),
    prohibited: z.array(z.string().min(1)),
  }).strict(),
  nextAction: z.string().min(1),
}).strict();

export type LegalSourcePlan = z.infer<typeof LegalSourcePlanSchema>;

function sourceRequirement(
  id: string,
  provider: string,
  topic: string,
  url: string | null,
  sourceClass: "official-public" | "private-agreement" | "item-specific",
  retrievalStatus: "must-refresh-official-page" | "user-must-supply-current-copy" | "verify-item-specific-license",
  reason: string,
) {
  return LegalSourceRequirementSchema.parse({
    id,
    provider,
    topic,
    url,
    sourceClass,
    retrievalStatus,
    reason,
  });
}

function intakeGap(
  code: string,
  path: string,
  question: string,
  severity: "blocking" | "important" = "blocking",
) {
  return LegalIntakeGapSchema.parse({code, path, severity, question});
}

function engineSources(input: LegalSourcePlanInput) {
  const sources: z.infer<typeof LegalSourceRequirementSchema>[] = [];
  const providers = new Set(input.engines.map((engine) => engine.provider));
  if (providers.has("unity")) {
    sources.push(sourceRequirement(
      "unity-editor-terms",
      "Unity",
      "Editor, runtime, tier eligibility, and distribution terms",
      "https://unity.com/legal/editor-terms-of-service/software",
      "official-public",
      "must-refresh-official-page",
      "Confirm the current Unity version, plan eligibility, runtime rights, and distribution obligations.",
    ));
  }
  if (providers.has("unreal")) {
    sources.push(sourceRequirement(
      "unreal-engine-eula",
      "Epic Games",
      "Unreal Engine seats, royalties, use, and product distribution",
      "https://www.unrealengine.com/eula/unreal",
      "official-public",
      "must-refresh-official-page",
      "Confirm the current EULA, applicable product category, seat exceptions, royalty prerequisites, and distribution terms.",
    ));
  }
  for (const provider of ["godot", "custom", "other"] as const) {
    if (!providers.has(provider)) continue;
    sources.push(sourceRequirement(
      `${provider}-engine-license`,
      provider,
      "Engine license and bundled third-party notices",
      null,
      "item-specific",
      "user-must-supply-current-copy",
      "Provide the exact engine version license and all bundled third-party notices used by this build.",
    ));
  }
  return sources;
}

function materialSources(input: LegalSourcePlanInput) {
  const sources: z.infer<typeof LegalSourceRequirementSchema>[] = [];
  const materialProviders = new Set(input.materials.map((material) => material.source));
  if (materialProviders.has("unity-asset-store")) {
    sources.push(sourceRequirement(
      "unity-asset-store-terms",
      "Unity",
      "Unity Asset Store Terms and EULA",
      "https://unity.com/legal/as-terms",
      "official-public",
      "must-refresh-official-page",
      "Confirm the standard EULA and whether the item uses separate provider terms.",
    ));
  }
  if (materialProviders.has("fab")) {
    sources.push(sourceRequirement(
      "fab-standard-license",
      "Fab / Epic Games",
      "Fab Standard License and item-specific tier or license",
      "https://www.fab.com/eula",
      "official-public",
      "must-refresh-official-page",
      "Confirm the current Fab license and the exact license attached to each acquired item.",
    ));
  }
  if (materialProviders.has("epic-content")) {
    sources.push(sourceRequirement(
      "epic-content-license",
      "Epic Games",
      "Epic Content License Agreement",
      "https://www.unrealengine.com/eula/content",
      "official-public",
      "must-refresh-official-page",
      "Confirm content distribution, source sharing, UE-only, incompatible-license, and AI restrictions.",
    ));
  }
  for (const material of input.materials) {
    const isRightsChainMaterial = material.source === "contractor" || material.source === "in-house";
    sources.push(sourceRequirement(
      `material-${material.materialId}-license`,
      material.source,
      isRightsChainMaterial
        ? `Authorship, assignment, and project rights for ${material.materialId}`
        : `Exact license, receipt, and rights chain for ${material.materialId}`,
      isRightsChainMaterial ? null : material.licenseUrl ?? null,
      isRightsChainMaterial ? "private-agreement" : "item-specific",
      !isRightsChainMaterial && material.licenseUrl
        ? "verify-item-specific-license"
        : "user-must-supply-current-copy",
      isRightsChainMaterial
        ? "Authorship alone does not establish the project's ownership, assignment, collaborator access, or distribution rights."
        : "Marketplace-wide terms do not establish the license, licensee, acquisition, or special restrictions for this exact material.",
    ));
  }
  return sources;
}

function channelSources(input: LegalSourcePlanInput) {
  const sources: z.infer<typeof LegalSourceRequirementSchema>[] = [];
  for (const channel of input.distributionChannels) {
    if (channel.channel === "steam") {
      sources.push(sourceRequirement(
        "steam-direct-rules",
        "Valve",
        "Steam Direct public release rules",
        "https://partner.steamgames.com/steamdirect",
        "official-public",
        "must-refresh-official-page",
        "Confirm current public release and content rules without treating them as the complete private distribution agreement.",
      ));
      sources.push(sourceRequirement(
        "steam-distribution-agreement",
        "Valve",
        "Current accepted Steam Distribution Agreement",
        null,
        "private-agreement",
        "user-must-supply-current-copy",
        "The project-specific accepted agreement is private evidence and cannot be reconstructed from public Steam pages.",
      ));
      continue;
    }
    sources.push(sourceRequirement(
      `${channel.channel}-distribution-terms`,
      channel.channel,
      "Current distribution agreement and content policies",
      channel.termsUrl ?? null,
      channel.termsUrl ? "item-specific" : "private-agreement",
      channel.termsUrl
        ? "verify-item-specific-license"
        : "user-must-supply-current-copy",
      "Confirm the terms accepted by the publishing entity for this release channel.",
    ));
  }
  return sources;
}

function intakeGaps(input: LegalSourcePlanInput) {
  const gaps: z.infer<typeof LegalIntakeGapSchema>[] = [];
  if (!input.releaseInventoryEvidenceId) {
    gaps.push(intakeGap(
      "release-inventory-evidence",
      "releaseInventoryEvidenceId",
      "Attach a build/export inventory that identifies the engines, packages, assets, plugins, SDKs, open-source components, and generated content included in this exact release.",
    ));
  }
  if (
    input.engines.some((engine) => engine.provider === "unity" || engine.provider === "unreal")
    && !input.financialEligibilityEvidenceId
  ) {
    gaps.push(intakeGap(
      "financial-eligibility-evidence",
      "financialEligibilityEvidenceId",
      "Provide a dated, non-public evidence artifact supporting the financial facts needed to test the current engine tier, seat, or royalty rules.",
    ));
  }
  for (const [index, engine] of input.engines.entries()) {
    const path = `engines[${index}]`;
    if (!engine.licenseTier) {
      gaps.push(intakeGap(
        "engine-license-tier",
        `${path}.licenseTier`,
        `Record the plan, tier, or license route used for ${engine.provider} ${engine.version}.`,
      ));
    }
    if (!engine.termsAcceptedAt) {
      gaps.push(intakeGap(
        "engine-terms-acceptance-date",
        `${path}.termsAcceptedAt`,
        "Record when the applicable engine terms were accepted or otherwise became applicable.",
      ));
    }
    if (engine.evidenceIds.length === 0) {
      gaps.push(intakeGap(
        "engine-license-evidence",
        `${path}.evidenceIds`,
        "Attach a current terms snapshot, account entitlement, invoice, or other engine-license evidence.",
      ));
    }
    if (engine.customTermsEvidenceId === undefined && engine.licenseTier?.toLowerCase().includes("custom")) {
      gaps.push(intakeGap(
        "custom-engine-terms-evidence",
        `${path}.customTermsEvidenceId`,
        "Attach the controlling custom engine agreement; public standard terms are not a substitute.",
      ));
    }
  }
  for (const [index, material] of input.materials.entries()) {
    const path = `materials[${index}]`;
    const isRightsChainMaterial = material.source === "contractor" || material.source === "in-house";
    if (!isRightsChainMaterial && !material.licenseName) {
      gaps.push(intakeGap(
        "material-license-name",
        `${path}.licenseName`,
        `Record the license attached to ${material.materialId}.`,
      ));
    }
    if (!isRightsChainMaterial && !material.licenseUrl) {
      gaps.push(intakeGap(
        "material-license-url",
        `${path}.licenseUrl`,
        `Provide the official or contractual license location for ${material.materialId}.`,
      ));
    }
    if (!isRightsChainMaterial && !material.acquiredAt) {
      gaps.push(intakeGap(
        "material-acquisition-date",
        `${path}.acquiredAt`,
        `Record when ${material.materialId} was acquired so the applicable terms version can be identified.`,
      ));
    }
    if (material.licensee === "unknown") {
      gaps.push(intakeGap(
        "material-licensee",
        `${path}.licensee`,
        `Identify whether ${material.materialId} was licensed to an individual, studio, or client without recording personal identifiers.`,
      ));
    }
    if (!isRightsChainMaterial && material.evidenceIds.length === 0) {
      gaps.push(intakeGap(
        "material-license-evidence",
        `${path}.evidenceIds`,
        `Attach the receipt, entitlement, item page, license snapshot, or rights document for ${material.materialId}.`,
      ));
    }
    if (
      isRightsChainMaterial
      && material.evidenceIds.length === 0
    ) {
      gaps.push(intakeGap(
        "authorship-rights-evidence",
        `${path}.evidenceIds`,
        `Attach the agreement or policy supporting the project's rights in ${material.materialId}; authorship alone is not a recorded rights chain.`,
      ));
    }
    if (material.uses.includes("source-distribution") && material.evidenceIds.length === 0) {
      gaps.push(intakeGap(
        "source-redistribution-rights",
        `${path}.evidenceIds`,
        `Attach evidence that ${material.materialId} may be distributed in source or extractable form.`,
      ));
    }
  }
  for (const [index, channel] of input.distributionChannels.entries()) {
    if (!channel.agreementEvidenceId) {
      gaps.push(intakeGap(
        "distribution-agreement-evidence",
        `distributionChannels[${index}].agreementEvidenceId`,
        `Attach the agreement accepted by the publishing entity for ${channel.channel}.`,
      ));
    }
  }
  return gaps;
}

export function buildLegalSourcePlan(
  input: z.input<typeof LegalSourcePlanInputSchema>,
  now = new Date(),
): FetchResult<LegalSourcePlan> & {meta: {observedAt: string}} {
  if (Number.isNaN(now.getTime())) throw new TypeError("now must be a valid date");
  const parsed = LegalSourcePlanInputSchema.parse(input);
  const gaps = intakeGaps(parsed);
  const blockingGapCount = gaps.filter((gap) => gap.severity === "blocking").length;
  const importantGapCount = gaps.length - blockingGapCount;
  const data = LegalSourcePlanSchema.parse({
    schemaVersion: 1,
    observedAt: now.toISOString(),
    target: parsed.target,
    decision: parsed.decision,
    jurisdictions: parsed.jurisdictions,
    releaseScope: {
      releaseId: parsed.releaseId,
      releaseDescription: parsed.releaseDescription,
      plannedReleaseDate: parsed.plannedReleaseDate ?? null,
      releaseInventoryEvidenceId: parsed.releaseInventoryEvidenceId ?? null,
      financialEligibilityEvidenceId: parsed.financialEligibilityEvidenceId ?? null,
      engines: parsed.engines,
      materials: parsed.materials,
      distributionChannels: parsed.distributionChannels,
    },
    intakeSha256: createHash("sha256").update(JSON.stringify(parsed)).digest("hex"),
    sourceRequirements: [
      ...engineSources(parsed),
      ...materialSources(parsed),
      ...channelSources(parsed),
    ],
    intakeGaps: gaps,
    readiness: {
      status: blockingGapCount === 0 ? "ready-for-source-review" : "needs-input",
      blockingGapCount,
      importantGapCount,
      interpretation: blockingGapCount === 0
        ? "The intake can enter source review; no license permission or legal clearance has been established."
        : "Resolve every blocking intake gap before interpreting license permissions or release readiness.",
    },
    claimsPolicy: {
      allowed: [
        "Describe exact recorded facts, source clauses, conflicts, missing evidence, and bounded issue-spotting conclusions.",
        "Recommend a release hold or qualified-counsel review when controlling evidence is missing, conflicting, private, or jurisdiction-dependent.",
      ],
      prohibited: [
        "Do not claim attorney-client privilege, legal clearance, ownership, non-infringement, or guaranteed compliance.",
        "Do not treat marketplace summaries, search snippets, AI memory, or a public policy page as a substitute for the controlling agreement.",
      ],
    },
    nextAction: blockingGapCount === 0
      ? "Refresh every official source, read item-specific and private agreements, then produce an evidence-cited Legal Risk Card."
      : "Collect the listed intake evidence; keep unresolved items cannot-assess and do not infer permission from silence.",
  });
  return {
    data,
    warnings: [
      "This source plan is issue-spotting support, not legal advice or a legal clearance.",
      "Official terms can change; re-fetch each public source and record its effective date and accessedAt during every audit.",
      "Use qualified counsel for material, disputed, custom, private, or jurisdiction-dependent questions.",
    ],
    meta: {observedAt: data.observedAt},
  };
}
