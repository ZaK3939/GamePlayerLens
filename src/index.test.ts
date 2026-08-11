import {mkdtemp, mkdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Client, InMemoryTransport} from "@modelcontextprotocol/client";
import {afterEach, describe, expect, it} from "vitest";
import {buildServer} from "./index.js";
import {createKnowledgeReader} from "./knowledge.js";
import {createPathResolver} from "./paths.js";
import {createPersonaStore, type Persona} from "./personas.js";

const roots: string[] = [];

async function createHarness() {
  const root = await mkdtemp(join(tmpdir(), "steam-user-sim-mcp-"));
  roots.push(root);
  for (const directory of ["personas", "templates", "rubrics", "intel"]) {
    await mkdir(join(root, "knowledge", directory), {recursive: true});
  }
  const resolver = createPathResolver(root);
  const store = createPersonaStore(resolver);
  const server = buildServer({
    savePersona: store.savePersona,
    readKnowledge: createKnowledgeReader(resolver, store),
  });
  const client = new Client({name: "steam-user-sim-test", version: "1.0.0"});
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {client, server};
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

function persona(): Persona {
  return {
    id: "mcp-round-trip",
    source_appids: [1145360],
    archetype: "MCPテスト利用者",
    playtime_profile: "短時間プレイ",
    priorities: ["操作性"],
    voice: Array.from({length: 3}, (_, index) => ({
      text: `voice ${index}`,
      source_appid: 1145360,
      recommendation_id: `mcp-${index}`,
      language: "japanese",
      voted_up: true,
    })),
    dealbreakers: [],
    price_sensitivity: "中程度",
  };
}

describe("MCP server contract", () => {
  it("exposes exactly eight tools and two prompts with bounded schemas", async () => {
    const {client, server} = await createHarness();
    try {
      const tools = (await client.listTools()).tools;
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "derive_personas",
        "get_knowledge",
        "save_persona",
        "steam_fetch",
        "steam_reviews",
        "steam_search",
        "steam_timeline",
        "ui_capture",
      ]);
      for (const tool of tools) {
        expect(tool.outputSchema?.required).toEqual(expect.arrayContaining(["data", "warnings"]));
      }

      const derive = tools.find((tool) => tool.name === "derive_personas")!;
      expect(derive.inputSchema.required).toContain("appids");
      expect(derive.inputSchema.properties?.count).toMatchObject({minimum: 1, maximum: 12});
      const capture = tools.find((tool) => tool.name === "ui_capture")!;
      expect(capture.inputSchema.required).toContain("url");
      expect(capture.inputSchema.properties).not.toHaveProperty("outPath");

      const prompts = (await client.listPrompts()).prompts;
      expect(prompts.map((prompt) => prompt.name).sort()).toEqual([
        "run-sim",
        "ui-blind-compare",
      ]);
      expect((await client.getPrompt({name: "run-sim", arguments: {}})).messages[0])
        .toMatchObject({role: "user", content: {type: "text"}});
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("round-trips save_persona through get_knowledge", async () => {
    const {client, server} = await createHarness();
    try {
      const saved = await client.callTool({
        name: "save_persona",
        arguments: {persona: persona()},
      });
      expect(saved.isError).not.toBe(true);
      expect(saved.structuredContent).toMatchObject({data: {id: "mcp-round-trip"}, warnings: []});

      const loaded = await client.callTool({
        name: "get_knowledge",
        arguments: {kind: "personas", id: "mcp-round-trip"},
      });
      expect(loaded.structuredContent).toMatchObject({
        data: {kind: "personas", id: "mcp-round-trip", persona: {archetype: "MCPテスト利用者"}},
        warnings: [],
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("surfaces path violations as tool errors", async () => {
    const {client, server} = await createHarness();
    try {
      const result = await client.callTool({
        name: "get_knowledge",
        arguments: {kind: "rubrics", id: "../escape.md"},
      });
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
