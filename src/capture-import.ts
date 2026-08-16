import {constants} from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";
import {z} from "zod";
import {writeBinaryFileAtomically} from "./atomic-write.js";
import {withFileAccess} from "./file-access.js";
import type {ImageFetchResult, ImageService} from "./images.js";
import {MAX_INLINE_IMAGE_BYTES} from "./images.js";
import {sha256} from "./integrity.js";
import type {CaptureImageExtension, PathResolver} from "./paths.js";

const MAX_BASE64_LENGTH = Math.ceil(MAX_INLINE_IMAGE_BYTES / 3) * 4;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const MimeTypeSchema = z.enum(["image/png", "image/jpeg"]);
const RelativeProjectPathSchema = z.string().trim().min(1).max(1_024).transform(
  (value, context) => {
    if (
      value.includes("\0")
      || isAbsolute(value)
      || win32.isAbsolute(value)
    ) {
      context.addIssue({code: "custom", message: "relativePath must be relative to the project root"});
      return z.NEVER;
    }
    const normalized = value.replaceAll("\\", "/");
    const segments = normalized.split("/");
    if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
      context.addIssue({code: "custom", message: "relativePath must not traverse the project root"});
      return z.NEVER;
    }
    if (!/\.(?:png|jpe?g)$/iu.test(normalized)) {
      context.addIssue({code: "custom", message: "relativePath must name a PNG or JPEG file"});
      return z.NEVER;
    }
    return normalized;
  },
);

export const CaptureImportInputSchema = z.object({
  id: z.string().trim().min(1).max(80),
  source: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("project-file"),
      relativePath: RelativeProjectPathSchema,
    }).strict(),
    z.object({
      kind: z.literal("base64"),
      mimeType: MimeTypeSchema,
      data: z.string().min(4).max(MAX_BASE64_LENGTH),
    }).strict(),
  ]),
}).strict();

export type CaptureImportInput = z.input<typeof CaptureImportInputSchema>;

export interface CaptureImportEnvironment {
  GAME_PLAYER_LENS_PROJECT_ROOT?: string;
}

export function resolveCaptureImportRoot(
  environment: CaptureImportEnvironment = process.env,
  cwd = process.cwd(),
): string {
  const configured = environment.GAME_PLAYER_LENS_PROJECT_ROOT?.trim();
  if (!configured) return resolve(cwd);
  if (!isAbsolute(configured)) {
    throw new Error("GAME_PLAYER_LENS_PROJECT_ROOT must be an absolute path");
  }
  return resolve(configured);
}

export interface CaptureImportRecord {
  artifactType: "capture";
  id: string;
  kind: "capture";
  relativePath: string;
  mimeType: "image/png" | "image/jpeg";
  sizeBytes: number;
  savedAt: string;
  sha256: string;
  evidenceReference: {kind: "capture"; id: string};
  source: {kind: "base64"} | {kind: "project-file"; fileName: string};
  imageIncluded: boolean;
}

interface CaptureImportDependencies {
  resolver: Pick<PathResolver, "resolveCaptureReadPath">;
  projectRoot: string;
  imageService: Pick<ImageService, "readImage">;
  clock?: () => Date;
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === ""
    || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

function formatForMime(mimeType: z.infer<typeof MimeTypeSchema>) {
  return mimeType === "image/png"
    ? {extension: "png" as const, signature: PNG_SIGNATURE, signatureName: "PNG"}
    : {extension: "jpg" as const, signature: JPEG_SIGNATURE, signatureName: "JPEG"};
}

function mimeForProjectPath(path: string): z.infer<typeof MimeTypeSchema> {
  return extname(path).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
}

function assertSignature(bytes: Buffer, mimeType: z.infer<typeof MimeTypeSchema>): void {
  const format = formatForMime(mimeType);
  if (!bytes.subarray(0, format.signature.length).equals(format.signature)) {
    throw new Error(`invalid ${format.signatureName} signature`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function decodeBase64(value: string): Buffer {
  if (
    value.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)
  ) {
    throw new Error("image data must be canonical base64");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    throw new Error("image data must be canonical base64");
  }
  return bytes;
}

async function readProjectImage(projectRoot: string, relativePath: string): Promise<Buffer> {
  const canonicalRoot = await realpath(projectRoot);
  const segments = relativePath.split("/");
  let current = canonicalRoot;
  for (const segment of segments) {
    current = resolve(current, segment);
    if (!isWithin(canonicalRoot, current)) throw new Error("relativePath escapes project root");
    const stats = await lstat(current);
    if (stats.isSymbolicLink()) throw new Error("symlink project paths are not allowed");
  }
  const canonicalSource = await realpath(current);
  if (!isWithin(canonicalRoot, canonicalSource)) throw new Error("relativePath escapes project root");

  const handle = await open(canonicalSource, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const initial = await handle.stat();
    if (!initial.isFile()) throw new Error("capture source is not a regular file");
    if (initial.size < 1 || initial.size > MAX_INLINE_IMAGE_BYTES) {
      throw new Error("capture source must contain 1 byte to 6 MiB");
    }
    const bytes = await handle.readFile();
    const final = await handle.stat();
    if (
      bytes.length !== initial.size
      || final.dev !== initial.dev
      || final.ino !== initial.ino
      || final.size !== initial.size
      || final.mtimeMs !== initial.mtimeMs
    ) {
      throw new Error("capture source changed while reading");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

export function createCaptureImportService(
  dependencies: CaptureImportDependencies,
): (input: CaptureImportInput) => Promise<ImageFetchResult<CaptureImportRecord>> {
  const clock = dependencies.clock ?? (() => new Date());
  return async (input) => {
    const parsed = CaptureImportInputSchema.parse(input);
    const mimeType = parsed.source.kind === "base64"
      ? parsed.source.mimeType
      : mimeForProjectPath(parsed.source.relativePath);
    const bytes = parsed.source.kind === "base64"
      ? decodeBase64(parsed.source.data)
      : await readProjectImage(dependencies.projectRoot, parsed.source.relativePath);
    if (bytes.length < 1 || bytes.length > MAX_INLINE_IMAGE_BYTES) {
      throw new Error("capture source must contain 1 byte to 6 MiB");
    }
    assertSignature(bytes, mimeType);

    const extension: CaptureImageExtension = formatForMime(mimeType).extension;
    const initial = dependencies.resolver.resolveCaptureReadPath(parsed.id, extension);
    await mkdir(dirname(initial.absolutePath), {recursive: true});
    const destination = dependencies.resolver.resolveCaptureReadPath(parsed.id, extension);
    if (destination.absolutePath !== initial.absolutePath) {
      throw new Error("capture destination changed during creation");
    }
    const captureIdLock = join(
      dirname(destination.absolutePath),
      `.${destination.id}.capture-id`,
    );
    await withFileAccess(captureIdLock, async () => {
      const candidates = (["png", "jpg"] as const).map(
        (candidateExtension) => dependencies.resolver.resolveCaptureReadPath(
          destination.id,
          candidateExtension,
        ),
      );
      if ((await Promise.all(candidates.map(
        (candidate) => pathExists(candidate.absolutePath),
      ))).some(Boolean)) {
        throw new Error(`capture already exists: ${destination.id}`);
      }
      await writeBinaryFileAtomically(destination.absolutePath, bytes, {
        fileOps: {writeFile, link, unlink},
        alreadyExistsMessage: `capture already exists: ${destination.id}`,
      });
    });

    const savedAt = clock();
    if (Number.isNaN(savedAt.getTime())) throw new Error("capture clock is invalid");
    const image = await dependencies.imageService.readImage("capture", destination.id);
    if (!image.data) throw new Error("saved capture could not be read");
    if (image.data.kind !== "capture") throw new Error("saved image is not a capture");
    const captureSha256 = sha256(bytes);
    if (image.data.sha256 !== captureSha256) {
      throw new Error("saved capture SHA-256 does not match imported bytes");
    }
    return {
      data: {
        artifactType: "capture",
        id: image.data.id,
        kind: "capture",
        relativePath: image.data.relativePath,
        mimeType: image.data.mimeType,
        sizeBytes: image.data.sizeBytes,
        imageIncluded: image.data.imageIncluded,
        savedAt: savedAt.toISOString(),
        sha256: captureSha256,
        evidenceReference: {kind: "capture", id: destination.id},
        source: parsed.source.kind === "base64"
          ? {kind: "base64"}
          : {kind: "project-file", fileName: basename(parsed.source.relativePath)},
      },
      warnings: image.warnings,
      ...(image.imageContent ? {imageContent: image.imageContent} : {}),
    };
  };
}
