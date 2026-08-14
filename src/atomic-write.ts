import {randomUUID} from "node:crypto";
import {basename, dirname, join} from "node:path";
import {writeFile as replaceFileAtomically} from "atomically";

export interface AtomicTextFileOps {
  writeFile(
    path: string,
    data: string,
    options: {encoding: "utf8"; flag: "wx"},
  ): Promise<void>;
  link(existingPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export type AtomicReplaceFile = (path: string, data: string) => Promise<void>;

interface AtomicTextWriteOptions {
  fileOps: AtomicTextFileOps;
  alreadyExistsMessage: string;
  overwrite?: boolean;
  idFactory?: () => string;
  replaceFile?: AtomicReplaceFile;
}

export async function replaceTextFileAtomically(path: string, data: string): Promise<void> {
  await replaceFileAtomically(path, data, {
    encoding: "utf8",
    fsync: true,
    timeout: 7_500,
  });
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
  if (options.overwrite === true) {
    await (options.replaceFile ?? replaceTextFileAtomically)(destination, data);
    return;
  }

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
