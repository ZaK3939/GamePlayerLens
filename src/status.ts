import {constants} from "node:fs";
import {access} from "node:fs/promises";
import {createHash} from "node:crypto";
import type {PathResolver} from "./paths.js";

export const SERVER_NAME = "game-player-lens";
export const SERVER_VERSION = "0.6.0";
export const TOOL_COUNT = 30;
export const PROMPT_COUNT = 5;
export const WORKFLOW_TOOL_COUNT = 5;

export interface StatusEnvironment {
  ITAD_API_KEY?: string;
  OBSCURA_PATH?: string;
  GAME_PLAYER_LENS_PROJECT_ROOT?: string;
}

export type WritableCheck = (path: string) => Promise<boolean>;

const checkWritable: WritableCheck = async (path) => {
  try {
    await access(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

export async function getServerStatus(
  resolver: Pick<PathResolver, "root" | "assetRoot">,
  environment: StatusEnvironment = process.env,
  isWritable: WritableCheck = checkWritable,
) {
  const storageInstanceId = `storage-${createHash("sha256").update(resolver.root).digest("hex").slice(0, 16)}`;
  return {
    server: {name: SERVER_NAME, version: SERVER_VERSION},
    storage: {
      location: resolver.root === resolver.assetRoot
        ? "repository-root" as const
        : "external-data-home" as const,
      instanceId: storageInstanceId,
      writable: await isWritable(resolver.root),
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
