import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {McpServer} from "@modelcontextprotocol/server";
import {serveStdio} from "@modelcontextprotocol/server/stdio";
import {z} from "zod";
import {
  AnyArtifactKindSchema,
  JsonValueSchema,
  SaveEvaluationInputSchema,
  SaveIntelInputSchema,
  createArtifactStore,
  type ArtifactStore,
} from "./artifacts.js";
import {createCaptureService} from "./capture.js";
import {discoverGames} from "./discovery.js";
import type {FetchResult} from "./http.js";
import {createImageService, type ImageFetchResult, type ImageService} from "./images.js";
import {createKnowledgeReader, type KnowledgeReader} from "./knowledge.js";
import {
  buildDerivationPack,
  createPersonaStore,
  MAX_DERIVATION_APPIDS,
  PersonaSchema,
  type PersonaStore,
} from "./personas.js";
import {initializeRepositoryPaths, type PathResolver} from "./paths.js";
import {
  buildRunSimPrompt,
  buildUiBlindComparePrompt,
  RunSimPromptArgumentsSchema,
  UiBlindComparePromptArgumentsSchema,
} from "./prompts.js";
import {fetchReviews} from "./reviews.js";
import {fetchGame, searchGames} from "./steam.js";
import {fetchTimeline} from "./timeline.js";

const ResultEnvelopeSchema = z.object({
  data: z.json().nullable(),
  warnings: z.array(z.string()),
  meta: z.record(z.string(), z.json()).optional(),
});

const AppidSchema = z.number().int().positive();
const ReviewTypeSchema = z.enum(["all", "positive", "negative"]);
const KnowledgeKindSchema = z.enum(["personas", "templates", "rubrics", "intel"]);
const DiscoveryInputSchema = z.object({
  kind: z.enum(["tag", "genre"]),
  value: z.string().trim().min(1).max(80),
  additionalValues: z.array(z.string().trim().min(1).max(80)).max(3).optional(),
  excludeAppids: z.array(z.number().int().positive()).max(50).optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).strict();
const SaveArtifactInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("intel"),
    ...SaveIntelInputSchema.shape,
    payload: JsonValueSchema,
    overwrite: z.boolean().optional(),
  }).strict(),
  z.object({
    kind: z.literal("evaluation"),
    ...SaveEvaluationInputSchema.shape,
    overwrite: z.boolean().optional(),
  }).strict(),
]);
const GetArtifactInputSchema = z.object({
  kind: AnyArtifactKindSchema,
  target: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
}).strict();

export interface ServerServices {
  resolver: PathResolver;
  searchGames: typeof searchGames;
  discoverGames: typeof discoverGames;
  fetchGame: typeof fetchGame;
  fetchReviews: typeof fetchReviews;
  fetchTimeline: typeof fetchTimeline;
  buildDerivationPack: typeof buildDerivationPack;
  savePersona: PersonaStore["savePersona"];
  captureUrl: ReturnType<typeof createCaptureService>;
  readKnowledge: KnowledgeReader;
  readSkill(id: string): Promise<string>;
  artifactStore: ArtifactStore;
  imageService: ImageService;
}

function jsonEnvelope(result: FetchResult<unknown>) {
  const structuredContent = ResultEnvelopeSchema.parse(
    JSON.parse(JSON.stringify(result)) as unknown,
  );
  return {
    content: [{type: "text" as const, text: JSON.stringify(structuredContent)}],
    structuredContent,
  };
}

function imageEnvelope(result: ImageFetchResult<unknown>) {
  const {imageContent, ...envelope} = result;
  const response = jsonEnvelope(envelope);
  return {
    ...response,
    content: imageContent
      ? [...response.content, imageContent]
      : response.content,
  };
}

function createServerServices(overrides: Partial<ServerServices>): ServerServices {
  const resolver = overrides.resolver ?? initializeRepositoryPaths();
  const personaStore = createPersonaStore(resolver);
  const defaults: ServerServices = {
    resolver,
    searchGames,
    discoverGames,
    fetchGame,
    fetchReviews,
    fetchTimeline,
    buildDerivationPack,
    savePersona: personaStore.savePersona,
    captureUrl: createCaptureService({resolver}),
    readKnowledge: createKnowledgeReader(resolver, personaStore),
    readSkill: (id) => readFile(resolver.resolveSkillPath(id), "utf8"),
    artifactStore: createArtifactStore(resolver),
    imageService: createImageService(resolver),
  };
  return {...defaults, ...overrides, resolver};
}

export function buildServer(
  overrides: Partial<ServerServices> = {},
): McpServer {
  const services = createServerServices(overrides);
  const server = new McpServer(
    {name: "game-player-lens", version: "0.1.0"},
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
    "steam_discover",
    {
      description: "Discover Steam games by one SteamSpy tag/genre, or intersect it with up to three additional values; optionally exclude known appids",
      inputSchema: DiscoveryInputSchema,
      outputSchema: ResultEnvelopeSchema,
    },
    async (input) => jsonEnvelope(await services.discoverGames(input)),
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
        appids: z.array(AppidSchema).min(1).max(MAX_DERIVATION_APPIDS),
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
    async ({url, name, viewport, fullPage}) => imageEnvelope(
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

  server.registerTool(
    "save_artifact",
    {
      description: "Validate and atomically save intel JSON or evaluation Markdown",
      inputSchema: SaveArtifactInputSchema,
      outputSchema: ResultEnvelopeSchema,
    },
    async (input) => {
      if (input.kind === "intel") {
        const {kind: _kind, overwrite, ...artifact} = input;
        return jsonEnvelope({
          data: await services.artifactStore.saveIntel(artifact, {overwrite}),
          warnings: [],
        });
      }
      const {kind: _kind, overwrite, ...artifact} = input;
      return jsonEnvelope({
        data: await services.artifactStore.saveEvaluation(artifact, {overwrite}),
        warnings: [],
      });
    },
  );

  server.registerTool(
    "get_artifact",
    {
      description: "For intel/evaluation, omit target to list targets, use target without id to list item metadata, and use target+id to read JSON/Markdown; id without target is invalid. For capture/ui-reference, target is invalid, omit id to list PNG metadata, and use id to read metadata plus optional MCP ImageContent.",
      inputSchema: GetArtifactInputSchema,
      outputSchema: ResultEnvelopeSchema,
    },
    async ({kind, target, id}) => {
      if (kind === "intel" || kind === "evaluation") {
        if (id !== undefined && target === undefined) {
          throw new Error("target is required when reading a text artifact");
        }
        if (target === undefined) {
          return jsonEnvelope({
            data: await services.artifactStore.listTargets(kind),
            warnings: [],
          });
        }
        if (id === undefined) {
          return jsonEnvelope({
            data: await services.artifactStore.listArtifacts(kind, target),
            warnings: [],
          });
        }
        return jsonEnvelope({
          data: kind === "intel"
            ? await services.artifactStore.readIntel(target, id)
            : await services.artifactStore.readEvaluation(target, id),
          warnings: [],
        });
      }

      if (target !== undefined) {
        throw new Error("target is invalid for image artifacts");
      }
      if (id === undefined) {
        return jsonEnvelope({
          data: await services.imageService.listImages(kind),
          warnings: [],
        });
      }
      return imageEnvelope(await services.imageService.readImage(kind, id));
    },
  );

  server.registerPrompt(
    "run-sim",
    {
      description: "Run an evidence-grounded adoption simulation",
      argsSchema: RunSimPromptArgumentsSchema,
    },
    async (arguments_) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: buildRunSimPrompt(await services.readSkill("run-sim.md"), arguments_),
        },
      }],
    }),
  );

  server.registerPrompt(
    "ui-blind-compare",
    {
      description: "Blindly compare target and reference game UI",
      argsSchema: UiBlindComparePromptArgumentsSchema,
    },
    async (arguments_) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: buildUiBlindComparePrompt(
            await services.readSkill("ui-blind-compare.md"),
            arguments_,
          ),
        },
      }],
    }),
  );

  return server;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry!)).href;
}

if (isDirectExecution()) {
  serveStdio(() => buildServer(), {
    onerror: (error) => console.error(`game-player-lens MCP error: ${error.message}`),
  });
}
