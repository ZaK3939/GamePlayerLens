import {describe, expect, it} from "vitest";
import {
  normalizeKnownBlockers,
  routeDevelopmentWorkflow,
} from "./workflow-routing.js";

describe("development workflow routing", () => {
  it("normalizes a bounded, deduplicated blocker list", () => {
    expect(normalizeKnownBlockers("- Broken steering\n* Missing feedback\nBroken steering"))
      .toEqual(["Broken steering", "Missing feedback"]);
  });

  it("routes declared blockers to repair before operation, research, or audit", () => {
    expect(routeDevelopmentWorkflow({
      requestedWorkflow: "audit-project",
      knownBlockers: ["Steering force is reversed"],
    })).toEqual({
      route: "repair-first",
      reason: "A declared execution blocker already prevents a useful player probe.",
      nextAction: "Repair only the first declared blocker, produce a new playable build, and then run play-build.",
      reentryCondition: "A new build can execute the bounded player task without the declared blockers.",
      allowedActions: ["inspect-declared-blockers", "repair-build", "run-focused-regression"],
      blockedActions: ["operate-build", "steam-research", "persona-derivation", "full-audit", "artifact-save"],
    });
  });

  it("keeps build operation separate from research and milestone audit", () => {
    expect(routeDevelopmentWorkflow({
      requestedWorkflow: "play-build",
      knownBlockers: [],
    })).toMatchObject({
      route: "play-build",
      allowedActions: ["operate-build", "read-explicit-personas", "capture-observations"],
      blockedActions: ["steam-research", "persona-derivation", "full-audit", "mandatory-artifact-save"],
    });
  });

  it("routes one authorized improvement separately from an observation-only probe", () => {
    expect(routeDevelopmentWorkflow({
      requestedWorkflow: "improve-build",
      knownBlockers: [],
    })).toMatchObject({
      route: "improve-build",
      allowedActions: [
        "inspect-current-repository",
        "operate-baseline",
        "edit-one-player-facing-variable",
        "run-focused-checks",
        "replay-same-task",
      ],
      blockedActions: expect.arrayContaining([
        "dependency-change",
        "commit-or-push",
        "second-improvement-attempt",
      ]),
    });
  });

  it("returns a blocked improvement to improve-build after repair", () => {
    expect(routeDevelopmentWorkflow({
      requestedWorkflow: "improve-build",
      knownBlockers: ["The build does not start"],
    })).toMatchObject({
      route: "repair-first",
      nextAction: expect.stringContaining("run improve-build"),
    });
  });
});
