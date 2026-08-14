import {mkdtemp, mkdir, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {createKnowledgeReader} from "./knowledge.js";
import {createPathResolver} from "./paths.js";
import type {Persona} from "./persona-schemas.js";
import {createPersonaStore} from "./persona-store.js";

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "steam-user-sim-knowledge-"));
  roots.push(root);
  for (const directory of ["personas", "templates", "rubrics", "intel"]) {
    await mkdir(join(root, "knowledge", directory), {recursive: true});
  }
  const resolver = createPathResolver(root);
  const store = createPersonaStore(resolver);
  return {root, resolver, store, readKnowledge: createKnowledgeReader(resolver, store)};
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

function persona(): Persona {
  return {
    id: "careful-player",
    source_appids: [1145360],
    archetype: "慎重な購入者",
    playtime_profile: "週末中心",
    priorities: ["価格"],
    voice: Array.from({length: 3}, (_, index) => ({
      text: `voice ${index}`,
      source_appid: 1145360,
      recommendation_id: `rec-${index}`,
      language: "japanese",
      voted_up: true,
    })),
    dealbreakers: [],
    price_sensitivity: "セール待ち",
  };
}

describe("knowledge reader", () => {
  it("lists canonical files when no id is supplied", async () => {
    const {root, readKnowledge} = await fixture();
    await writeFile(join(root, "knowledge", "rubrics", "harsh-critic.md"), "# rubric");

    await expect(readKnowledge("rubrics")).resolves.toEqual({
      kind: "rubrics",
      items: [{id: "harsh-critic.md"}],
    });
  });

  it("reads rubric text", async () => {
    const {root, readKnowledge} = await fixture();
    await writeFile(join(root, "knowledge", "rubrics", "harsh-critic.md"), "# 辛口");

    await expect(readKnowledge("rubrics", "harsh-critic.md")).resolves.toEqual({
      kind: "rubrics",
      id: "harsh-critic.md",
      content: "# 辛口",
    });
  });

  it("lists persona archetypes and validates persona reads", async () => {
    const {root, store, readKnowledge} = await fixture();
    await store.savePersona(persona());
    await expect(readKnowledge("personas")).resolves.toEqual({
      kind: "personas",
      items: [{
        id: "careful-player",
        archetype: "慎重な購入者",
        source_appids: [1145360],
      }],
    });

    await writeFile(
      join(root, "knowledge", "personas", "broken.json"),
      JSON.stringify({id: "broken"}),
    );
    await expect(readKnowledge("personas", "broken")).rejects.toThrow();
  });

  it("rejects traversal and symlinks", async () => {
    const {root, readKnowledge} = await fixture();
    const outside = join(root, "outside.md");
    await writeFile(outside, "outside");
    await symlink(outside, join(root, "knowledge", "rubrics", "link.md"));

    await expect(readKnowledge("rubrics", "../outside.md")).rejects.toThrow();
    await expect(readKnowledge("rubrics", "link.md")).rejects.toThrow(/symlink/i);
  });
});
