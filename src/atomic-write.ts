import {randomUUID} from "node:crypto";
import {basename, dirname, join} from "node:path";

export interface AtomicTextFileOps {
  writeFile(
    path: string,
    data: string,
    options: {encoding: "utf8"; flag: "wx"},
  ): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  rename?(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

interface AtomicTextWriteOptions {
  fileOps: AtomicTextFileOps;
  alreadyExistsMessage: string;
  overwrite?: boolean;
  idFactory?: () => string;
}

function hasErrorCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === code) return true;
    current = current.cause;
  }
  return false;
}

export async function writeTextFileAtomically(
  destination: string,
  data: string,
  options: AtomicTextWriteOptions,
): Promise<void> {
  const temporary = join(
    dirname(destination),
    `.${basename(destination)}.${(options.idFactory ?? randomUUID)()}.tmp`,
  );
  let temporaryCreated = false;
  let operationFailed = false;

  try {
    await options.fileOps.writeFile(temporary, data, {
      encoding: "utf8",
      flag: "wx",
    });
    temporaryCreated = true;
    if (options.overwrite === true) {
      if (!options.fileOps.rename) {
        throw new Error("atomic overwrite requires a rename operation");
      }
      await options.fileOps.rename(temporary, destination);
      temporaryCreated = false;
      return;
    }
    try {
      await options.fileOps.link(temporary, destination);
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
        await options.fileOps.unlink(temporary);
      } catch (error) {
        if (!hasErrorCode(error, "ENOENT") && !operationFailed) throw error;
      }
    }
  }
}
