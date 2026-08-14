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
      nextAction: "Repair the declared blockers, produce a new playable build, and then run play-build.",
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
});
