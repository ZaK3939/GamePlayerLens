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
} from "./artifacts.js";
import {SteamDeveloperBriefInputSchema} from "./brief.js";
import {CaptureImportInputSchema} from "./capture-import.js";
import {
  AgentExperienceFeedbackInputSchema,
  AgentExperienceSummaryInputSchema,
} from "./agent-feedback.js";
import {
  imageEnvelope,
  jsonEnvelope,
  trackedJsonEnvelope,
  workflowEnvelope,
} from "./mcp-responses.js";
import {LegalSourcePlanInputSchema} from "./legal.js";
import {
  GameLegalAuditPromptArgumentsSchema,
} from "./legal-prompt.js";
import {buildIterationCoachHistory} from "./iteration-coach.js";
import {
  GeneratedPersonaSchema,
  MAX_DERIVATION_APPIDS,
  PERSONA_FOCUS_VALUES,
  PersonaResearchQuestionSchema,
  PersonaSourceSelectionSchema,
} from "./persona-schemas.js";
import {groundPersonaFromResult} from "./persona-grounding.js";
import {
  buildFirstContactTestRecord,
  FirstContactRecordInputSchema,
} from "./playtest-evidence.js";
import {
  MAX_REVIEWS_PER_POLARITY,
  MIN_REVIEWS_PER_POLARITY,
} from "./personas.js";
import {
  AuditProjectPromptArgumentsSchema,
  ReviewChangePromptArgumentsSchema,
  PlayBuildPromptArgumentsSchema,
  UiBlindComparePromptArgumentsSchema,
} from "./prompts.js";
import {
  buildPlayerPanelRecord,
  PlayerPanelInputSchema,
  validatePlayerPanelDraft,
} from "./player-panel.js";
import {
  ResultEnvelopeSchema,
  ResultHandleSchema,
} from "./results.js";
import {SaveRunInputBaseSchema} from "./run-schemas.js";
import {
  createServerServices,
  type ServerServices,
} from "./server-services.js";
import {
  getServerStatus,
  SERVER_NAME,
  SERVER_VERSION,
} from "./status.js";
import {createWorkflowContent} from "./workflow-content.js";

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
const SaveResultInputSchema = z.object({
  target: z.string().min(1),
  id: z.string().min(1),
  resultHandle: ResultHandleSchema,
}).strict();
const SaveIntelToolInputSchema = z.object({
  ...SaveIntelInputSchema.shape,
  payload: JsonValueSchema,
}).strict();
const GetArtifactInputSchema = z.object({
  kind: AnyArtifactKindSchema,
  target: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
}).strict();
const CoachHistoryInputSchema = z.object({
  target: z.string().trim().min(1).max(120),
  limit: z.number().int().min(2).max(20).optional(),
}).strict();
const PlayerPanelDraftInputSchema = z.object({
  candidate: JsonValueSchema.refine(
    (value) => Boolean(value && typeof value === "object" && !Array.isArray(value)),
    "candidate must be a JSON object",
  ),
}).strict();

export function buildServer(
  overrides: Partial<ServerServices> = {},
): McpServer {
  const services = createServerServices(overrides);
  const server = new McpServer(
    {name: SERVER_NAME, version: SERVER_VERSION},
    {capabilities: {tools: {}, prompts: {}}},
  );
  const workflows = createWorkflowContent(services);

  server.registerTool(
    "steam_search",
    {
      description: "Steam games by name",
      inputSchema: z.object({query: z.string().trim().min(1)}),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({query}) => trackedJsonEnvelope(
      services.resultStore,
      "steam_search",
      await services.searchGames(query),
    ),
  );

  server.registerTool(
    "steam_brief",
    {
      description: "One-call, bounded developer triage for an existing Steam game: target and regional-price snapshot, optional price-history summary, two review polarities, updates, current indicators, a tag/genre competitor shortlist, provenance, decision coverage, and explicit unsupported claims",
      inputSchema: SteamDeveloperBriefInputSchema,
      outputSchema: ResultEnvelopeSchema,
    },
    async (input) => trackedJsonEnvelope(
      services.resultStore,
      "steam_brief",
      await services.buildDeveloperBrief(input),
    ),
  );

  server.registerTool(
    "steam_discover",
    {
      description: "Discover Steam games by one SteamSpy tag/genre, or intersect it with up to three additional values; optionally exclude known appids",
      inputSchema: DiscoveryInputSchema,
      outputSchema: ResultEnvelopeSchema,
    },
    async (input) => trackedJsonEnvelope(
      services.resultStore,
      "steam_discover",
      await services.discoverGames(input),
    ),
  );

  server.registerTool(
    "steam_fetch",
    {
      description: "Steam Store pricing and requested-locale copy for US/JP/DE, reference links, and SteamSpy",
      inputSchema: z.object({appid: AppidSchema}),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({appid}) => trackedJsonEnvelope(
      services.resultStore,
      "steam_fetch",
      await services.fetchGame(appid),
    ),
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
    async ({appid, language, type, minPlaytimeHours, limit}) => trackedJsonEnvelope(
      services.resultStore,
      "steam_reviews",
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
    async ({appid, since, country}) => trackedJsonEnvelope(
      services.resultStore,
      "steam_timeline",
      await services.fetchTimeline(appid, {since, country}),
    ),
  );

  server.registerTool(
    "steam_updates",
    {
      description: "Official Steam update history with SteamSonar-compatible classification, bounded summaries, cadence, and explicit heuristic provenance",
      inputSchema: z.object({
        appid: AppidSchema,
        scope: z.enum(["updates", "official", "all"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        contentChars: z.number().int().min(100).max(4_000).optional(),
        before: z.iso.datetime({offset: true}).optional(),
      }),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({appid, scope, limit, contentChars, before}) => trackedJsonEnvelope(
      services.resultStore,
      "steam_updates",
      await services.fetchUpdates(appid, {scope, limit, contentChars, before}),
    ),
  );

  server.registerTool(
    "legal_source_plan",
    {
      title: "Game legal source plan",
      description: "Build an exact-saveable, release-specific source and intake plan for game engines, assets, components, and distribution agreements; this is issue-spotting support, not legal advice or clearance",
      inputSchema: LegalSourcePlanInputSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => trackedJsonEnvelope(
      services.resultStore,
      "legal_source_plan",
      services.buildLegalSourcePlan(input),
    ),
  );

  server.registerTool(
    "derive_personas",
    {
      description: "Build a traceable Persona v3 review pack from explicit research questions and source-fit selections; market-only and visual-only references are rejected",
      inputSchema: z.object({
        appids: z.array(AppidSchema).min(1).max(MAX_DERIVATION_APPIDS),
        count: z.number().int().min(1).max(12).optional(),
        reviewsPerPolarity: z.number().int()
          .min(MIN_REVIEWS_PER_POLARITY)
          .max(MAX_REVIEWS_PER_POLARITY)
          .optional(),
        targetAppid: AppidSchema.optional(),
        market: z.string().trim().min(1).max(80),
        language: z.string().trim().toLowerCase()
          .regex(/^[a-z][a-z0-9_-]{0,31}$/),
        focus: z.array(z.enum(PERSONA_FOCUS_VALUES))
          .min(1)
          .max(PERSONA_FOCUS_VALUES.length)
          .optional(),
        researchQuestions: z.array(PersonaResearchQuestionSchema).min(1).max(3),
        sourceRoles: z.array(PersonaSourceSelectionSchema)
          .min(1)
          .max(MAX_DERIVATION_APPIDS),
      }),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({
      appids,
      count,
      reviewsPerPolarity,
      targetAppid,
      market,
      language,
      focus,
      researchQuestions,
      sourceRoles,
    }) => {
      const result = await services.buildDerivationPack(appids, {
        targetAppid,
        market,
        language,
        focus,
        researchQuestions,
        sourceRoles,
      }, count, reviewsPerPolarity);
      return trackedJsonEnvelope(
        services.resultStore,
        "derive_personas",
        result,
      );
    },
  );

  server.registerTool(
    "save_persona",
    {
      description: "Validate a generated persona against the exact derive_personas result and atomically save the grounded persona",
      inputSchema: z.object({
        persona: GeneratedPersonaSchema,
        derivationResultHandle: ResultHandleSchema,
      }),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({persona, derivationResultHandle}) => {
      const derivation = services.resultStore.get(derivationResultHandle);
      const grounded = groundPersonaFromResult(persona, derivation);
      return jsonEnvelope({
        data: await services.savePersona(grounded),
        warnings: [],
      });
    },
  );

  server.registerTool(
    "record_first_contact",
    {
      description: "Record a compact, pseudonymous first-contact test with a canonical unaided question protocol",
      inputSchema: FirstContactRecordInputSchema,
      outputSchema: ResultEnvelopeSchema,
    },
    async (input) => {
      const record = buildFirstContactTestRecord(input);
      return trackedJsonEnvelope(
        services.resultStore,
        "record_first_contact",
        {
          data: record,
          warnings: [],
          meta: {observedAt: record.testedAt},
        },
      );
    },
  );

  server.registerTool(
    "record_player_panel",
    {
      title: "Record grounded virtual-player panel",
      description: "Validate one shared operated-build stimulus against exact saved persona memory, bind each hypothesis to its persona SHA-256 and research question, and return an exact-save result handle",
      inputSchema: PlayerPanelInputSchema,
      outputSchema: ResultEnvelopeSchema,
    },
    async (input) => {
      const record = await buildPlayerPanelRecord(input, services.loadPersona);
      return trackedJsonEnvelope(
        services.resultStore,
        "record_player_panel",
        {
          data: record,
          warnings: [],
          meta: {observedAt: record.observedAt},
        },
      );
    },
  );

  server.registerTool(
    "validate_player_panel",
    {
      title: "Validate a virtual-player panel draft",
      description: "Dry-run an incomplete or complete record_player_panel input, return field-level schema and persona-grounding issues, and save nothing",
      inputSchema: PlayerPanelDraftInputSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({candidate}) => jsonEnvelope({
      data: await validatePlayerPanelDraft(candidate, services.loadPersona),
      warnings: [],
    }),
  );

  server.registerTool(
    "ui_capture",
    {
      description: "Capture a page through Obscura, or securely download a Steam Store screenshot from steamstatic.com",
      inputSchema: z.object({
        url: z.string().url(),
        name: z.string().optional(),
        sourceType: z.enum(["page", "steam-image"]).optional(),
        viewport: z.object({
          width: z.number().int().min(320).max(3840),
          height: z.number().int().min(240).max(2160),
        }).optional(),
        fullPage: z.boolean().optional(),
      }),
      outputSchema: ResultEnvelopeSchema,
    },
    async ({url, name, sourceType, viewport, fullPage}) => imageEnvelope(
      await services.captureUrl(url, {name, sourceType, viewport, fullPage}),
    ),
  );

  server.registerTool(
    "save_capture",
    {
      title: "Save local build capture",
      description: "Import one immutable PNG or JPEG from base64 or a project-root-relative file and return its capture evidence reference and SHA-256; does not require Obscura",
      inputSchema: CaptureImportInputSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => imageEnvelope(await services.captureImport(input)),
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
    "get_status",
    {
      title: "GamePlayerLens status",
      description: "Probe create-only local storage publication and report optional integration readiness without exposing paths or secrets",
      inputSchema: z.object({}).strict(),
      outputSchema: ResultEnvelopeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => jsonEnvelope({
      data: await getServerStatus(services.resolver),
      warnings: [],
    }),
  );

  server.registerTool(
    "coach_history",
    {
      title: "Game iteration coach",
      description: "Read verified stored developer-project runs and detect repeated review without a new build, direct stimulus, or human handoff evidence",
      inputSchema: CoachHistoryInputSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonEnvelope(await buildIterationCoachHistory(
      {
        runStore: services.runStore,
        artifactStore: services.artifactStore,
      },
      input,
    )),
  );

  server.registerTool(
    "report_agent_experience",
    {
      title: "Report GamePlayerLens agent experience",
      description: "Explicitly report one success, partial result, failure, confusion, parameter guess, give-up, or feature request about the GamePlayerLens Skill, MCP, or onboarding; saves locally and never transmits externally",
      inputSchema: AgentExperienceFeedbackInputSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => jsonEnvelope({
      data: await services.agentExperience.report(input),
      warnings: [],
    }),
  );

  server.registerTool(
    "summarize_agent_experience",
    {
      title: "Summarize GamePlayerLens agent experience",
      description: "Aggregate explicit local agent feedback and identify repeated signals with distinct caller-provided session IDs that are eligible for a user-approved GitHub issue draft; never creates issues or pull requests",
      inputSchema: AgentExperienceSummaryInputSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonEnvelope(await services.agentExperience.summarize(input)),
  );

  server.registerTool(
    "save_result",
    {
      title: "Save an exact tool result",
      description: "Persist one short-lived resultHandle exactly as normalized intel without model transcription",
      inputSchema: SaveResultInputSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({target, id, resultHandle}) => {
      const cached = services.resultStore.get(resultHandle);
      return jsonEnvelope({
        data: await services.artifactStore.saveIntel({
          target,
          id,
          sourceTool: cached.sourceTool,
          observedAt: cached.observedAt,
          payload: cached.payload,
        }),
        warnings: [],
      });
    },
  );

  server.registerTool(
    "save_intel",
    {
      title: "Save caller-authored intel",
      description: "Persist one bounded caller-authored JSON evidence record; use save_result for tool output",
      inputSchema: SaveIntelToolInputSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => jsonEnvelope({
      data: await services.artifactStore.saveIntel(input),
      warnings: [],
    }),
  );

  server.registerTool(
    "save_evaluation",
    {
      title: "Save a canonical evaluation",
      description: "Validate and persist canonical evaluation Markdown, then return its Decision Card and developer summary",
      inputSchema: SaveEvaluationInputSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      const metadata = await services.artifactStore.saveEvaluation(input);
      const saved = await services.artifactStore.readEvaluation(input.target, metadata.id);
      return jsonEnvelope({
        data: {
          metadata,
          decisionCard: saved.decisionCard,
          developerSummary: saved.developerSummary,
        },
        warnings: [],
      });
    },
  );

  server.registerTool(
    "save_run",
    {
      title: "Seal an immutable review run",
      description: "Validate, hash, and persist one evidence-linked review run",
      inputSchema: SaveRunInputBaseSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => jsonEnvelope({
      data: await services.runStore.saveRun(input),
      warnings: [],
    }),
  );

  server.registerTool(
    "get_artifact",
    {
      description: "For intel/evaluation/run, omit target to list targets, use target without id to list item metadata, and use target+id to read the saved record; run reads also verify the record seal and current recipe/persona/evidence SHA-256 integrity. An id without target is invalid. For capture/ui-reference, target is invalid, omit id to list image metadata, and use id to read metadata plus optional MCP ImageContent.",
      inputSchema: GetArtifactInputSchema,
      outputSchema: ResultEnvelopeSchema,
    },
    async ({kind, target, id}) => {
      if (kind === "intel" || kind === "evaluation" || kind === "run") {
        if (id !== undefined && target === undefined) {
          throw new Error("target is required when reading a target-scoped artifact");
        }
        if (target === undefined) {
          return jsonEnvelope({
            data: kind === "run"
              ? await services.runStore.listTargets()
              : await services.artifactStore.listTargets(kind),
            warnings: [],
          });
        }
        if (id === undefined) {
          return jsonEnvelope({
            data: kind === "run"
              ? await services.runStore.listRuns(target)
              : await services.artifactStore.listArtifacts(kind, target),
            warnings: [],
          });
        }
        if (kind === "run") {
          const run = await services.runStore.readRun(target, id);
          return jsonEnvelope({
            data: run,
            warnings: run.integrity.status === "verified"
              ? []
              : [`run integrity check: ${run.integrity.status} (${run.integrity.issueCount} issue(s))`],
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
        return jsonEnvelope(await services.imageService.listImages(kind));
      }
      return imageEnvelope(await services.imageService.readImage(kind, id));
    },
  );

  const workflowToolAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  } as const;

  server.registerTool(
    "play_build",
    {
      title: "Operate one bounded game build task",
      description: "Agent-callable form of the play-build workflow; returns the same complete instructions as the MCP prompt",
      inputSchema: PlayBuildPromptArgumentsSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: workflowToolAnnotations,
    },
    async (input) => workflowEnvelope("play-build", await workflows.playBuild(input)),
  );

  server.registerTool(
    "review_change",
    {
      title: "Review one game revision",
      description: "Agent-callable form of the review-change workflow; returns the same complete instructions as the MCP prompt",
      inputSchema: ReviewChangePromptArgumentsSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: workflowToolAnnotations,
    },
    async (input) => workflowEnvelope("review-change", await workflows.reviewChange(input)),
  );

  server.registerTool(
    "audit_project",
    {
      title: "Audit one game milestone",
      description: "Agent-callable form of the audit-project workflow; returns the same complete instructions as the MCP prompt",
      inputSchema: AuditProjectPromptArgumentsSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: workflowToolAnnotations,
    },
    async (input) => workflowEnvelope("audit-project", await workflows.auditProject(input)),
  );

  server.registerTool(
    "ui_blind_compare",
    {
      title: "Blindly compare game UI",
      description: "Agent-callable form of the ui-blind-compare workflow; returns the same complete instructions as the MCP prompt",
      inputSchema: UiBlindComparePromptArgumentsSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: workflowToolAnnotations,
    },
    async (input) => workflowEnvelope(
      "ui-blind-compare",
      await workflows.uiBlindCompare(input),
    ),
  );

  server.registerTool(
    "audit_game_legal",
    {
      title: "Audit one game release for legal evidence risks",
      description: "Agent-callable form of the audit-game-legal workflow; returns the same complete instructions as the MCP prompt",
      inputSchema: GameLegalAuditPromptArgumentsSchema,
      outputSchema: ResultEnvelopeSchema,
      annotations: workflowToolAnnotations,
    },
    async (input) => workflowEnvelope(
      "audit-game-legal",
      await workflows.auditGameLegal(input),
    ),
  );

  server.registerPrompt(
    "play-build",
    {
      description: "Operate one bounded build task and return observation-first player-lens hypotheses without running a full audit",
      argsSchema: PlayBuildPromptArgumentsSchema,
    },
    async (arguments_) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: await workflows.playBuild(arguments_),
        },
      }],
    }),
  );

  server.registerPrompt(
    "review-change",
    {
      description: "Review one current-to-proposed game revision through evidence-grounded player lenses",
      argsSchema: ReviewChangePromptArgumentsSchema,
    },
    async (arguments_) => {
      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: await workflows.reviewChange(arguments_),
          },
        }],
      };
    },
  );

  server.registerPrompt(
    "audit-project",
    {
      description: "Audit a game project or released game at a milestone using evidence-grounded player lenses",
      argsSchema: AuditProjectPromptArgumentsSchema,
    },
    async (arguments_) => {
      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: await workflows.auditProject(arguments_),
          },
        }],
      };
    },
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
          text: await workflows.uiBlindCompare(arguments_),
        },
      }],
    }),
  );

  server.registerPrompt(
    "audit-game-legal",
    {
      description: "Audit a specific game release for engine, asset, component, and distribution-license evidence risks without claiming legal clearance",
      argsSchema: GameLegalAuditPromptArgumentsSchema,
    },
    async (arguments_) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: await workflows.auditGameLegal(arguments_),
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
