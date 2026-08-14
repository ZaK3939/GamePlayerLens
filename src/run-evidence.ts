import {relative, sep} from "node:path";
import {z} from "zod";
import {
  IntelRecordSchema,
  MAX_EVALUATION_BYTES,
  MAX_INTEL_PAYLOAD_BYTES,
} from "./artifacts.js";
import {assertCanonicalEvaluationMarkdown} from "./evaluation-markdown.js";
import {MAX_INLINE_IMAGE_BYTES} from "./images.js";
import {sha256} from "./integrity.js";
import type {SubjectKind} from "./project-brief.js";
import {compileGameReviewRecipe} from "./run-recipe.js";
import {PersonaSchema, type Persona} from "./persona-schemas.js";
import {
  EvidenceReferenceInputSchema,
  ResolvedEvidenceSchema,
  ResolvedPersonaSchema,
  RUN_RECIPE_ID,
  type SimulationDomain,
  type RunRecord,
} from "./run-schemas.js";
import type {PathResolver, ResolvedImagePath} from "./paths.js";

const MAX_PERSONA_BYTES = 512 * 1024;
const MAX_RECIPE_BYTES = 512 * 1024;
const MAX_STORED_INTEL_BYTES = 4 * MAX_INTEL_PAYLOAD_BYTES;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

export interface ResolvedEvidenceResult {
  record: z.infer<typeof ResolvedEvidenceSchema>;
  payload?: unknown;
  evaluationDomains?: string[];
}

export interface ResolvedPersonaResult {
  record: z.infer<typeof ResolvedPersonaSchema>;
  persona: Persona;
}

export interface RunEvidenceResolver {
  resolveEvidence(
    input: z.infer<typeof EvidenceReferenceInputSchema>,
  ): Promise<ResolvedEvidenceResult>;
  resolvePersonas(
    ids: string[],
  ): Promise<ResolvedPersonaResult[]>;
  resolveRecipe(
    subjectKind: SubjectKind,
    selectedDomains: readonly SimulationDomain[],
  ): Promise<RunRecord["recipe"]>;
}

export type ReadRegularBytes = (
  absolutePath: string,
  maxBytes: number,
) => Promise<{bytes: Buffer}>;

function isNodeError(error: unknown, code: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === code) return true;
    current = current.cause;
  }
  return false;
}

function relativeAssetPath(resolver: PathResolver, absolutePath: string): string {
  return relative(resolver.assetRoot, absolutePath).split(sep).join("/");
}

function evaluationId(id: string): {date: string; topic: string} {
  const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(id);
  if (!match?.[1] || !match[2]) throw new Error("invalid evaluation artifact id");
  return {date: match[1], topic: match[2]};
}

function experimentArtifactType(
  payload: unknown,
): "experiment-spec" | "experiment-measurement" | "experiment-outcome" | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const artifactType = (payload as Record<string, unknown>).artifactType;
  return artifactType === "experiment-spec"
    || artifactType === "experiment-measurement"
    || artifactType === "experiment-outcome"
    ? artifactType
    : undefined;
}

export function createRunEvidenceResolver(
  resolver: PathResolver,
  readRegularBytes: ReadRegularBytes,
): RunEvidenceResolver {
  function verifyImageSignature(resolved: ResolvedImagePath, bytes: Buffer): void {
    const signature = resolved.relativePath.endsWith(".jpg")
      ? JPEG_SIGNATURE
      : PNG_SIGNATURE;
    if (!bytes.subarray(0, signature.length).equals(signature)) {
      throw new Error("run image evidence has an invalid signature");
    }
  }

  async function resolveCapture(id: string): Promise<{
    resolved: ResolvedImagePath;
    bytes: Buffer;
  }> {
    const found: Array<{resolved: ResolvedImagePath; bytes: Buffer}> = [];
    for (const extension of ["png", "jpg"] as const) {
      const resolved = resolver.resolveCaptureReadPath(id, extension);
      try {
        const {bytes} = await readRegularBytes(
          resolved.absolutePath,
          MAX_INLINE_IMAGE_BYTES,
        );
        verifyImageSignature(resolved, bytes);
        found.push({resolved, bytes});
      } catch (error) {
        if (!isNodeError(error, "ENOENT")) throw error;
      }
    }
    if (found.length > 1) throw new Error("ambiguous capture evidence id");
    if (found.length < 1) throw new Error("capture evidence does not exist");
    return found[0]!;
  }

  async function resolveEvidence(
    input: z.infer<typeof EvidenceReferenceInputSchema>,
  ): Promise<ResolvedEvidenceResult> {
    if (input.kind === "intel") {
      const resolved = resolver.resolveIntelArtifactPath(input.target, input.id);
      const {bytes} = await readRegularBytes(
        resolved.absolutePath,
        MAX_STORED_INTEL_BYTES,
      );
      const record = IntelRecordSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
      if (
        record.targetId !== resolved.targetId
        || record.artifactId !== resolved.artifactId
      ) {
        throw new Error("intel evidence does not match its path");
      }
      const artifactType = experimentArtifactType(record.payload);
      return {
        record: ResolvedEvidenceSchema.parse({
          ref: input.ref,
          kind: input.kind,
          targetId: resolved.targetId,
          id: resolved.artifactId,
          path: resolved.relativePath,
          sha256: sha256(bytes),
          sourceTool: record.sourceTool,
          observedAt: record.observedAt,
          savedAt: record.savedAt,
          ...(artifactType ? {artifactType} : {}),
        }),
        payload: record.payload,
      };
    }
    if (input.kind === "evaluation") {
      const parsed = evaluationId(input.id);
      const resolved = resolver.resolveEvaluationPath(input.target, parsed.date, parsed.topic);
      const {bytes} = await readRegularBytes(
        resolved.absolutePath,
        MAX_EVALUATION_BYTES,
      );
      const evaluation = assertCanonicalEvaluationMarkdown(bytes.toString("utf8"));
      return {record: ResolvedEvidenceSchema.parse({
        ref: input.ref,
        kind: input.kind,
        targetId: resolved.targetId,
        id: `${parsed.date}-${resolved.topicId}`,
        path: resolved.relativePath,
        sha256: sha256(bytes),
        indieStrategyMode: evaluation.indieStrategyMode,
      }), evaluationDomains: evaluation.selectedDomains};
    }
    if (input.kind === "capture") {
      const {resolved, bytes} = await resolveCapture(input.id);
      return {record: ResolvedEvidenceSchema.parse({
        ref: input.ref,
        kind: input.kind,
        id: resolved.id,
        path: resolved.relativePath,
        sha256: sha256(bytes),
      })};
    }
    const resolved = resolver.resolveUiReferencePath(input.id);
    const {bytes} = await readRegularBytes(
      resolved.absolutePath,
      MAX_INLINE_IMAGE_BYTES,
    );
    verifyImageSignature(resolved, bytes);
    return {record: ResolvedEvidenceSchema.parse({
      ref: input.ref,
      kind: input.kind,
      id: resolved.id,
      path: resolved.relativePath,
      sha256: sha256(bytes),
    })};
  }

  async function resolvePersonas(ids: string[]): Promise<ResolvedPersonaResult[]> {
    const personas: ResolvedPersonaResult[] = [];
    for (const id of ids) {
      const path = resolver.resolvePersonaPath(id);
      const {bytes} = await readRegularBytes(path, MAX_PERSONA_BYTES);
      const parsed = PersonaSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
      if (parsed.id !== id) throw new Error("persona evidence does not match its path");
      personas.push({
        record: ResolvedPersonaSchema.parse({
          id: parsed.id,
          path: relative(resolver.root, path).split(sep).join("/"),
          sha256: sha256(bytes),
        }),
        persona: parsed,
      });
    }
    return personas;
  }

  async function resolveRecipe(
    subjectKind: SubjectKind,
    selectedDomains: readonly SimulationDomain[],
  ): Promise<RunRecord["recipe"]> {
    const path = resolver.resolveSkillPath(RUN_RECIPE_ID);
    const {bytes} = await readRegularBytes(path, MAX_RECIPE_BYTES);
    const relativePath = relativeAssetPath(resolver, path);
    if (relativePath !== "skills/game-review.md") {
      throw new Error("run recipe is outside the configured asset root");
    }
    const compiled = compileGameReviewRecipe(bytes.toString("utf8"), {
      subjectKind,
      selectedDomains,
    });
    return {
      id: RUN_RECIPE_ID,
      path: relativePath,
      sha256: sha256(Buffer.from(compiled, "utf8")),
    };
  }

  return {resolveEvidence, resolvePersonas, resolveRecipe};
}
