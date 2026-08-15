import {describe, expect, it} from "vitest";
import {
  buildLegalSourcePlan,
  LegalSourcePlanInputSchema,
} from "./legal.js";

const OBSERVED_AT = new Date("2026-08-15T08:00:00.000Z");

function completeUnrealInput() {
  return {
    target: "slot-and-ember",
    releaseId: "steam-build-2026-08-15",
    releaseDescription: "Windows and macOS commercial Steam build",
    plannedReleaseDate: "2026-09-15",
    releaseInventoryEvidenceId: "steam-build-inventory",
    evidenceAccessMode: "redacted-artifacts" as const,
    decision: "commercial-release" as const,
    jurisdictions: ["JP", "US"],
    financialEligibilityEvidenceId: "finance-eligibility-2026-q3",
    engines: [{
      provider: "unreal" as const,
      version: "5.7",
      usage: "interactive-game" as const,
      licenseTier: "standard-eula",
      termsAcceptedAt: "2026-08-01",
      evidenceIds: ["unreal-eula-snapshot"],
    }],
    materials: [{
      materialId: "forge-environment",
      category: "3d-asset" as const,
      source: "fab" as const,
      licenseName: "Fab Standard License",
      licenseUrl: "https://www.fab.com/eula",
      acquiredAt: "2026-07-01",
      licensee: "studio" as const,
      uses: ["compiled-game" as const],
      evidenceIds: ["fab-receipt", "fab-license-snapshot"],
    }],
    distributionChannels: [{
      channel: "steam" as const,
      agreementEvidenceId: "steam-distribution-agreement-snapshot",
    }],
  };
}

describe("game legal source planning", () => {
  it("routes Unreal, Fab, and Steam to distinct official and private sources", () => {
    const result = buildLegalSourcePlan(completeUnrealInput(), OBSERVED_AT);

    expect(result.data.readiness.status).toBe("ready-for-source-review");
    expect(result.data.releaseScope).toMatchObject({
      releaseId: "steam-build-2026-08-15",
      releaseDescription: "Windows and macOS commercial Steam build",
      plannedReleaseDate: "2026-09-15",
      releaseInventoryEvidenceId: "steam-build-inventory",
      evidenceAccessMode: "redacted-artifacts",
      engines: [{provider: "unreal", version: "5.7"}],
      materials: [{materialId: "forge-environment", uses: ["compiled-game"]}],
      distributionChannels: [{channel: "steam"}],
    });
    expect(result.data.sourceRequirements.map((source) => source.id)).toEqual([
      "unreal-engine-eula",
      "fab-standard-license",
      "material-forge-environment-license",
      "steam-direct-rules",
      "steam-distribution-agreement",
    ]);
    expect(result.data.sourceRequirements.at(-1)).toMatchObject({
      sourceClass: "private-agreement",
      url: null,
      retrievalStatus: "user-must-supply-current-copy",
    });
    expect(result.warnings).toContain(
      "This source plan is issue-spotting support, not legal advice or a legal clearance.",
    );
  });

  it("reports unknown Unity tier and asset rights as blocking intake gaps", () => {
    const result = buildLegalSourcePlan({
      target: "unity-demo",
      releaseId: "public-demo-1",
      releaseDescription: "Public Windows demo distributed on Steam",
      evidenceAccessMode: "metadata-only",
      decision: "demo-release",
      jurisdictions: ["JP"],
      engines: [{
        provider: "unity",
        version: "6000.3",
        usage: "interactive-game",
        evidenceIds: [],
      }],
      materials: [{
        materialId: "character-pack",
        category: "3d-asset",
        source: "unity-asset-store",
        licensee: "unknown",
        uses: ["compiled-game"],
        evidenceIds: [],
      }],
      distributionChannels: [{channel: "steam"}],
    }, OBSERVED_AT);

    expect(result.data.readiness.status).toBe("needs-input");
    expect(result.data.intakeGaps.map((gap) => gap.code)).toEqual(expect.arrayContaining([
      "financial-eligibility-evidence",
      "release-inventory-evidence",
      "engine-license-tier",
      "engine-terms-acceptance-date",
      "engine-license-evidence",
      "material-license-name",
      "material-license-url",
      "material-acquisition-date",
      "material-licensee",
      "material-license-evidence",
      "distribution-agreement-evidence",
    ]));
    expect(result.data.sourceRequirements.map((source) => source.id)).toEqual(expect.arrayContaining([
      "unity-editor-terms",
      "unity-asset-store-terms",
    ]));
  });

  it("requires rights evidence for contractor work and source redistribution", () => {
    const input = completeUnrealInput();
    input.materials = [{
      materialId: "combat-plugin",
      category: "code-plugin",
      source: "contractor",
      licenseName: "Contractor assignment",
      licenseUrl: "https://example.com/legal/contractor-license",
      acquiredAt: "2026-07-01",
      licensee: "studio",
      uses: ["source-distribution"],
      evidenceIds: [],
    }];

    const result = buildLegalSourcePlan(input, OBSERVED_AT);
    expect(result.data.intakeGaps.map((gap) => gap.code)).toEqual(expect.arrayContaining([
      "authorship-rights-evidence",
      "source-redistribution-rights",
    ]));
    expect(result.data.intakeGaps.map((gap) => gap.code)).not.toContain("material-license-url");
    expect(result.data.sourceRequirements.find(
      (source) => source.id === "material-combat-plugin-license",
    )).toMatchObject({
      sourceClass: "private-agreement",
      url: null,
      retrievalStatus: "user-must-supply-current-copy",
    });
  });

  it("rejects duplicate material IDs and credential-bearing license URLs", () => {
    const input = completeUnrealInput();
    input.materials.push({...input.materials[0]!});
    expect(() => LegalSourcePlanInputSchema.parse(input)).toThrow(/materialId values must be unique/);

    input.materials = [{
      ...input.materials[0]!,
      licenseUrl: "https://user:secret@example.com/license",
    }];
    expect(() => LegalSourcePlanInputSchema.parse(input)).toThrow(/credential-free HTTPS/);
  });

  it("requires an explicit evidence processing mode", () => {
    const {evidenceAccessMode: _, ...input} = completeUnrealInput();
    expect(() => LegalSourcePlanInputSchema.parse(input)).toThrow(/evidenceAccessMode/);
  });
});
