#!/usr/bin/env node

import {realpathSync} from "node:fs";
import {homedir} from "node:os";
import {dirname, isAbsolute, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {serveStdio} from "@modelcontextprotocol/server/stdio";
import {buildServer} from "./index.js";
import {initializePackagedPaths} from "./paths.js";
import {
  getServerStatus,
  type StatusEnvironment,
  type WritableCheck,
} from "./status.js";

export interface DataRootEnvironment {
  GAME_PLAYER_LENS_HOME?: string;
}

export type CliEnvironment = DataRootEnvironment & StatusEnvironment;

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

function nodeMajor(version: string): number | undefined {
  const match = /^v?(\d+)(?:\.|$)/.exec(version.trim());
  if (!match?.[1]) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export async function buildDoctorReport(
  resolver: Parameters<typeof getServerStatus>[0],
  version = process.version,
  environment: CliEnvironment = process.env,
  isWritable?: WritableCheck,
) {
  const minimumMajor = 22;
  const supported = (nodeMajor(version) ?? 0) >= minimumMajor;
  const status = await getServerStatus(resolver, environment, isWritable);
  const ok = supported && status.storage.writable;
  const nextStep = !supported
    ? "Install Node.js 22 or newer, then run game-player-lens doctor again."
    : !status.storage.writable
      ? "Make GAME_PLAYER_LENS_HOME writable, then run game-player-lens doctor again."
      : "Register the same command as an MCP server, restart the client, then call get_status.";
  return {
    ok,
    command: "doctor" as const,
    node: {version, minimumMajor, supported},
    ...status,
    nextStep,
  };
}

export async function runDoctor(
  environment: CliEnvironment = process.env,
): Promise<Awaited<ReturnType<typeof buildDoctorReport>>> {
  const resolver = initializePackagedPaths(
    resolvePackageRoot(),
    resolveDataRoot(environment),
  );
  return buildDoctorReport(resolver, process.version, environment);
}

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  if (args.length === 0) {
    startPackagedServer();
    return;
  }
  if (args.length === 1 && args[0] === "doctor") {
    const report = await runDoctor();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
    return;
  }
  throw new Error("usage: game-player-lens [doctor]");
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
  void runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`game-player-lens startup error: ${message}`);
    process.exitCode = 1;
  });
}
