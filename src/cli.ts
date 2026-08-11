#!/usr/bin/env node

import {realpathSync} from "node:fs";
import {homedir} from "node:os";
import {dirname, isAbsolute, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {serveStdio} from "@modelcontextprotocol/server/stdio";
import {buildServer} from "./index.js";
import {initializePackagedPaths} from "./paths.js";

export interface DataRootEnvironment {
  GAME_PLAYER_LENS_HOME?: string;
}

export function resolveDataRoot(
  environment: DataRootEnvironment = process.env,
  userHome = homedir(),
): string {
  const configured = environment.GAME_PLAYER_LENS_HOME?.trim();
  if (configured) {
    if (!isAbsolute(configured)) {
      throw new Error("GAME_PLAYER_LENS_HOME must be an absolute path");
    }
    return resolve(configured);
  }
  if (!isAbsolute(userHome)) throw new Error("user home must be an absolute path");
  return join(userHome, ".game-player-lens");
}

export function resolvePackageRoot(moduleUrl = import.meta.url): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), "..");
}

export function startPackagedServer(): void {
  const resolver = initializePackagedPaths(
    resolvePackageRoot(),
    resolveDataRoot(),
  );
  serveStdio(() => buildServer({resolver}), {
    onerror: (error) => console.error(`game-player-lens MCP error: ${error.message}`),
  });
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  try {
    startPackagedServer();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`game-player-lens startup error: ${message}`);
    process.exitCode = 1;
  }
}
