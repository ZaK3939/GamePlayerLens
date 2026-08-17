import {join, resolve} from "node:path";
import {mkdtemp, readdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {describe, expect, it} from "vitest";
import {buildDoctorReport, resolveDataRoot} from "./cli.js";
import {listCliDocuments, readCliDocument} from "./cli-docs.js";
import type {PathResolver} from "./paths.js";

describe("packaged CLI data home", () => {
  it("uses an explicit absolute GAME_PLAYER_LENS_HOME", () => {
    const root = resolve("/tmp/game-player-lens-test-home");
    expect(resolveDataRoot({GAME_PLAYER_LENS_HOME: `  ${root}  `}, "/users/test"))
      .toBe(root);
  });

  it("defaults to a hidden directory in the user home", () => {
    expect(resolveDataRoot({}, "/users/test"))
      .toBe(join("/users/test", ".game-player-lens"));
  });

  it("rejects a relative GAME_PLAYER_LENS_HOME", () => {
    expect(() => resolveDataRoot({GAME_PLAYER_LENS_HOME: "relative/path"}, "/users/test"))
      .toThrow(/absolute/i);
  });

  it("reports a safe machine-readable doctor result without absolute paths", async () => {
    const resolver = {
      root: "/private/user-data/game-player-lens",
      assetRoot: "/private/package/game-player-lens",
    } as PathResolver;
    const report = await buildDoctorReport(
      resolver,
      "v24.7.0",
      {ITAD_API_KEY: "secret", OBSCURA_PATH: " /Applications/Obscura.app "},
      async () => ({
        writable: true,
        publicationReady: true,
        publicationPrimitive: "create-flush-link-read-cleanup",
      }),
    );

    expect(report).toEqual({
      ok: true,
      command: "doctor",
      node: {version: "v24.7.0", minimumMajor: 22, supported: true},
      server: {name: "game-player-lens", version: "0.6.1"},
      storage: {
        location: "external-data-home",
        instanceId: expect.stringMatching(/^storage-[a-f0-9]{16}$/),
        writable: true,
        publicationReady: true,
        publicationPrimitive: "create-flush-link-read-cleanup",
      },
      integrations: {
        itadPriceHistory: {configured: true},
        obscuraPageCapture: {configured: true},
        localCaptureImport: {
          available: true,
          projectRootConfigured: false,
          modes: ["project-file", "base64"],
        },
      },
      capabilities: {
        toolCount: 30,
        workflowToolCount: 5,
        promptShortcutCount: 5,
      },
      documentation: {
        listCommand: "game-player-lens docs list",
        showCommand: "game-player-lens docs show <name>",
      },
      nextStep: "Register the same command as an MCP server, restart the client, then call get_status.",
    });
    expect(JSON.stringify(report)).not.toContain("/private/");
    expect(JSON.stringify(report)).not.toContain("secret");
  });

  it("lists bundled agent-readable documents and reads an exact topic", async () => {
    const listing = listCliDocuments();
    expect(listing.documents).toContainEqual({
      name: "tools",
      description: expect.stringContaining("MCP tool"),
    });
    await expect(readCliDocument(resolve("."), "tools"))
      .resolves.toContain("# Tool reference");
    await expect(readCliDocument(resolve("."), "missing"))
      .rejects.toThrow(/docs list/i);
  });

  it("fails doctor readiness for an unsupported Node release or unwritable storage", async () => {
    const resolver = {root: "/data", assetRoot: "/package"} as PathResolver;
    const report = await buildDoctorReport(resolver, "v20.19.0", {}, async () => ({
      writable: false,
      publicationReady: false,
      publicationPrimitive: "create-flush-link-read-cleanup",
      readinessIssue: "unwritable",
    }));

    expect(report.ok).toBe(false);
    expect(report.node.supported).toBe(false);
    expect(report.storage.writable).toBe(false);
    expect(report.nextStep).toMatch(/Node\.js 22/i);
  });

  it("fails doctor when atomic publication is unavailable on a writable path", async () => {
    const resolver = {root: "/data", assetRoot: "/package"} as PathResolver;
    const report = await buildDoctorReport(resolver, "v22.19.0", {}, async () => ({
      writable: true,
      publicationReady: false,
      publicationPrimitive: "create-flush-link-read-cleanup",
      readinessIssue: "publication-failed",
    }));

    expect(report.ok).toBe(false);
    expect(report.nextStep).toMatch(/hard-link publication/i);
    expect(JSON.stringify(report)).not.toContain("/data");
  });

  it("proves the real create-only publication primitive and removes its probe", async () => {
    const root = await mkdtemp(join(tmpdir(), "game-player-lens-doctor-"));
    try {
      const report = await buildDoctorReport(
        {root, assetRoot: root} as PathResolver,
        "v22.19.0",
        {},
      );

      expect(report.ok).toBe(true);
      expect(report.storage).toMatchObject({
        writable: true,
        publicationReady: true,
        publicationPrimitive: "create-flush-link-read-cleanup",
      });
      expect(await readdir(root)).toEqual([]);
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });
});
