import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  MAX_INLINE_IMAGE_BYTES,
  createImageService,
} from "./images.js";
import {createPathResolver} from "./paths.js";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const roots: string[] = [];

function pngBytes(size = PNG_SIGNATURE.length): Buffer {
  const bytes = Buffer.alloc(size);
  PNG_SIGNATURE.copy(bytes);
  return bytes;
}

async function tempResolver() {
  const root = await mkdtemp(join(tmpdir(), "steam-user-sim-images-"));
  roots.push(root);
  await mkdir(join(root, "knowledge", "intel", "captures"), {recursive: true});
  await mkdir(join(root, "knowledge", "ui-references"), {recursive: true});
  return createPathResolver(root);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("image content", () => {
  it("returns MCP ImageContent for a PNG exactly at the 6 MiB boundary", async () => {
    const resolver = await tempResolver();
    const resolved = resolver.resolveCaptureReadPath("Boundary Image");
    const bytes = pngBytes(MAX_INLINE_IMAGE_BYTES);
    await writeFile(resolved.absolutePath, bytes);
    const encodeBase64 = vi.fn((value: Buffer) => value.toString("base64"));
    const images = createImageService(resolver, {encodeBase64});

    const result = await images.readImage("capture", "Boundary Image");

    expect(result).toEqual({
      data: {
        id: "boundary-image",
        kind: "capture",
        relativePath: "knowledge/intel/captures/boundary-image.png",
        mimeType: "image/png",
        sizeBytes: MAX_INLINE_IMAGE_BYTES,
        modifiedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        imageIncluded: true,
      },
      warnings: [],
      imageContent: {
        type: "image",
        data: bytes.toString("base64"),
        mimeType: "image/png",
      },
    });
    expect(result.data).not.toHaveProperty("imageContent");
    expect(encodeBase64).toHaveBeenCalledOnce();
  });

  it("rejects a .png whose eight-byte signature is invalid", async () => {
    const resolver = await tempResolver();
    const resolved = resolver.resolveUiReferencePath("Not Really PNG");
    await writeFile(resolved.absolutePath, Buffer.from("not a png"));
    const images = createImageService(resolver);

    await expect(images.readImage("ui-reference", "Not Really PNG"))
      .rejects.toThrow(/PNG signature/i);
  });

  it("returns MCP ImageContent for a JPEG capture", async () => {
    const resolver = await tempResolver();
    const resolved = resolver.resolveCaptureReadPath("Store Hero", "jpg");
    await writeFile(resolved.absolutePath, JPEG_BYTES);
    const images = createImageService(resolver);

    const result = await images.readImage("capture", "Store Hero");

    expect(result).toEqual({
      data: {
        id: "store-hero",
        kind: "capture",
        relativePath: "knowledge/intel/captures/store-hero.jpg",
        mimeType: "image/jpeg",
        sizeBytes: JPEG_BYTES.length,
        modifiedAt: expect.any(String),
        imageIncluded: true,
      },
      warnings: [],
      imageContent: {
        type: "image",
        data: JPEG_BYTES.toString("base64"),
        mimeType: "image/jpeg",
      },
    });
  });

  it("rejects invalid JPEG signatures and ambiguous capture ids", async () => {
    const resolver = await tempResolver();
    const invalid = resolver.resolveCaptureReadPath("Invalid JPEG", "jpg");
    await writeFile(invalid.absolutePath, Buffer.from("not a jpeg"));
    const images = createImageService(resolver);
    await expect(images.readImage("capture", "Invalid JPEG"))
      .rejects.toThrow(/JPEG signature/i);

    await writeFile(resolver.resolveCaptureReadPath("Duplicate").absolutePath, pngBytes());
    await writeFile(
      resolver.resolveCaptureReadPath("Duplicate", "jpg").absolutePath,
      JPEG_BYTES,
    );
    await expect(images.readImage("capture", "Duplicate"))
      .rejects.toThrow(/ambiguous/i);
  });

  it("returns metadata and a warning above 6 MiB without base64 encoding", async () => {
    const resolver = await tempResolver();
    const resolved = resolver.resolveCaptureReadPath("Oversized");
    await writeFile(resolved.absolutePath, pngBytes(MAX_INLINE_IMAGE_BYTES + 1));
    const encodeBase64 = vi.fn(() => "should-not-run");
    const images = createImageService(resolver, {encodeBase64});

    const result = await images.readImage("capture", "Oversized");

    expect(result).toEqual({
      data: {
        id: "oversized",
        kind: "capture",
        relativePath: "knowledge/intel/captures/oversized.png",
        mimeType: "image/png",
        sizeBytes: MAX_INLINE_IMAGE_BYTES + 1,
        modifiedAt: expect.any(String),
        imageIncluded: false,
      },
      warnings: [expect.stringMatching(/6 MiB.*inline/i)],
    });
    expect(result).not.toHaveProperty("imageContent");
    expect(result.data).not.toHaveProperty("imageContent");
    expect(encodeBase64).not.toHaveBeenCalled();
  });
});

describe("image service roots and listing", () => {
  it("lists capture PNG/JPEG and UI-reference PNGs from separate safe roots", async () => {
    const resolver = await tempResolver();
    const capture = resolver.resolveCaptureReadPath("Game Hero");
    const reference = resolver.resolveUiReferencePath("Main Menu");
    const store = resolver.resolveCaptureReadPath("Store Shot", "jpg");
    await writeFile(capture.absolutePath, pngBytes());
    await writeFile(reference.absolutePath, pngBytes(12));
    await writeFile(store.absolutePath, JPEG_BYTES);
    const images = createImageService(resolver);

    expect(await images.listImages("capture")).toEqual([
      {
        id: "game-hero",
        kind: "capture",
        relativePath: "knowledge/intel/captures/game-hero.png",
        mimeType: "image/png",
        sizeBytes: PNG_SIGNATURE.length,
        modifiedAt: expect.any(String),
      },
      {
        id: "store-shot",
        kind: "capture",
        relativePath: "knowledge/intel/captures/store-shot.jpg",
        mimeType: "image/jpeg",
        sizeBytes: JPEG_BYTES.length,
        modifiedAt: expect.any(String),
      },
    ]);
    expect(await images.listImages("ui-reference")).toEqual([
      {
        id: "main-menu",
        kind: "ui-reference",
        relativePath: "knowledge/ui-references/main-menu.png",
        mimeType: "image/png",
        sizeBytes: 12,
        modifiedAt: expect.any(String),
      },
    ]);
    await expect(images.readImage("capture", "Main Menu")).rejects.toThrow();
    await expect(images.readImage("ui-reference", "Game Hero")).rejects.toThrow();
  });

  it("keeps list metadata-only and ignores nested, unsupported, and dotfile entries", async () => {
    const resolver = await tempResolver();
    const captureRoot = join(resolver.root, "knowledge", "intel", "captures");
    await writeFile(join(captureRoot, "valid.png"), pngBytes());
    await writeFile(join(captureRoot, "notes.txt"), pngBytes());
    await writeFile(join(captureRoot, ".hidden.png"), pngBytes());
    await mkdir(join(captureRoot, "nested"));
    await writeFile(join(captureRoot, "nested", "inside.png"), pngBytes());
    const images = createImageService(resolver);

    const listed = await images.listImages("capture");

    expect(listed.map((item) => item.id)).toEqual(["valid"]);
    expect(listed.every((item) => !("imageContent" in item))).toBe(true);
  });

  it("rejects visible symlinks while listing and reading", async () => {
    const resolver = await tempResolver();
    const outside = join(resolver.root, "outside.png");
    await writeFile(outside, pngBytes());
    const linked = join(
      resolver.root,
      "knowledge",
      "ui-references",
      "linked.png",
    );
    await symlink(outside, linked);
    const images = createImageService(resolver);

    await expect(images.listImages("ui-reference")).rejects.toThrow(/symlink/i);
    await expect(images.readImage("ui-reference", "linked")).rejects.toThrow(/symlink/i);
  });

  it("rejects invalid kinds and arbitrary path-like ids", async () => {
    const resolver = await tempResolver();
    const images = createImageService(resolver);

    await expect(images.readImage("ui-reference", "../secret.png")).rejects.toThrow();
    await expect(images.listImages("intel" as never)).rejects.toThrow();
    await expect(images.imageContentFor({
      ...resolver.resolveCaptureReadPath("forged"),
      absolutePath: join(resolver.root, "outside.png"),
    })).rejects.toThrow(/configured resolver/i);
  });
});
