import {describe, expect, it} from "vitest";
import {
  AgentExperienceFeedbackInputSchema,
  buildAgentExperienceSummary,
  createAgentExperienceFeedbackRecord,
} from "./agent-feedback.js";

const NOW = new Date("2026-08-17T12:00:00.000Z");

function input(overrides: Record<string, unknown> = {}) {
  return {
    surface: "mcp" as const,
    stage: "invoke" as const,
    outcome: "confusion" as const,
    signalKey: "save-result-handle-ambiguity",
    sessionId: "session-a",
    userIntent: "Preserve the exact player-panel result.",
    task: "Save the record_player_panel result through save_result.",
    relatedTool: "save_result",
    summary: "It was unclear whether sourceTool and observedAt were required with resultHandle.",
    attemptedRecovery: "Retried with only target, id, and resultHandle.",
    guessedFields: ["sourceTool", "observedAt"],
    wouldReuse: "yes" as const,
    recommendation: "recommend" as const,
    privacyConfirmed: true as const,
    ...overrides,
  };
}

describe("agent experience feedback", () => {
  it("creates a version-bound feedback record without retaining the privacy attestation", () => {
    const record = createAgentExperienceFeedbackRecord(
      AgentExperienceFeedbackInputSchema.parse(input()),
      {
        clock: () => NOW,
        idFactory: () => "11111111-1111-4111-8111-111111111111",
        productVersion: "0.6.0",
      },
    );

    expect(record).toMatchObject({
      schemaVersion: 1,
      artifactType: "agent-experience-feedback",
      feedbackId: "11111111-1111-4111-8111-111111111111",
      product: "game-player-lens",
      productVersion: "0.6.0",
      reportedAt: NOW.toISOString(),
      surface: "mcp",
      outcome: "confusion",
      signalKey: "save-result-handle-ambiguity",
      relatedTool: "save_result",
    });
    expect(record).not.toHaveProperty("privacyConfirmed");
    expect(record.privacy).toMatch(/no raw prompt/i);
  });

  it("requires useful evidence for guesses, terminal failures, and feature requests", () => {
    expect(() => AgentExperienceFeedbackInputSchema.parse(input({
      outcome: "guess",
      guessedFields: [],
    }))).toThrow(/guessedFields/i);
    expect(() => AgentExperienceFeedbackInputSchema.parse(input({
      outcome: "gave-up",
      attemptedRecovery: undefined,
    }))).toThrow(/attemptedRecovery/i);
    expect(() => AgentExperienceFeedbackInputSchema.parse(input({
      outcome: "feature-request",
      missingCapability: undefined,
    }))).toThrow(/missingCapability/i);
  });

  it("rejects secrets, credential URLs, and absolute paths", () => {
    for (const unsafe of [
      "Authorization: Bearer abcdefghijklmnop",
      "https://user:password@example.com/private",
      "/Users/test/private/project.json",
      "C:\\Users\\test\\private.json",
    ]) {
      expect(() => AgentExperienceFeedbackInputSchema.parse(input({summary: unsafe})))
        .toThrow(/sensitive/i);
    }
  });

  it("promotes friction with distinct session IDs but never authorizes an issue or PR", () => {
    const reports = [
      createAgentExperienceFeedbackRecord(
        AgentExperienceFeedbackInputSchema.parse(input()),
        {
          clock: () => NOW,
          idFactory: () => "11111111-1111-4111-8111-111111111111",
          productVersion: "0.6.0",
        },
      ),
      createAgentExperienceFeedbackRecord(
        AgentExperienceFeedbackInputSchema.parse(input({
          sessionId: "session-b",
          outcome: "gave-up",
          summary: "The agent stopped because the exact-save parameter combination remained unclear.",
          guessedFields: [],
        })),
        {
          clock: () => new Date("2026-08-17T12:05:00.000Z"),
          idFactory: () => "22222222-2222-4222-8222-222222222222",
          productVersion: "0.6.0",
        },
      ),
      createAgentExperienceFeedbackRecord(
        AgentExperienceFeedbackInputSchema.parse(input({
          sessionId: "session-c",
          outcome: "success",
          signalKey: "doctor-zero-clone-onboarding",
          stage: "connect",
          relatedTool: undefined,
          summary: "The doctor command made readiness clear before MCP registration.",
          attemptedRecovery: undefined,
          guessedFields: [],
        })),
        {
          clock: () => new Date("2026-08-17T12:10:00.000Z"),
          idFactory: () => "33333333-3333-4333-8333-333333333333",
          productVersion: "0.6.0",
        },
      ),
    ];

    const summary = buildAgentExperienceSummary(reports);

    expect(summary.reportCount).toBe(3);
    expect(summary.outcomeCounts).toMatchObject({confusion: 1, "gave-up": 1, success: 1});
    expect(summary.issueCandidates).toEqual([
      expect.objectContaining({
        signalKey: "save-result-handle-ambiguity",
        reportCount: 2,
        distinctSessionCount: 2,
        productVersions: ["0.6.0"],
        readyForIssueDraft: true,
        requiresUserApproval: true,
        automaticPullRequestAllowed: false,
      }),
    ]);
  });

  it("does not promote repeated reports from one session", () => {
    const reports = ["1", "2", "3"].map((suffix, index) =>
      createAgentExperienceFeedbackRecord(
        AgentExperienceFeedbackInputSchema.parse(input()),
        {
          clock: () => new Date(NOW.getTime() + index * 1_000),
          idFactory: () => `${suffix.repeat(8)}-${suffix.repeat(4)}-4${suffix.repeat(3)}-8${suffix.repeat(3)}-${suffix.repeat(12)}`,
          productVersion: "0.6.0",
        },
      ));

    expect(buildAgentExperienceSummary(reports).issueCandidates[0]).toMatchObject({
      reportCount: 3,
      distinctSessionCount: 1,
      readyForIssueDraft: false,
      blockedReason: "needs feedback carrying at least two distinct pseudonymous session IDs",
    });
  });
});
