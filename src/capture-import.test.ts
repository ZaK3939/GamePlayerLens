import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import sharp from "sharp";
import {describe, expect, it} from "vitest";
import {
  createCaptureImportService,
  resolveCaptureImportRoot,
} from "./capture-import.js";
import {createImageService} from "./images.js";
import {sha256} from "./integrity.js";
import {initializePackagedPaths} from "./paths.js";

const NOW = new Date("2026-08-17T15:00:00.000Z");
const PNG = await sharp({
  create: {
    width: 1,
    height: 1,
    channels: 4,
    background: {r: 255, g: 96, b: 32, alpha: 1},
  },
}).png().toBuffer();
const JPEG = await sharp(PNG).jpeg().toBuffer();

async function withTempRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "game-player-lens-capture-import-"));
  try {
    await mkdir(root, {recursive: true});
    await run(root);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
}

describe("local capture import", () => {
  it("uses an explicit absolute project root and rejects relative configuration", () => {
    const configured = resolve("project-fixture");
    expect(resolveCaptureImportRoot({GAME_PLAYER_LENS_PROJECT_ROOT: configured}, "/elsewhere"))
      .toBe(configured);
    expect(resolveCaptureImportRoot({}, configured)).toBe(configured);
    expect(() => resolveCaptureImportRoot({GAME_PLAYER_LENS_PROJECT_ROOT: "relative"}))
      .toThrow(/absolute/i);
  });

  it("publishes base64 PNG evidence as an immutable capture", async () => {
    await withTempRoot(async (root) => {
      const resolver = initializePackagedPaths(process.cwd(), root);
      const service = createCaptureImportService({
        resolver,
        projectRoot: root,
        imageService: createImageService(resolver),
        clock: () => NOW,
      });

      const result = await service({
        id: "freeze-after-70-seconds",
        source: {
          kind: "base64",
          mimeType: "image/png",
          data: PNG.toString("base64"),
        },
      });

      expect(result.data).toMatchObject({
        artifactType: "capture",
        id: "freeze-after-70-seconds",
        kind: "capture",
        mimeType: "image/png",
        sizeBytes: PNG.length,
        width: 1,
        height: 1,
        savedAt: NOW.toISOString(),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        evidenceReference: {kind: "capture", id: "freeze-after-70-seconds"},
        source: {kind: "base64"},
      });
      expect(result.imageContent?.data).toBe(PNG.toString("base64"));
      await expect(readFile(
        resolver.resolveCaptureManifestPath("freeze-after-70-seconds").absolutePath,
        "utf8",
      )).resolves.toContain('"artifactType":"capture-manifest"');
      await expect(writeFile(
        resolver.resolveCaptureReadPath("freeze-after-70-seconds").absolutePath,
        Buffer.from("replacement"),
        {flag: "wx"},
      )).rejects.toMatchObject({code: "EEXIST"});
    });
  });

  it("imports a relative project JPEG without exposing the project path", async () => {
    await withTempRoot(async (root) => {
      const resolver = initializePackagedPaths(process.cwd(), join(root, "data"));
      const projectRoot = join(root, "project");
      await mkdir(projectRoot, {recursive: true});
      await writeFile(join(projectRoot, "freeze.jpg"), JPEG, {flag: "wx"});
      const service = createCaptureImportService({
        resolver,
        projectRoot,
        imageService: createImageService(resolver),
        clock: () => NOW,
      });

      const result = await service({
        id: "freeze-frame",
        source: {kind: "project-file", relativePath: "freeze.jpg"},
      });

      expect(result.data).toMatchObject({
        id: "freeze-frame",
        mimeType: "image/jpeg",
        source: {kind: "project-file", fileName: "freeze.jpg"},
      });
      expect(JSON.stringify(result)).not.toContain(projectRoot);
      expect(result.imageContent?.data).toBe(JPEG.toString("base64"));
    });
  });

  it.each([
    "/tmp/private.png",
    "../private.png",
    "screens/../../private.png",
    "C:\\Users\\person\\private.png",
  ])("rejects unsafe project paths: %s", async (relativePath) => {
    await withTempRoot(async (root) => {
      const resolver = initializePackagedPaths(process.cwd(), join(root, "data"));
      const service = createCaptureImportService({
        resolver,
        projectRoot: root,
        imageService: createImageService(resolver),
      });

      await expect(service({
        id: "unsafe",
        source: {kind: "project-file", relativePath},
      })).rejects.toThrow(/relative path|project root/i);
    });
  });

  it("rejects symlinks and invalid image signatures", async () => {
    await withTempRoot(async (root) => {
      const resolver = initializePackagedPaths(process.cwd(), join(root, "data"));
      const actual = join(root, "actual.png");
      const linked = join(root, "linked.png");
      await writeFile(actual, PNG, {flag: "wx"});
      await symlink(actual, linked);
      const service = createCaptureImportService({
        resolver,
        projectRoot: root,
        imageService: createImageService(resolver),
      });

      await expect(service({
        id: "linked",
        source: {kind: "project-file", relativePath: "linked.png"},
      })).rejects.toThrow(/symlink/i);
      await expect(service({
        id: "invalid",
        source: {
          kind: "base64",
          mimeType: "image/png",
          data: Buffer.from("not-a-png").toString("base64"),
        },
      })).rejects.toThrow(/PNG signature/i);
      await expect(service({
        id: "truncated",
        source: {
          kind: "base64",
          mimeType: "image/png",
          data: Buffer.concat([
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
            Buffer.from("not-decodable"),
          ]).toString("base64"),
        },
      })).rejects.toThrow(/could not be decoded/i);
    });
  });

  it("does not expose the project root when a relative source is missing", async () => {
    await withTempRoot(async (root) => {
      const resolver = initializePackagedPaths(process.cwd(), join(root, "data"));
      const projectRoot = join(root, "private-project");
      await mkdir(projectRoot, {recursive: true});
      const service = createCaptureImportService({
        resolver,
        projectRoot,
        imageService: createImageService(resolver),
      });

      let message = "";
      try {
        await service({
          id: "missing",
          source: {kind: "project-file", relativePath: "captures/missing.png"},
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toMatch(/capture source does not exist/i);
      expect(message).toContain("captures/missing.png");
      expect(message).not.toContain(projectRoot);
    });
  });

  it("rejects a second import with the same capture ID", async () => {
    await withTempRoot(async (root) => {
      const resolver = initializePackagedPaths(process.cwd(), root);
      const service = createCaptureImportService({
        resolver,
        projectRoot: root,
        imageService: createImageService(resolver),
      });
      const input = {
        id: "immutable-frame",
        source: {
          kind: "base64" as const,
          mimeType: "image/png" as const,
          data: PNG.toString("base64"),
        },
      };

      await service(input);
      await expect(service(input)).rejects.toThrow(/capture already exists/i);
      await expect(service({
        id: input.id,
        source: {
          kind: "base64",
          mimeType: "image/jpeg",
          data: JPEG.toString("base64"),
        },
      })).rejects.toThrow(/capture already exists/i);
    });
  });

  it("publishes only one extension when independent services race for one ID", async () => {
    await withTempRoot(async (root) => {
      const resolver = initializePackagedPaths(process.cwd(), root);
      const imageService = createImageService(resolver);
      const serviceA = createCaptureImportService({
        resolver,
        projectRoot: root,
        imageService,
      });
      const serviceB = createCaptureImportService({
        resolver,
        projectRoot: root,
        imageService,
      });

      const results = await Promise.allSettled([
        serviceA({
          id: "one-logical-capture",
          source: {
            kind: "base64",
            mimeType: "image/png",
            data: PNG.toString("base64"),
          },
        }),
        serviceB({
          id: "one-logical-capture",
          source: {
            kind: "base64",
            mimeType: "image/jpeg",
            data: JPEG.toString("base64"),
          },
        }),
      ]);

      expect(results.filter(({status}) => status === "fulfilled")).toHaveLength(1);
      expect(results.filter(({status}) => status === "rejected")).toHaveLength(1);
      await expect(imageService.readImage("capture", "one-logical-capture"))
        .resolves.toMatchObject({data: {id: "one-logical-capture"}});
    });
  });

  it("rejects capture bytes changed after immutable manifest publication", async () => {
    await withTempRoot(async (root) => {
      const resolver = initializePackagedPaths(process.cwd(), root);
      const imageService = createImageService(resolver);
      const service = createCaptureImportService({
        resolver,
        projectRoot: root,
        imageService,
      });
      await service({
        id: "tamper-evidence",
        source: {
          kind: "base64",
          mimeType: "image/png",
          data: PNG.toString("base64"),
        },
      });
      await writeFile(
        resolver.resolveCaptureReadPath("tamper-evidence", "png").absolutePath,
        Buffer.concat([PNG, Buffer.from("changed")]),
      );

      await expect(imageService.readImage("capture", "tamper-evidence"))
        .rejects.toThrow(/immutable manifest/i);
    });
  });

  it("resumes an interrupted manifest-first publication only for identical input", async () => {
    await withTempRoot(async (root) => {
      const resolver = initializePackagedPaths(process.cwd(), root);
      const interruptedAt = "2026-08-17T14:59:00.000Z";
      await writeFile(
        resolver.resolveCaptureManifestPath("interrupted-capture").absolutePath,
        `${JSON.stringify({
          schemaVersion: 1,
          artifactType: "capture-manifest",
          id: "interrupted-capture",
          extension: "png",
          mimeType: "image/png",
          sizeBytes: PNG.length,
          width: 1,
          height: 1,
          sha256: sha256(PNG),
          savedAt: interruptedAt,
          source: {kind: "base64"},
        })}\n`,
      );
      const service = createCaptureImportService({
        resolver,
        projectRoot: root,
        imageService: createImageService(resolver),
        clock: () => NOW,
      });

      const result = await service({
        id: "interrupted-capture",
        source: {
          kind: "base64",
          mimeType: "image/png",
          data: PNG.toString("base64"),
        },
      });

      expect(result.data).toMatchObject({savedAt: interruptedAt, sha256: sha256(PNG)});
      expect(result.warnings).toContain(
        "recovered an interrupted capture publication for the same bytes",
      );
    });
  });
});
