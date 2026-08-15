import {execFile} from "node:child_process";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const allowedPaths = [
  "README.md",
  "package.json",
  "dist/",
  "docs/guides/",
  "docs/reference/",
  "knowledge/rubrics/",
  "knowledge/templates/",
  "skills/",
];
const forbiddenPaths = [
  /(^|\/)\.(?:env|git|github)(?:\/|\.|$)/u,
  /(^|\/)(?:__tests__|coverage|fixtures?|scripts|src|tests?)(?:\/|$)/u,
  /(^|\/)[^/]+\.(?:live\.)?(?:spec|test)(?:\.|$)/u,
  /(^|\/)docs\/superpowers(?:\/|$)/u,
  /(^|\/)dist\/(?:manual-tests|smoke-[^/]+)\./u,
];

function runNpmPack(cacheDirectory) {
  return new Promise((resolveOutput, reject) => {
    execFile(
      "npm",
      [
        "pack",
        "--dry-run",
        "--json",
        "--ignore-scripts",
        "--cache",
        cacheDirectory,
      ],
      {
        cwd: repositoryRoot,
        maxBuffer: 20 * 1024 * 1024,
        shell: process.platform === "win32",
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`npm pack inspection failed: ${stderr.trim() || error.message}`, {
            cause: error,
          }));
          return;
        }
        resolveOutput(stdout);
      },
    );
  });
}

const cacheDirectory = await mkdtemp(join(tmpdir(), "game-player-lens-npm-cache-"));
try {
  const reports = JSON.parse(await runNpmPack(cacheDirectory));
  const report = reports[0];
  if (!report || !Array.isArray(report.files)) {
    throw new Error("npm pack inspection returned no file manifest");
  }
  const paths = report.files.map((file) => file.path);
  const outsideAllowlist = paths.filter((path) => !allowedPaths.some((allowed) => (
    allowed.endsWith("/") ? path.startsWith(allowed) : path === allowed
  )));
  const internalPaths = paths.filter((path) => forbiddenPaths.some((pattern) => pattern.test(path)));
  if (outsideAllowlist.length > 0 || internalPaths.length > 0) {
    throw new Error([
      "npm package exposes internal files",
      ...outsideAllowlist.map((path) => `outside allowlist: ${path}`),
      ...internalPaths.map((path) => `internal path: ${path}`),
    ].join("\n"));
  }
  for (const required of [
    "dist/cli.js",
    "skills/game-review.md",
    "skills/game-player-lens/SKILL.md",
    "skills/game-player-lens/agents/openai.yaml",
    "skills/game-legal-audit/SKILL.md",
    "skills/game-legal-audit/agents/openai.yaml",
    "README.md",
  ]) {
    if (!paths.includes(required)) throw new Error(`npm package is missing ${required}`);
  }
  process.stdout.write(`${JSON.stringify({ok: true, files: paths.length, internalFiles: 0})}\n`);
} finally {
  await rm(cacheDirectory, {recursive: true, force: true});
}
