import {constants} from "node:fs";
import {access} from "node:fs/promises";
import type {PathResolver} from "./paths.js";

export const SERVER_NAME = "game-player-lens";
export const SERVER_VERSION = "0.4.0";
export const TOOL_COUNT = 18;
export const PROMPT_COUNT = 5;

export interface StatusEnvironment {
  ITAD_API_KEY?: string;
  OBSCURA_PATH?: string;
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
  return {
    server: {name: SERVER_NAME, version: SERVER_VERSION},
    storage: {
      location: resolver.root === resolver.assetRoot
        ? "repository-root" as const
        : "external-data-home" as const,
      writable: await isWritable(resolver.root),
    },
    integrations: {
      itadPriceHistory: {configured: Boolean(environment.ITAD_API_KEY?.trim())},
      obscuraPageCapture: {configured: Boolean(environment.OBSCURA_PATH?.trim())},
    },
    capabilities: {toolCount: TOOL_COUNT, promptCount: PROMPT_COUNT},
  };
}
