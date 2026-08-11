import {z} from "zod";

const DOMAIN_ORDER = [
  "gameplay",
  "storefront",
  "ui",
  "price",
  "localization",
  "competition",
] as const;
const DOMAIN_VALUES = new Set<string>(DOMAIN_ORDER);

const NonEmptyTrimmedStringSchema = z.string().trim().min(1);

const DomainsSchema = z.string().transform((input, context) => {
  const domains = input.split(",").map((domain) => domain.trim()).filter(Boolean);
  const unknown = domains.filter((domain) => domain !== "auto" && !DOMAIN_VALUES.has(domain));
  if (domains.length === 0 || unknown.length > 0) {
    context.addIssue({
      code: "custom",
      message: unknown.length > 0
        ? `Unknown domains: ${[...new Set(unknown)].join(", ")}`
        : "At least one domain is required",
    });
    return z.NEVER;
  }
  if (domains.includes("auto")) {
    if (domains.some((domain) => domain !== "auto")) {
      context.addIssue({
        code: "custom",
        message: "auto cannot be mixed with explicit domains",
      });
      return z.NEVER;
    }
    return "auto";
  }

  const selected = new Set(domains);
  return DOMAIN_ORDER.filter((domain) => selected.has(domain)).join(",");
});

const ReferenceImageIdsSchema = z.string().transform((input, context) => {
  const imageIds = [...new Set(
    input.split(",").map((imageId) => imageId.trim()).filter(Boolean),
  )];
  if (imageIds.length === 0) {
    context.addIssue({code: "custom", message: "At least one reference image ID is required"});
    return z.NEVER;
  }
  return imageIds.join(",");
});

export const RunSimPromptArgumentsSchema = z.object({
  target: NonEmptyTrimmedStringSchema.describe("Game or proposal to evaluate"),
  topic: NonEmptyTrimmedStringSchema.describe("Consultation topic"),
  mode: z.enum(["baseline", "change"]).default("baseline"),
  domains: DomainsSchema.default("auto"),
  specification: z.string().max(50_000).optional(),
  uiUrl: z.string().optional(),
  currentState: z.string().optional(),
  proposal: z.string().optional(),
  competitors: z.string().optional(),
  market: z.string().optional(),
  language: z.string().optional(),
  qualityTier: z.string().optional(),
});

export const UiBlindComparePromptArgumentsSchema = z.object({
  targetImageId: NonEmptyTrimmedStringSchema,
  referenceImageIds: ReferenceImageIdsSchema,
  context: z.string().optional(),
  qualityTier: z.string().optional(),
});

export type RunSimPromptArguments = z.input<typeof RunSimPromptArgumentsSchema>;
export type UiBlindComparePromptArguments = z.input<typeof UiBlindComparePromptArgumentsSchema>;

function appendSerializedInput(recipe: string, data: Record<string, unknown>): string {
  return [
    recipe,
    "",
    "--- END REPOSITORY RECIPE ---",
    "",
    "--- BEGIN INPUT DATA (JSON) ---",
    JSON.stringify(data, null, 2),
    "--- END INPUT DATA (JSON) ---",
  ].join("\n");
}

export function buildRunSimPrompt(
  recipe: string,
  input: RunSimPromptArguments,
): string {
  const parsed = RunSimPromptArgumentsSchema.parse(input);
  const selectedDomains = parsed.domains === "auto"
    ? undefined
    : parsed.domains.split(",");
  const missingChangeInputs = parsed.mode === "change"
    ? (["currentState", "proposal"] as const).filter((field) => !parsed[field]?.trim())
    : undefined;

  return appendSerializedInput(recipe, {
    ...parsed,
    domainSelection: parsed.domains === "auto" ? "auto" : "explicit",
    selectedDomains,
    missingChangeInputs,
  });
}

export function buildUiBlindComparePrompt(
  recipe: string,
  input: UiBlindComparePromptArguments,
): string {
  const parsed = UiBlindComparePromptArgumentsSchema.parse(input);
  const {referenceImageIds, ...rest} = parsed;
  return appendSerializedInput(recipe, {
    ...rest,
    referenceImageIds: referenceImageIds.split(","),
  });
}
