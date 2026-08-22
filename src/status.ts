import {constants} from "node:fs";
import {access, link, readFile, unlink, writeFile} from "node:fs/promises";
import {createHash, randomUUID} from "node:crypto";
import {basename, join} from "node:path";
import {writeTextFileAtomically} from "./atomic-write.js";
import type {PathResolver} from "./paths.js";

export const SERVER_NAME = "game-player-lens";
export const SERVER_VERSION = "0.7.0";
export const TOOL_COUNT = 32;
export const PROMPT_COUNT = 6;
export const WORKFLOW_TOOL_COUNT = 6;

export interface StatusEnvironment {
  ITAD_API_KEY?: string;
  OBSCURA_PATH?: string;
  GAME_PLAYER_LENS_PROJECT_ROOT?: string;
}

export const STORAGE_PUBLICATION_PRIMITIVE = "create-flush-link-read-cleanup" as const;

export interface StorageReadiness {
  writable: boolean;
  publicationReady: boolean;
  publicationPrimitive: typeof STORAGE_PUBLICATION_PRIMITIVE;
  readinessIssue?: "unwritable" | "publication-failed" | "cleanup-failed";
}

export type StorageCheck = (path: string) => Promise<StorageReadiness>;

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function removeProbe(path: string): Promise<boolean> {
  try {
    await unlink(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return true;
    return false;
  }
}

export const checkStoragePublication: StorageCheck = async (path) => {
  try {
    await access(path, constants.W_OK);
  } catch {
    return {
      writable: false,
      publicationReady: false,
      publicationPrimitive: STORAGE_PUBLICATION_PRIMITIVE,
      readinessIssue: "unwritable",
    };
  }

  const probeId = randomUUID();
  const destination = join(path, `.game-player-lens-doctor-${probeId}.ready`);
  const temporary = join(path, `.${basename(destination)}.${probeId}.tmp`);
  let issue: StorageReadiness["readinessIssue"];

  try {
    await writeTextFileAtomically(destination, probeId, {
      fileOps: {writeFile, link, unlink},
      alreadyExistsMessage: "storage publication probe collided",
      idFactory: () => probeId,
    });
    if (await readFile(destination, "utf8") !== probeId) {
      issue = "publication-failed";
    }
  } catch {
    issue = "publication-failed";
  } finally {
    const destinationCleaned = await removeProbe(destination);
    const temporaryCleaned = await removeProbe(temporary);
    if (!destinationCleaned || !temporaryCleaned) issue = "cleanup-failed";
  }

  return {
    writable: true,
    publicationReady: issue === undefined,
    publicationPrimitive: STORAGE_PUBLICATION_PRIMITIVE,
    ...(issue ? {readinessIssue: issue} : {}),
  };
};

export async function getServerStatus(
  resolver: Pick<PathResolver, "root" | "assetRoot">,
  environment: StatusEnvironment = process.env,
  checkStorage: StorageCheck = checkStoragePublication,
) {
  const storageInstanceId = `storage-${createHash("sha256").update(resolver.root).digest("hex").slice(0, 16)}`;
  const storageReadiness = await checkStorage(resolver.root);
  return {
    server: {name: SERVER_NAME, version: SERVER_VERSION},
    storage: {
      location: resolver.root === resolver.assetRoot
        ? "repository-root" as const
        : "external-data-home" as const,
      instanceId: storageInstanceId,
      ...storageReadiness,
    },
    integrations: {
      itadPriceHistory: {configured: Boolean(environment.ITAD_API_KEY?.trim())},
      obscuraPageCapture: {configured: Boolean(environment.OBSCURA_PATH?.trim())},
      localCaptureImport: {
        available: true,
        projectRootConfigured: Boolean(environment.GAME_PLAYER_LENS_PROJECT_ROOT?.trim()),
        modes: ["project-file", "base64"] as const,
      },
    },
    capabilities: {
      toolCount: TOOL_COUNT,
      workflowToolCount: WORKFLOW_TOOL_COUNT,
      promptShortcutCount: PROMPT_COUNT,
    },
  };
}
