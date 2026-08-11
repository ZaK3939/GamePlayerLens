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
import type {FetchResult} from "./http.js";
import type {PathResolver, ResolvedImagePath} from "./paths.js";

export const MAX_INLINE_IMAGE_BYTES = 6 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_MIME_TYPE = "image/png";
const INLINE_LIMIT_WARNING =
  "image exceeds the 6 MiB inline limit; returning metadata only";

type ImageResolver = Pick<
  PathResolver,
  "resolveCaptureReadPath" | "resolveUiReferencePath"
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
  mimeType: typeof PNG_MIME_TYPE;
  sizeBytes: number;
  modifiedAt: string;
}

export interface ImageReadResult extends ImageMetadata {
  imageIncluded: boolean;
}

export interface ImageFetchResult<T> extends FetchResult<T> {
  imageContent?: ImageContent;
}

export interface InlineImageResult {
  mimeType: typeof PNG_MIME_TYPE;
  sizeBytes: number;
  modifiedAt: string;
  imageIncluded: boolean;
  imageContent?: ImageContent;
  warnings: string[];
}

export interface ImageService {
  listImages(kind: ImageArtifactKind): Promise<ImageMetadata[]>;
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
): ResolvedImagePath {
  return kind === "capture"
    ? resolver.resolveCaptureReadPath(id)
    : resolver.resolveUiReferencePath(id);
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
    mimeType: PNG_MIME_TYPE,
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
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
      throw error;
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

  function verifyResolverIssuedPath(path: ResolvedImagePath): void {
    for (const kind of ImageArtifactKindSchema.options) {
      try {
        if (isSameResolvedPath(path, resolveImage(resolver, kind, path.id))) return;
      } catch {
        // A resolver can have only one image root available to a narrow caller.
      }
    }
    throw new Error("image path must be issued by the configured resolver");
  }

  async function imageContentFor(path: ResolvedImagePath): Promise<InlineImageResult> {
    verifyResolverIssuedPath(path);
    const {handle, stats} = await openRegularImage(path);
    try {
      const signature = Buffer.alloc(PNG_SIGNATURE.length);
      const {bytesRead} = await handle.read(
        signature,
        0,
        signature.length,
        0,
      );
      if (bytesRead !== PNG_SIGNATURE.length || !signature.equals(PNG_SIGNATURE)) {
        throw new Error(`invalid PNG signature at ${path.relativePath}`);
      }

      if (stats.size > MAX_INLINE_IMAGE_BYTES) {
        return {
          mimeType: PNG_MIME_TYPE,
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
        mimeType: PNG_MIME_TYPE,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        imageIncluded: true,
        imageContent: {
          type: "image",
          data: encodeBase64(bytes),
          mimeType: PNG_MIME_TYPE,
        },
        warnings: [],
      };
    } finally {
      await handle.close();
    }
  }

  async function listImages(kind: ImageArtifactKind): Promise<ImageMetadata[]> {
    const parsedKind = ImageArtifactKindSchema.parse(kind);
    const entries = await ops.readdir(rootDirectory(resolver, parsedKind), {
      withFileTypes: true,
    });
    const metadata: ImageMetadata[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || !entry.name.endsWith(".png")) continue;
      if (entry.isSymbolicLink()) throw new Error("symlink images are not allowed");
      if (!entry.isFile()) continue;
      const id = entry.name.slice(0, -4);
      const resolved = resolveImage(resolver, parsedKind, id);
      if (resolved.id !== id || basename(resolved.absolutePath) !== entry.name) continue;
      const {handle, stats} = await openRegularImage(resolved);
      try {
        metadata.push(imageMetadata(parsedKind, resolved, stats));
      } finally {
        await handle.close();
      }
    }
    return metadata.sort((left, right) => left.id.localeCompare(right.id));
  }

  async function readImage(
    kind: ImageArtifactKind,
    id: string,
  ): Promise<ImageFetchResult<ImageReadResult>> {
    const parsedKind = ImageArtifactKindSchema.parse(kind);
    const resolved = resolveImage(resolver, parsedKind, id);
    const inline = await imageContentFor(resolved);
    return {
      data: {
        id: resolved.id,
        kind: parsedKind,
        relativePath: resolved.relativePath,
        mimeType: inline.mimeType,
        sizeBytes: inline.sizeBytes,
        modifiedAt: inline.modifiedAt,
        imageIncluded: inline.imageIncluded,
      },
      warnings: inline.warnings,
      ...(inline.imageContent ? {imageContent: inline.imageContent} : {}),
    };
  }

  return {listImages, readImage, imageContentFor};
}
