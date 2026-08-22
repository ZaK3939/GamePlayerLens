import {z} from "zod";

const MAX_KNOWN_BLOCKERS = 10;
const MAX_BLOCKER_LENGTH = 500;

export function normalizeKnownBlockers(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const blockers = value
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/^[-*]\s+/u, "").replace(/\s+/gu, " ").trim())
    .filter(Boolean);
  if (blockers.length > MAX_KNOWN_BLOCKERS) {
    throw new TypeError(`knownBlockers must contain at most ${MAX_KNOWN_BLOCKERS} lines`);
  }
  if (blockers.some((blocker) => blocker.length > MAX_BLOCKER_LENGTH)) {
    throw new TypeError(`each known blocker must be at most ${MAX_BLOCKER_LENGTH} characters`);
  }
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = blocker.normalize("NFKC").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const KnownBlockersTextSchema = z.string().max(10_000).transform(
  (value, context) => {
    try {
      return normalizeKnownBlockers(value).join("\n");
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "knownBlockers are invalid",
      });
      return z.NEVER;
    }
  },
);

export type RequestedDevelopmentWorkflow =
  | "improve-build"
  | "play-build"
  | "review-change"
  | "audit-project";

export function routeDevelopmentWorkflow(input: {
  requestedWorkflow: RequestedDevelopmentWorkflow;
  knownBlockers: readonly string[];
}) {
  if (input.knownBlockers.length > 0) {
    const reentryWorkflow = input.requestedWorkflow === "improve-build"
      ? "improve-build"
      : "play-build";
    return {
      route: "repair-first" as const,
      reason: "A declared execution blocker already prevents a useful player probe.",
      nextAction: `Repair only the first declared blocker, produce a new playable build, and then run ${reentryWorkflow}.`,
      reentryCondition: "A new build can execute the bounded player task without the declared blockers.",
      allowedActions: [
        "inspect-declared-blockers",
        "repair-build",
        "run-focused-regression",
      ] as const,
      blockedActions: [
        "operate-build",
        "steam-research",
        "persona-derivation",
        "full-audit",
        "artifact-save",
      ] as const,
    };
  }
  if (input.requestedWorkflow === "improve-build") {
    return {
      route: "improve-build" as const,
      reason: "No execution blocker was declared, so one bounded behavior can be operated, changed, and replayed.",
      nextAction: "Operate the baseline, change one player-facing variable, run focused checks, and replay the same task.",
      reentryCondition: "The candidate is classified as improved, unchanged, regressed, or blocked.",
      allowedActions: [
        "inspect-current-repository",
        "operate-baseline",
        "edit-one-player-facing-variable",
        "run-focused-checks",
        "replay-same-task",
      ] as const,
      blockedActions: [
        "dependency-change",
        "commit-or-push",
        "steam-research",
        "persona-derivation",
        "full-audit",
        "second-improvement-attempt",
      ] as const,
    };
  }
  if (input.requestedWorkflow === "play-build") {
    return {
      route: "play-build" as const,
      reason: "No execution blocker was declared, so the next useful evidence comes from operating one bounded task.",
      nextAction: "Operate the declared build task and return an observation-first Player Probe Card.",
      reentryCondition: "The bounded task has an observed outcome or a concrete operation blocker.",
      allowedActions: [
        "operate-build",
        "read-explicit-personas",
        "capture-observations",
      ] as const,
      blockedActions: [
        "steam-research",
        "persona-derivation",
        "full-audit",
        "mandatory-artifact-save",
      ] as const,
    };
  }
  return {
    route: input.requestedWorkflow,
    reason: input.requestedWorkflow === "review-change"
      ? "A bounded current-to-candidate revision is ready for comparison."
      : "No declared execution blocker prevents milestone review.",
    nextAction: input.requestedWorkflow === "review-change"
      ? "Review the bounded revision with matched current and candidate evidence."
      : "Run the selected milestone evidence workflow.",
    reentryCondition: input.requestedWorkflow === "review-change"
      ? "The candidate decision is accepted, rejected, or returned for a smaller validation."
      : "The milestone decision and its revisit condition are recorded.",
    allowedActions: input.requestedWorkflow === "review-change"
      ? ["compare-revisions", "read-bound-evidence", "save-review-run"] as const
      : ["collect-selected-evidence", "run-player-lenses", "save-review-run"] as const,
    blockedActions: [] as const,
  };
}
