import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {McpServer} from "@modelcontextprotocol/server";
import {serveStdio} from "@modelcontextprotocol/server/stdio";
import {z} from "zod";
import {captureUrl} from "./capture.js";
import type {FetchResult} from "./http.js";
import {readKnowledge, type KnowledgeReader} from "./knowledge.js";
import {
  buildDerivationPack,
  PersonaSchema,
  savePersona,
} from "./personas.js";
import {resolveSkillPath} from "./paths.js";
import {fetchReviews} from "./reviews.js";
import {fetchGame, searchGames} from "./steam.js";
import {fetchTimeline} from "./timeline.js";

const ResultEnvelopeSchema = z.object({
  data: z.json().nullable(),
  warnings: z.array(z.string()),
});

const AppidSchema = z.number().int().positive();
const ReviewTypeSchema = z.enum(["all", "positive", "negative"]);
const KnowledgeKindSchema = z.enum(["personas", "templates", "rubrics", "intel"]);

export interface ServerServices {
  searchGames: typeof searchGames;
  fetchGame: typeof fetchGame;
  fetchReviews: typeof fetchReviews;
  fetchTimeline: typeof fetchTimeline;
  buildDerivationPack: typeof buildDerivationPack;
  savePersona: typeof savePersona;
  captureUrl: typeof captureUrl;
  readKnowledge: KnowledgeReader;
  readSkill(id: string): Promise<string>;
}

const defaultServices: ServerServices = {
  searchGames,
  fetchGame,
  fetchReviews,
  fetchTimeline,
  buildDerivationPack,
  savePersona,
  captureUrl,
  readKnowledge,
  readSkill: (id) => readFile(resolveSkillPath(id), "utf8"),
};

function jsonEnvelope(result: FetchResult<unknown>) {
  const structuredContent = ResultEnvelopeSchema.parse(
    JSON.parse(JSON.stringify(result)) as unknown,
  );
  return {
    content: [{type: "text" as const, text: JSON.stringify(structuredContent)}],
    structuredContent,
  };
}

export function buildServer(
  overrides: Partial<ServerServices> = {},
): McpServer {
  const services = {...defaultServices, ...overrides};
  const server = new McpServer(
    {name: "steam-user-sim", version: "0.1.0"},
    {capabilities: {tools: {}, prompts: {}}},
  );

  server.registerTool(
    "steam_search",
    {
      description: "Steam games by name",
      inputSchema: z.object({query: z.string().trim().min(1)}),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({query}) => jsonEnvelope(await services.searchGames(query)),
  );

  server.registerTool(
    "steam_fetch",
    {
      description: "Steam Store details in US, JP, and Germany plus SteamSpy",
      inputSchema: z.object({appid: AppidSchema}),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({appid}) => jsonEnvelope(await services.fetchGame(appid)),
  );

  server.registerTool(
    "steam_reviews",
    {
      description: "Traceable recent Steam reviews with bounded filtering",
      inputSchema: z.object({
        appid: AppidSchema,
        language: z.string().trim().min(1).optional(),
        type: ReviewTypeSchema.optional(),
        minPlaytimeHours: z.number().nonnegative().optional(),
        limit: z.number().int().min(1).max(300).optional(),
      }),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({appid, language, type, minPlaytimeHours, limit}) => jsonEnvelope(
      await services.fetchReviews(appid, {language, type, minPlaytimeHours, limit}),
    ),
  );

  server.registerTool(
    "steam_timeline",
    {
      description: "Current SteamSpy snapshot and optional ITAD price history",
      inputSchema: z.object({
        appid: AppidSchema,
        since: z.string().optional(),
        country: z.string().length(2).optional(),
      }),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({appid, since, country}) => jsonEnvelope(
      await services.fetchTimeline(appid, {since, country}),
    ),
  );

  server.registerTool(
    "derive_personas",
    {
      description: "Build a traceable review evidence pack and Persona JSON Schema",
      inputSchema: z.object({
        appids: z.array(AppidSchema).min(1),
        count: z.number().int().min(1).max(12).optional(),
      }),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({appids, count}) => jsonEnvelope(
      await services.buildDerivationPack(appids, count),
    ),
  );

  server.registerTool(
    "save_persona",
    {
      description: "Validate and atomically save a generated persona",
      inputSchema: z.object({
        persona: PersonaSchema,
        overwrite: z.boolean().optional(),
      }),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({persona, overwrite}) => jsonEnvelope({
      data: await services.savePersona(persona, {overwrite}),
      warnings: [],
    }),
  );

  server.registerTool(
    "ui_capture",
    {
      description: "Capture an HTTP(S) UI through Obscura CDP to a server-owned PNG path",
      inputSchema: z.object({
        url: z.string().url(),
        name: z.string().optional(),
        viewport: z.object({
          width: z.number().int().min(320).max(3840),
          height: z.number().int().min(240).max(2160),
        }).optional(),
        fullPage: z.boolean().optional(),
      }),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({url, name, viewport, fullPage}) => jsonEnvelope(
      await services.captureUrl(url, {name, viewport, fullPage}),
    ),
  );

  server.registerTool(
    "get_knowledge",
    {
      description: "List or read canonical knowledge and validated personas",
      inputSchema: z.object({
        kind: KnowledgeKindSchema,
        id: z.string().min(1).optional(),
      }),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({kind, id}) => jsonEnvelope({
      data: await services.readKnowledge(kind, id),
      warnings: [],
    }),
  );

  for (const prompt of [
    {name: "run-sim", file: "run-sim.md", description: "Run an evidence-grounded adoption simulation"},
    {name: "ui-blind-compare", file: "ui-blind-compare.md", description: "Blindly compare target and reference game UI"},
  ] as const) {
    server.registerPrompt(
      prompt.name,
      {description: prompt.description, argsSchema: z.object({})},
      async () => ({
        messages: [{
          role: "user" as const,
          content: {type: "text" as const, text: await services.readSkill(prompt.file)},
        }],
      }),
    );
  }

  return server;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry!)).href;
}

if (isDirectExecution()) {
  serveStdio(() => buildServer(), {
    onerror: (error) => console.error(`steam-user-sim MCP error: ${error.message}`),
  });
}
