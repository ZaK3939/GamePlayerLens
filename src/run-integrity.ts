import {z} from "zod";
import {canonicalSha256} from "./integrity.js";
import type {RunEvidenceResolver} from "./run-evidence.js";
import {
  EvidenceReferenceInputSchema,
  IsoDateTimeSchema,
  RunIntegrityDependencySchema,
  RunIntegrityReportSchema,
  RunRecordCoreSchema,
  type RunIntegrityReport,
  type RunRecord,
} from "./run-schemas.js";

export type RunIntegrityAuditor = (record: RunRecord) => Promise<RunIntegrityReport>;

function isNodeError(error: unknown, code: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === code) return true;
    current = current.cause;
  }
  return false;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingError(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (isNodeError(current, "ENOENT") || /does not exist/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

export function createRunIntegrityAuditor(
  clock: () => Date,
  evidenceResolver: RunEvidenceResolver,
): RunIntegrityAuditor {
  const {resolveEvidence, resolvePersonas, resolveRecipe} = evidenceResolver;

  async function auditDependency(
    type: z.infer<typeof RunIntegrityDependencySchema>["type"],
    ref: string,
    expectedPath: string,
    expectedSha256: string,
    loadCurrent: () => Promise<{path: string; sha256: string}>,
  ): Promise<z.infer<typeof RunIntegrityDependencySchema>> {
    try {
      const current = await loadCurrent();
      const matches = current.path === expectedPath && current.sha256 === expectedSha256;
      return RunIntegrityDependencySchema.parse({
        type,
        ref,
        path: expectedPath,
        status: matches ? "verified" : "mismatch",
        expectedSha256,
        actualSha256: current.sha256,
        actualPath: current.path,
        ...(matches ? {} : {message: "stored path or SHA-256 no longer matches"}),
      });
    } catch (error) {
      return RunIntegrityDependencySchema.parse({
        type,
        ref,
        path: expectedPath,
        status: isMissingError(error) ? "missing" : "unreadable",
        expectedSha256,
        message: errorMessage(error).slice(0, 2_000),
      });
    }
  }

  async function auditRun(record: RunRecord): Promise<RunIntegrityReport> {
    const {seal, ...coreInput} = record;
    const core = RunRecordCoreSchema.parse(coreInput);
    const actualRecordSha256 = canonicalSha256(core);
    const recordStatus = seal.canonicalSha256 === actualRecordSha256
      ? "verified" as const
      : "mismatch" as const;

    const dependencies: Array<z.infer<typeof RunIntegrityDependencySchema>> = [];
    dependencies.push(await auditDependency(
      "recipe",
      record.recipe.id,
      record.recipe.path,
      record.recipe.sha256,
      async () => {
        const current = await resolveRecipe();
        return {path: current.path, sha256: current.sha256};
      },
    ));
    for (const persona of record.personas) {
      dependencies.push(await auditDependency(
        "persona",
        persona.id,
        persona.path,
        persona.sha256,
        async () => {
          const [current] = await resolvePersonas([persona.id]);
          if (!current) throw new Error("persona evidence does not exist");
          return {path: current.path, sha256: current.sha256};
        },
      ));
    }
    for (const evidence of record.evidence) {
      dependencies.push(await auditDependency(
        "evidence",
        evidence.ref,
        evidence.path,
        evidence.sha256,
        async () => {
          let input: z.infer<typeof EvidenceReferenceInputSchema>;
          if (evidence.kind === "intel" || evidence.kind === "evaluation") {
            if (!evidence.targetId) throw new Error("target-scoped evidence is missing targetId");
            input = {
              ref: evidence.ref,
              kind: evidence.kind,
              target: evidence.targetId,
              id: evidence.id,
            };
          } else {
            input = {ref: evidence.ref, kind: evidence.kind, id: evidence.id};
          }
          const current = await resolveEvidence(input);
          return {path: current.record.path, sha256: current.record.sha256};
        },
      ));
    }

    const dependencyIssues = dependencies.filter((item) => item.status !== "verified").length;
    const issueCount = dependencyIssues + (recordStatus === "verified" ? 0 : 1);
    const status = issueCount > 0 ? "failed" as const : "verified" as const;
    const checkedAt = IsoDateTimeSchema.parse(clock().toISOString());
    return RunIntegrityReportSchema.parse({
      status,
      checkedAt,
      record: {
        status: recordStatus,
        expectedSha256: seal.canonicalSha256,
        actualSha256: actualRecordSha256,
      },
      dependencies,
      verifiedCount: dependencies.length - dependencyIssues,
      issueCount,
    });
  }

  return auditRun;
}

