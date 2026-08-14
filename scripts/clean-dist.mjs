import {rm} from "node:fs/promises";
import {basename, dirname, resolve} from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(repositoryRoot, "dist");

if (dirname(outputDirectory) !== repositoryRoot || basename(outputDirectory) !== "dist") {
  throw new Error("refusing to clean an unexpected build output path");
}

await rm(outputDirectory, {recursive: true, force: true});
