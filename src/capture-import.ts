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
  relative,
  resolve,
  sep,
  win32,
} from "node:path";
import {z} from "zod";
import {
  writeBinaryFileAtomically,
  writeTextFileAtomically,
} from "./atomic-write.js";
import {
  type CaptureManifest,
  parseCaptureManifest,
} from "./capture-manifest.js";
import {validateRasterImage} from "./image-validation.js";
import type {ImageFetchResult, ImageService} from "./images.js";
import {MAX_INLINE_IMAGE_BYTES} from "./images.js";
import {sha256} from "./integrity.js";
import type {CaptureImageExtension, PathResolver} from "./paths.js";

const MAX_BASE64_LENGTH = Math.ceil(MAX_INLINE_IMAGE_BYTES / 3) * 4;
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
  width: number;
  height: number;
  savedAt: string;
  sha256: string;
  evidenceReference: {kind: "capture"; id: string};
  source: CaptureManifest["source"];
  imageIncluded: boolean;
}

interface CaptureImportDependencies {
  resolver: Pick<
    PathResolver,
    "resolveCaptureReadPath" | "resolveCaptureManifestPath"
  >;
  projectRoot: string;
  imageService: Pick<ImageService, "readImage">;
  clock?: () => Date;
  managedSource?: {kind: "page" | "steam-image"};
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === ""
    || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

function formatForMime(mimeType: z.infer<typeof MimeTypeSchema>) {
  return mimeType === "image/png"
    ? {extension: "png" as const}
    : {extension: "jpg" as const};
}

function mimeForProjectPath(path: string): z.infer<typeof MimeTypeSchema> {
  return extname(path).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
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

function hasErrorCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === code) return true;
    current = current.cause;
  }
  return false;
}

class SafeCaptureSourceError extends Error {}

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
  try {
    const canonicalRoot = await realpath(projectRoot);
    const segments = relativePath.split("/");
    let current = canonicalRoot;
    for (const segment of segments) {
      current = resolve(current, segment);
      if (!isWithin(canonicalRoot, current)) {
        throw new SafeCaptureSourceError("relativePath escapes project root");
      }
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) {
        throw new SafeCaptureSourceError("symlink project paths are not allowed");
      }
    }
    const canonicalSource = await realpath(current);
    if (!isWithin(canonicalRoot, canonicalSource)) {
      throw new SafeCaptureSourceError("relativePath escapes project root");
    }

    const handle = await open(canonicalSource, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const initial = await handle.stat();
      if (!initial.isFile()) {
        throw new SafeCaptureSourceError("capture source is not a regular file");
      }
      if (initial.size < 1 || initial.size > MAX_INLINE_IMAGE_BYTES) {
        throw new SafeCaptureSourceError("capture source must contain 1 byte to 6 MiB");
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
        throw new SafeCaptureSourceError("capture source changed while reading");
      }
      return bytes;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof SafeCaptureSourceError) throw error;
    if (hasErrorCode(error, "ENOENT")) {
      throw new Error(`capture source does not exist: ${relativePath}`);
    }
    throw new Error(`capture source could not be read: ${relativePath}`);
  }
}

async function readManifest(
  path: string,
  expectedId: string,
): Promise<CaptureManifest | null> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw new Error("capture manifest could not be opened");
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size < 2 || stats.size > 4_096) {
      throw new Error("capture manifest is not a bounded regular file");
    }
    return parseCaptureManifest(await handle.readFile({encoding: "utf8"}), expectedId);
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
    const dimensions = await validateRasterImage(bytes, mimeType);

    const extension: CaptureImageExtension = formatForMime(mimeType).extension;
    const initial = dependencies.resolver.resolveCaptureReadPath(parsed.id, extension);
    await mkdir(dirname(initial.absolutePath), {recursive: true});
    const destination = dependencies.resolver.resolveCaptureReadPath(parsed.id, extension);
    if (destination.absolutePath !== initial.absolutePath) {
      throw new Error("capture destination changed during creation");
    }
    const manifestPath = dependencies.resolver.resolveCaptureManifestPath(destination.id);
    const captureSha256 = sha256(bytes);
    const savedAt = clock();
    if (Number.isNaN(savedAt.getTime())) throw new Error("capture clock is invalid");
    const source: CaptureManifest["source"] = dependencies.managedSource
      ?? (parsed.source.kind === "base64"
        ? {kind: "base64" as const}
        : {kind: "project-file" as const, fileName: basename(parsed.source.relativePath)});
    const proposedManifest: CaptureManifest = {
      schemaVersion: 1,
      artifactType: "capture-manifest",
      id: destination.id,
      extension,
      mimeType,
      sizeBytes: bytes.length,
      width: dimensions.width,
      height: dimensions.height,
      sha256: captureSha256,
      savedAt: savedAt.toISOString(),
      source,
    };

    let manifest = await readManifest(manifestPath.absolutePath, destination.id);
    let recoveringInterruptedPublication = manifest !== null;
    if (!manifest) {
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
      try {
        await writeTextFileAtomically(
          manifestPath.absolutePath,
          `${JSON.stringify(proposedManifest)}\n`,
          {
            fileOps: {writeFile, link, unlink},
            alreadyExistsMessage: `capture already exists: ${destination.id}`,
          },
        );
        manifest = proposedManifest;
      } catch (error) {
        if (!hasErrorCode(error, "EEXIST")) throw error;
        manifest = await readManifest(manifestPath.absolutePath, destination.id);
        if (!manifest) throw new Error("capture manifest publication could not be verified");
        recoveringInterruptedPublication = true;
      }
    }

    const manifestMatchesInput = manifest.sha256 === captureSha256
      && manifest.mimeType === mimeType
      && manifest.sizeBytes === bytes.length
      && manifest.width === dimensions.width
      && manifest.height === dimensions.height
      && JSON.stringify(manifest.source) === JSON.stringify(source);
    const manifestDestination = dependencies.resolver.resolveCaptureReadPath(
      manifest.id,
      manifest.extension,
    );
    if (await pathExists(manifestDestination.absolutePath)) {
      throw new Error(`capture already exists: ${destination.id}`);
    }
    if (!manifestMatchesInput) {
      throw new Error(`capture ID is reserved by an incomplete import: ${destination.id}`);
    }
    try {
      await writeBinaryFileAtomically(destination.absolutePath, bytes, {
        fileOps: {writeFile, link, unlink},
        alreadyExistsMessage: `capture already exists: ${destination.id}`,
      });
    } catch (error) {
      if (hasErrorCode(error, "EEXIST")) {
        throw new Error(`capture already exists: ${destination.id}`, {cause: error});
      }
      throw error;
    }

    const image = await dependencies.imageService.readImage("capture", destination.id);
    if (!image.data) throw new Error("saved capture could not be read");
    if (image.data.kind !== "capture") throw new Error("saved image is not a capture");
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
        width: manifest.width,
        height: manifest.height,
        imageIncluded: image.data.imageIncluded,
        savedAt: manifest.savedAt,
        sha256: captureSha256,
        evidenceReference: {kind: "capture", id: destination.id},
        source: manifest.source,
      },
      warnings: [
        ...image.warnings,
        ...(recoveringInterruptedPublication
          ? ["recovered an interrupted capture publication for the same bytes"]
          : []),
      ],
      ...(image.imageContent ? {imageContent: image.imageContent} : {}),
    };
  };
}
