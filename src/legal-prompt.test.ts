import {describe, expect, it} from "vitest";
import {buildLegalSourcePlan} from "./legal.js";
import {
  buildGameLegalAuditPrompt,
  resolveLegalSourcePlanEvidence,
} from "./legal-prompt.js";
import {createResultStore} from "./results.js";

const HANDLE = "00000000-0000-4000-8000-000000000001";

function sourcePlan(
  evidenceAccessMode: "metadata-only" | "redacted-artifacts" | "approved-environment"
    = "redacted-artifacts",
) {
  return buildLegalSourcePlan({
    target: "slot-and-ember",
    releaseId: "steam-build-2026-08-15",
    releaseDescription: "Commercial Steam build for Windows and macOS",
    releaseInventoryEvidenceId: "release-inventory",
    evidenceAccessMode,
    decision: "commercial-release",
    jurisdictions: ["JP"],
    financialEligibilityEvidenceId: "financial-evidence",
    engines: [{
      provider: "unreal",
      version: "5.7",
      usage: "interactive-game",
      licenseTier: "standard-eula",
      termsAcceptedAt: "2026-08-01",
      evidenceIds: ["engine-eula"],
    }],
    materials: [],
    distributionChannels: [{
      channel: "steam",
      agreementEvidenceId: "steam-agreement",
    }],
  }, new Date("2026-08-15T08:00:00.000Z"));
}

describe("game legal audit prompt", () => {
  it("resolves only an exact legal_source_plan result", () => {
    const store = createResultStore({idFactory: () => HANDLE});
    const tracked = store.remember("legal_source_plan", sourcePlan());
    const handle = tracked.meta?.resultHandle as string;

    expect(resolveLegalSourcePlanEvidence(store, handle)).toMatchObject({
      sourcePlan: {
        target: "slot-and-ember",
        releaseScope: {releaseId: "steam-build-2026-08-15"},
        readiness: {status: "ready-for-source-review"},
      },
      evidence: {
        sourceTool: "legal_source_plan",
        resultHandle: HANDLE,
        observedAt: "2026-08-15T08:00:00.000Z",
      },
    });
  });

  it("rejects handles produced by another tool", () => {
    const store = createResultStore({idFactory: () => HANDLE});
    const tracked = store.remember("steam_search", sourcePlan());

    expect(() => resolveLegalSourcePlanEvidence(
      store,
      tracked.meta?.resultHandle as string,
    )).toThrow(/must come from legal_source_plan/);
  });

  it("keeps the recipe separate from untrusted source-plan input", () => {
    const store = createResultStore({idFactory: () => HANDLE});
    const tracked = store.remember("legal_source_plan", sourcePlan());
    const context = resolveLegalSourcePlanEvidence(
      store,
      tracked.meta?.resultHandle as string,
    );
    const prompt = buildGameLegalAuditPrompt(
      "# Legal recipe\nDo the bounded review.",
      {
        sourcePlanResultHandle: HANDLE,
        evidenceArtifactIds: "engine-eula, steam-agreement, engine-eula",
        focus: "Can this exact commercial build ship?",
      },
      context,
    );

    expect(prompt).toContain("--- END REPOSITORY SKILL ---");
    expect(prompt).toContain("--- BEGIN INPUT DATA (JSON) ---");
    expect(prompt).toContain(
      '"evidenceArtifactIds": [\n    "release-inventory",\n    "financial-evidence",\n    "engine-eula",\n    "steam-agreement"',
    );
    expect(prompt).toContain('"evidenceTarget": "slot-and-ember"');
    expect(prompt).toContain('"mode": "redacted-artifacts"');
    expect(prompt).toContain('"contentAccessAllowed": true');
    expect(prompt).toContain('"fullDocumentAccessAllowed": false');
    expect(prompt).toContain('"sourceTool": "legal_source_plan"');
    expect(prompt).toContain('"releaseId": "steam-build-2026-08-15"');
    expect(prompt).toContain('"version": "5.7"');
    expect(prompt).not.toContain('"evidenceArtifactIds": "engine-eula');
  });

  it("blocks artifact content access when the intake selects metadata-only review", () => {
    const store = createResultStore({idFactory: () => HANDLE});
    const tracked = store.remember("legal_source_plan", sourcePlan("metadata-only"));
    const context = resolveLegalSourcePlanEvidence(
      store,
      tracked.meta?.resultHandle as string,
    );

    const prompt = buildGameLegalAuditPrompt(
      "# Legal recipe\nObey the evidence access policy.",
      {sourcePlanResultHandle: HANDLE},
      context,
    );

    expect(prompt).toContain('"mode": "metadata-only"');
    expect(prompt).toContain('"contentAccessAllowed": false');
    expect(prompt).toContain('"requiredHandling": "Do not call get_artifact');
  });

  it("allows full-document review only after an approved-environment declaration", () => {
    const store = createResultStore({idFactory: () => HANDLE});
    const tracked = store.remember("legal_source_plan", sourcePlan("approved-environment"));
    const context = resolveLegalSourcePlanEvidence(
      store,
      tracked.meta?.resultHandle as string,
    );

    const prompt = buildGameLegalAuditPrompt(
      "# Legal recipe\nObey the evidence access policy.",
      {sourcePlanResultHandle: HANDLE},
      context,
    );

    expect(prompt).toContain('"mode": "approved-environment"');
    expect(prompt).toContain('"contentAccessAllowed": true');
    expect(prompt).toContain('"fullDocumentAccessAllowed": true');
    expect(prompt).toContain("user-approved processing environment");
  });
});
