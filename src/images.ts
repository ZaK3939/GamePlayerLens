import {constants, type Dirent, type Stats} from "node:fs";
import {
  open as nodeOpen,
  readdir as nodeReaddir,
  type FileHandle,
} from "node:fs/promises";
import {basename, dirname} from "node:path";
import type {ImageContent} from "@modelcontextprotocol/server";
import {
  ImageArtifactKindSchema,
  type ImageArtifactKind,
} from "./artifacts.js";
import {
  type CaptureManifest,
  parseCaptureManifest,
} from "./capture-manifest.js";
import type {FetchResult} from "./http.js";
import {sha256 as hashBytes} from "./integrity.js";
import type {
  CaptureImageExtension,
  PathResolver,
  ResolvedImagePath,
} from "./paths.js";

export const MAX_INLINE_IMAGE_BYTES = 6 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MIME_TYPE = "image/png";
const JPEG_MIME_TYPE = "image/jpeg";
const INLINE_LIMIT_WARNING =
  "image exceeds the 6 MiB inline limit; returning metadata only";

type ImageResolver = Pick<
  PathResolver,
  "resolveCaptureReadPath" | "resolveCaptureManifestPath" | "resolveUiReferencePath"
>;

interface ImageFileHandle {
  stat(): Promise<Stats>;
  read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ): Promise<{bytesRead: number; buffer: Buffer}>;
  readFile(): Promise<Buffer>;
  close(): Promise<void>;
}

export interface ImageFileOps {
  readdir(path: string, options: {withFileTypes: true}): Promise<Dirent[]>;
  open(path: string, flags: number): Promise<ImageFileHandle>;
}

export interface ImageServiceDependencies {
  fileOps?: Partial<ImageFileOps>;
  encodeBase64?: (bytes: Buffer) => string;
}

export interface ImageMetadata {
  id: string;
  kind: ImageArtifactKind;
  relativePath: string;
  mimeType: ImageMimeType;
  sizeBytes: number;
  modifiedAt: string;
}

export interface ImageReadResult extends ImageMetadata {
  imageIncluded: boolean;
  sha256?: string;
}

export interface ImageFetchResult<T> extends FetchResult<T> {
  imageContent?: ImageContent;
}

export interface InlineImageResult {
  mimeType: ImageMimeType;
  sizeBytes: number;
  modifiedAt: string;
  imageIncluded: boolean;
  sha256?: string;
  imageContent?: ImageContent;
  warnings: string[];
}

export type ImageMimeType = typeof PNG_MIME_TYPE | typeof JPEG_MIME_TYPE;

export interface ImageService {
  listImages(kind: ImageArtifactKind): Promise<ImageFetchResult<ImageMetadata[]>>;
  readImage(
    kind: ImageArtifactKind,
    id: string,
  ): Promise<ImageFetchResult<ImageReadResult>>;
  /** Accepts only a ResolvedImagePath produced by this service's resolver. */
  imageContentFor(path: ResolvedImagePath): Promise<InlineImageResult>;
}

const nodeFileOps: ImageFileOps = {
  readdir: (path, options) => nodeReaddir(path, options),
  open: (path, flags) => nodeOpen(path, flags) as Promise<FileHandle>,
};

function isSameResolvedPath(
  left: ResolvedImagePath,
  right: ResolvedImagePath,
): boolean {
  return left.id === right.id
    && left.absolutePath === right.absolutePath
    && left.relativePath === right.relativePath;
}

function resolveImage(
  resolver: ImageResolver,
  kind: ImageArtifactKind,
  id: string,
  extension: CaptureImageExtension = "png",
): ResolvedImagePath {
  if (kind === "capture") return resolver.resolveCaptureReadPath(id, extension);
  if (extension !== "png") throw new Error("UI references must be PNG files");
  return resolver.resolveUiReferencePath(id);
}

function rootDirectory(resolver: ImageResolver, kind: ImageArtifactKind): string {
  return dirname(resolveImage(resolver, kind, "image-list-probe").absolutePath);
}

function assertRegularImage(stats: Stats): void {
  if (stats.isSymbolicLink()) throw new Error("symlink images are not allowed");
  if (!stats.isFile()) throw new Error("image is not a regular file");
}

function imageMetadata(
  kind: ImageArtifactKind,
  resolved: ResolvedImagePath,
  stats: Stats,
): ImageMetadata {
  return {
    id: resolved.id,
    kind,
    relativePath: resolved.relativePath,
    mimeType: imageFormat(resolved).mimeType,
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}

function imageFormat(resolved: ResolvedImagePath): {
  extension: CaptureImageExtension;
  mimeType: ImageMimeType;
  signature: Buffer;
  signatureName: "PNG" | "JPEG";
} {
  if (resolved.absolutePath.endsWith(".png") && resolved.relativePath.endsWith(".png")) {
    return {
      extension: "png",
      mimeType: PNG_MIME_TYPE,
      signature: PNG_SIGNATURE,
      signatureName: "PNG",
    };
  }
  if (resolved.absolutePath.endsWith(".jpg") && resolved.relativePath.endsWith(".jpg")) {
    return {
      extension: "jpg",
      mimeType: JPEG_MIME_TYPE,
      signature: JPEG_SIGNATURE,
      signatureName: "JPEG",
    };
  }
  throw new Error("unsupported image extension");
}

function isNodeError(error: unknown, code: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === code) return true;
    current = current.cause;
  }
  return false;
}

function isNonCanonicalImageId(error: unknown): boolean {
  return error instanceof Error && [
    "invalid display name",
    "invalid dot-only display name",
    "canonical id must contain 1 to 64 characters",
  ].includes(error.message);
}

export function createImageService(
  resolver: ImageResolver,
  dependencies: ImageServiceDependencies = {},
): ImageService {
  const ops = {...nodeFileOps, ...dependencies.fileOps};
  const encodeBase64 = dependencies.encodeBase64
    ?? ((bytes: Buffer) => bytes.toString("base64"));

  async function openRegularImage(resolved: ResolvedImagePath): Promise<{
    handle: ImageFileHandle;
    stats: Stats;
  }> {
    let handle: ImageFileHandle;
    try {
      handle = await ops.open(
        resolved.absolutePath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (error) {
      if (isNodeError(error, "ELOOP")) {
        throw new Error("symlink images are not allowed", {cause: error});
      }
      if (isNodeError(error, "ENOENT")) {
        throw new Error("image does not exist", {cause: error});
      }
      throw new Error("image could not be opened", {cause: error});
    }
    try {
      const stats = await handle.stat();
      assertRegularImage(stats);
      return {handle, stats};
    } catch (error) {
      await handle.close().catch(() => undefined);
      throw error;
    }
  }

  async function readCaptureManifest(id: string): Promise<CaptureManifest | null> {
    const resolved = resolver.resolveCaptureManifestPath(id);
    let handle: ImageFileHandle;
    try {
      handle = await ops.open(
        resolved.absolutePath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return null;
      if (isNodeError(error, "ELOOP")) {
        throw new Error("symlink capture manifests are not allowed", {cause: error});
      }
      throw new Error("capture manifest could not be opened", {cause: error});
    }
    try {
      const stats = await handle.stat();
      if (!stats.isFile() || stats.size < 2 || stats.size > 4_096) {
        throw new Error("capture manifest is not a bounded regular file");
      }
      return parseCaptureManifest((await handle.readFile()).toString("utf8"), resolved.id);
    } finally {
      await handle.close();
    }
  }

  function verifyResolverIssuedPath(path: ResolvedImagePath): void {
    for (const kind of ImageArtifactKindSchema.options) {
      const extensions: CaptureImageExtension[] = kind === "capture"
        ? ["png", "jpg"]
        : ["png"];
      for (const extension of extensions) {
        try {
          if (isSameResolvedPath(path, resolveImage(resolver, kind, path.id, extension))) return;
        } catch {
          // A resolver can have only one image root available to a narrow caller.
        }
      }
    }
    throw new Error("image path must be issued by the configured resolver");
  }

  async function imageContentFor(path: ResolvedImagePath): Promise<InlineImageResult> {
    verifyResolverIssuedPath(path);
    const format = imageFormat(path);
    const {handle, stats} = await openRegularImage(path);
    try {
      const signature = Buffer.alloc(format.signature.length);
      const {bytesRead} = await handle.read(
        signature,
        0,
        signature.length,
        0,
      );
      if (bytesRead !== format.signature.length || !signature.equals(format.signature)) {
        throw new Error(`invalid ${format.signatureName} signature at ${path.relativePath}`);
      }

      if (stats.size > MAX_INLINE_IMAGE_BYTES) {
        return {
          mimeType: format.mimeType,
          sizeBytes: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          imageIncluded: false,
          warnings: [INLINE_LIMIT_WARNING],
        };
      }

      const bytes = await handle.readFile();
      const finalStats = await handle.stat();
      if (bytes.length !== stats.size || finalStats.size !== stats.size) {
        throw new Error(`image changed while reading ${path.relativePath}`);
      }
      return {
        mimeType: format.mimeType,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        imageIncluded: true,
        sha256: hashBytes(bytes),
        imageContent: {
          type: "image",
          data: encodeBase64(bytes),
          mimeType: format.mimeType,
        },
        warnings: [],
      };
    } finally {
      await handle.close();
    }
  }

  async function listImages(
    kind: ImageArtifactKind,
  ): Promise<ImageFetchResult<ImageMetadata[]>> {
    const parsedKind = ImageArtifactKindSchema.parse(kind);
    const entries = await ops.readdir(rootDirectory(resolver, parsedKind), {
      withFileTypes: true,
    });
    const metadata: ImageMetadata[] = [];
    let invalidNameCount = 0;
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const extension: CaptureImageExtension | null = entry.name.endsWith(".png")
        ? "png"
        : parsedKind === "capture" && entry.name.endsWith(".jpg")
          ? "jpg"
          : null;
      if (!extension) continue;
      if (entry.isSymbolicLink()) throw new Error("symlink images are not allowed");
      if (!entry.isFile()) continue;
      const id = entry.name.slice(0, -4);
      let resolved: ResolvedImagePath;
      try {
        resolved = resolveImage(resolver, parsedKind, id, extension);
      } catch (error) {
        if (!isNonCanonicalImageId(error)) throw error;
        invalidNameCount += 1;
        continue;
      }
      if (resolved.id !== id || basename(resolved.absolutePath) !== entry.name) {
        invalidNameCount += 1;
        continue;
      }
      if (parsedKind === "capture") {
        const manifest = await readCaptureManifest(id);
        if (!manifest || manifest.extension !== extension) {
          invalidNameCount += 1;
          continue;
        }
      }
      const {handle, stats} = await openRegularImage(resolved);
      try {
        metadata.push(imageMetadata(parsedKind, resolved, stats));
      } finally {
        await handle.close();
      }
    }
    return {
      data: metadata.sort((left, right) => left.id.localeCompare(right.id)),
      warnings: invalidNameCount > 0
        ? [`skipped ${invalidNameCount} image(s) with non-canonical filenames`]
        : [],
    };
  }

  async function readImage(
    kind: ImageArtifactKind,
    id: string,
  ): Promise<ImageFetchResult<ImageReadResult>> {
    const parsedKind = ImageArtifactKindSchema.parse(kind);
    let resolved = resolveImage(resolver, parsedKind, id);
    let manifest: CaptureManifest | null = null;
    if (parsedKind === "capture") {
      manifest = await readCaptureManifest(id);
      if (!manifest) throw new Error("capture manifest does not exist");
      resolved = resolveImage(resolver, parsedKind, manifest.id, manifest.extension);
    }
    const inline = await imageContentFor(resolved);
    if (manifest && (
      inline.sha256 !== manifest.sha256
      || inline.sizeBytes !== manifest.sizeBytes
      || inline.mimeType !== manifest.mimeType
    )) {
      throw new Error("saved capture does not match its immutable manifest");
    }
    return {
      data: {
        id: resolved.id,
        kind: parsedKind,
        relativePath: resolved.relativePath,
        mimeType: inline.mimeType,
        sizeBytes: inline.sizeBytes,
        modifiedAt: inline.modifiedAt,
        imageIncluded: inline.imageIncluded,
        ...(inline.sha256 ? {sha256: inline.sha256} : {}),
      },
      warnings: inline.warnings,
      ...(inline.imageContent ? {imageContent: inline.imageContent} : {}),
    };
  }

  return {listImages, readImage, imageContentFor};
}
