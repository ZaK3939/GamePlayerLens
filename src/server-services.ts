import {readFile} from "node:fs/promises";
import {
  createArtifactStore,
  type ArtifactStore,
} from "./artifacts.js";
import {createDeveloperBriefFetcher} from "./brief.js";
import {createCaptureService} from "./capture.js";
import {discoverGames} from "./discovery.js";
import {createImageService, type ImageService} from "./images.js";
import {createKnowledgeReader, type KnowledgeReader} from "./knowledge.js";
import {buildLegalSourcePlan} from "./legal.js";
import {
  createPersonaStore,
  type PersonaStore,
} from "./persona-store.js";
import {
  buildDerivationPack,
} from "./personas.js";
import {initializeRepositoryPaths, type PathResolver} from "./paths.js";
import {createResultStore, type ResultStore} from "./results.js";
import {fetchReviews} from "./reviews.js";
import {createRunStore, type RunStore} from "./runs.js";
import {fetchGame, searchGames} from "./steam.js";
import {fetchTimeline} from "./timeline.js";
import {fetchUpdates} from "./updates.js";

export interface ServerServices {
  resolver: PathResolver;
  searchGames: typeof searchGames;
  buildDeveloperBrief: ReturnType<typeof createDeveloperBriefFetcher>;
  discoverGames: typeof discoverGames;
  fetchGame: typeof fetchGame;
  fetchReviews: typeof fetchReviews;
  fetchTimeline: typeof fetchTimeline;
  fetchUpdates: typeof fetchUpdates;
  buildLegalSourcePlan: typeof buildLegalSourcePlan;
  buildDerivationPack: typeof buildDerivationPack;
  savePersona: PersonaStore["savePersona"];
  loadPersona: PersonaStore["loadPersona"];
  captureUrl: ReturnType<typeof createCaptureService>;
  readKnowledge: KnowledgeReader;
  readSkill(id: string): Promise<string>;
  artifactStore: ArtifactStore;
  runStore: RunStore;
  imageService: ImageService;
  resultStore: ResultStore;
}

export function createServerServices(
  overrides: Partial<ServerServices>,
): ServerServices {
  const resolver = overrides.resolver ?? initializeRepositoryPaths();
  const personaStore = createPersonaStore(resolver);
  const {buildDeveloperBrief, ...serviceOverrides} = overrides;
  const defaults: Omit<ServerServices, "buildDeveloperBrief"> = {
    resolver,
    searchGames,
    discoverGames,
    fetchGame,
    fetchReviews,
    fetchTimeline,
    fetchUpdates,
    buildLegalSourcePlan,
    buildDerivationPack,
    savePersona: personaStore.savePersona,
    loadPersona: personaStore.loadPersona,
    captureUrl: createCaptureService({resolver}),
    readKnowledge: createKnowledgeReader(resolver, personaStore),
    readSkill: (id) => readFile(resolver.resolveSkillPath(id), "utf8"),
    artifactStore: createArtifactStore(resolver),
    runStore: createRunStore(resolver),
    imageService: createImageService(resolver),
    resultStore: createResultStore(),
  };
  const services = {...defaults, ...serviceOverrides, resolver};
  return {
    ...services,
    buildDeveloperBrief: buildDeveloperBrief ?? createDeveloperBriefFetcher({
      fetchGame: services.fetchGame,
      fetchReviews: services.fetchReviews,
      fetchTimeline: services.fetchTimeline,
      fetchUpdates: services.fetchUpdates,
      discoverGames: services.discoverGames,
    }),
  };
}
