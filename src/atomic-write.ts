import {randomUUID} from "node:crypto";
import {basename, dirname, join} from "node:path";

export interface AtomicTextFileOps {
  writeFile(
    path: string,
    data: string,
    options: {encoding: "utf8"; flag: "wx"; flush: true},
  ): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export interface AtomicBinaryFileOps {
  writeFile(
    path: string,
    data: Uint8Array,
    options: {flag: "wx"; flush: true},
  ): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

interface AtomicTextWriteOptions {
  fileOps: AtomicTextFileOps;
  alreadyExistsMessage: string;
  idFactory?: () => string;
  publishRetryTimeoutMs?: number;
  cleanupRetryTimeoutMs?: number;
}

interface AtomicBinaryWriteOptions {
  fileOps: AtomicBinaryFileOps;
  alreadyExistsMessage: string;
  idFactory?: () => string;
  publishRetryTimeoutMs?: number;
  cleanupRetryTimeoutMs?: number;
}

interface AtomicPublicationOptions {
  writeTemporary(path: string): Promise<void>;
  link: AtomicTextFileOps["link"];
  unlink: AtomicTextFileOps["unlink"];
  alreadyExistsMessage: string;
  idFactory?: () => string;
  publishRetryTimeoutMs?: number;
  cleanupRetryTimeoutMs?: number;
}

const TRANSIENT_FILESYSTEM_CODES = new Set([
  "EACCES",
  "EBUSY",
  "EMFILE",
  "ENFILE",
  "EPERM",
]);
const DEFAULT_CLEANUP_RETRY_TIMEOUT_MS = 7_500;
const DEFAULT_PUBLISH_RETRY_TIMEOUT_MS = 7_500;

export class AtomicPublishCleanupError extends Error {
  override name = "AtomicPublishCleanupError";
  readonly committed = true;

  constructor(cause: unknown) {
    super(
      "file was saved, but temporary-file cleanup failed; read the saved record before retrying",
      {cause},
    );
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

async function unlinkTemporaryWithRetry(
  unlink: AtomicTextFileOps["unlink"],
  path: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let delayMs = 10;
  while (true) {
    try {
      await unlink(path);
      return;
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return;
      const retryable = [...TRANSIENT_FILESYSTEM_CODES].some(
        (code) => hasErrorCode(error, code),
      );
      const remainingMs = deadline - Date.now();
      if (!retryable || remainingMs <= 0) throw error;
      const waitMs = Math.min(delayMs, remainingMs);
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      delayMs = Math.min(delayMs * 2, 250);
    }
  }
}

async function linkTemporaryWithRetry(
  link: AtomicTextFileOps["link"],
  temporary: string,
  destination: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let delayMs = 10;
  while (true) {
    try {
      await link(temporary, destination);
      return;
    } catch (error) {
      if (hasErrorCode(error, "EEXIST")) throw error;
      const retryable = [...TRANSIENT_FILESYSTEM_CODES].some(
        (code) => hasErrorCode(error, code),
      );
      const remainingMs = deadline - Date.now();
      if (!retryable || remainingMs <= 0) throw error;
      const waitMs = Math.min(delayMs, remainingMs);
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      delayMs = Math.min(delayMs * 2, 250);
    }
  }
}

async function publishFileAtomically(
  destination: string,
  options: AtomicPublicationOptions,
): Promise<void> {
  const temporary = join(
    dirname(destination),
    `.${basename(destination)}.${(options.idFactory ?? randomUUID)()}.tmp`,
  );
  let temporaryCreated = false;
  let operationFailed = false;

  try {
    await options.writeTemporary(temporary);
    temporaryCreated = true;
    try {
      await linkTemporaryWithRetry(
        options.link,
        temporary,
        destination,
        options.publishRetryTimeoutMs ?? DEFAULT_PUBLISH_RETRY_TIMEOUT_MS,
      );
    } catch (error) {
      if (hasErrorCode(error, "EEXIST")) {
        throw new Error(options.alreadyExistsMessage, {cause: error});
      }
      throw error;
    }
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    if (temporaryCreated) {
      try {
        await unlinkTemporaryWithRetry(
          options.unlink,
          temporary,
          options.cleanupRetryTimeoutMs ?? DEFAULT_CLEANUP_RETRY_TIMEOUT_MS,
        );
      } catch (error) {
        if (!operationFailed) throw new AtomicPublishCleanupError(error);
      }
    }
  }
}

export async function writeTextFileAtomically(
  destination: string,
  data: string,
  options: AtomicTextWriteOptions,
): Promise<void> {
  return publishFileAtomically(destination, {
    ...options,
    link: options.fileOps.link,
    unlink: options.fileOps.unlink,
    writeTemporary: (temporary) => options.fileOps.writeFile(temporary, data, {
      encoding: "utf8",
      flag: "wx",
      flush: true,
    }),
  });
}

export async function writeBinaryFileAtomically(
  destination: string,
  data: Uint8Array,
  options: AtomicBinaryWriteOptions,
): Promise<void> {
  return publishFileAtomically(destination, {
    ...options,
    link: options.fileOps.link,
    unlink: options.fileOps.unlink,
    writeTemporary: (temporary) => options.fileOps.writeFile(temporary, data, {
      flag: "wx",
      flush: true,
    }),
  });
}
