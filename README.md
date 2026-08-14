# GamePlayerLens

GamePlayerLens is an MCP server for evidence-grounded game development reviews. It combines current Steam data, traceable player evidence, structured project briefs, UI references, playtest observations, and immutable review artifacts so an AI client can answer three questions clearly:

- What is supported by evidence?
- What is still unknown?
- What is the smallest useful validation to run next?

The server validates inputs, collects and normalizes evidence, stores artifacts, and checks coverage and integrity. The AI model in your MCP client writes the actual review; GamePlayerLens does not run a server-side LLM.

## Quick start

Requirements: a supported Node.js LTS release (22 or newer) and pnpm 10 or newer.

```bash
pnpm install
pnpm build
pnpm smoke:stdio
```

The repository includes `.mcp.json`, which starts the stdio server with `pnpm tsx src/index.ts`. Enable the `game-player-lens` server in your MCP client, then restart the client.

To use the packaged CLI instead:

```bash
pnpm pack
npm install --global ./game-player-lens-0.1.0.tgz
game-player-lens
```

```json
{
  "mcpServers": {
    "game-player-lens": {
      "command": "game-player-lens"
    }
  }
}
```

After connecting, call `get_status` with no arguments. It reports whether the data directory is writable and whether the optional ITAD and Obscura integrations are configured, without returning secrets or absolute paths.

Then run the `run-sim` prompt. All prompt arguments are strings. A minimal existing-game review looks like this:

```json
{
  "target": "Hades",
  "topic": "Current Japan positioning and closest competitors",
  "subjectKind": "existing-game",
  "mode": "baseline",
  "domains": "storefront,competition",
  "market": "Japan",
  "language": "japanese"
}
```

GamePlayerLens will either return an intake question or guide the client through evidence collection, independent review passes, criticism, evaluation storage, and immutable run storage.

## Choose a workflow

| Goal | Start here | Guide |
|---|---|---|
| Review a concept, prototype, vertical slice, or planned change | `run-sim` with `subjectKind=developer-concept` or `developer-project` | [Developer projects](docs/guides/developer-project.md) |
| Review a released Steam game | `steam_search` → `steam_brief`, then `run-sim` | [Existing games](docs/guides/existing-game.md) |
| Compare UI quality | `run-sim` with the `ui` domain and a concrete `uiBenchmarkTask` | [Existing games: UI comparison](docs/guides/existing-game.md#ui-comparison) |
| Record a playtest or revision | `run-sim` with `playtestSession` or `playtestCohort` | [Experiments and playtests](docs/reference/experiments.md) |
| Read previous evidence or reviews | `get_artifact` | [Tool reference](docs/reference/tools.md) |

## What GamePlayerLens does

| Stage | Capability | Typical output |
|---|---|---|
| Understand | Collect store data, regional prices, reviews, updates, current snapshots, and candidate competitors | `steam_brief`, provenance, supported decisions, gaps |
| Structure | Turn developer intent into a strict Project Brief | Core Experience Map, intake diagnostics |
| Compare | Review gameplay, storefront, UI, price, localization, and competition against matched evidence | Data Coverage Matrix, domain findings, UI quality gaps |
| Observe | Preserve concept tests, first-contact tests, playtest sessions, and cohorts | chronological action-response traces and bounded participant reports |
| Decide | Connect a player problem to the smallest change, success signal, guardrail, and revisit condition | Decision Card and prioritized backlog |
| Learn | Save source envelopes, personas, evaluations, runs, and experiment outcomes | exact-save artifacts, integrity reports, verified experiment decisions |

The two MCP prompts are:

- `run-sim`: the primary workflow for evidence collection, review, criticism, and artifact storage.
- `ui-blind-compare`: a pre-reveal UI comparison workflow that separates reference identity from scoring.

The server currently exposes exactly 14 tools. See the [tool reference](docs/reference/tools.md) for their inputs, outputs, and storage behavior.

## What it does not prove

GamePlayerLens deliberately refuses several shortcuts:

- Tags, store copy, and reviews do not prove internal game logic or balance.
- A static image does not prove motion, latency, controller feel, or hidden states.
- One AI-operated playtest does not represent human fun, demand, completion, or retention.
- A polarity-balanced persona sample does not represent market proportions.
- SteamSpy owners are estimate ranges, not unit sales.
- Current CCU is a timestamped snapshot, not a historical trend.
- Wishlists alone do not prove fun, sales, or algorithmic visibility.
- A high review percentage alone does not establish a successful or relevant competitor.
- A prediction run is not an executed experiment.

Missing evidence remains missing. It is never silently converted to zero, success, or an industry average. Read [Evidence and integrity](docs/reference/evidence-and-integrity.md) for the complete interpretation rules.

## Optional configuration

The server starts without external keys. Missing integrations produce scoped warnings and setup instructions instead of blocking unrelated analysis.

```bash
export ITAD_API_KEY="your-isthereanydeal-api-key"
export OBSCURA_PATH="/absolute/path/to/obscura"
export GAME_PLAYER_LENS_HOME="/absolute/path/to/player-research-data"
```

- `ITAD_API_KEY` enables IsThereAnyDeal price history.
- `OBSCURA_PATH` enables normal page capture. Loopback capture requires Obscura v0.1.6 or newer with private-network support.
- `GAME_PLAYER_LENS_HOME` changes the packaged CLI data root. The default is `~/.game-player-lens/`; direct repository execution uses the repository-local layout.

GUI clients may not inherit shell exports. Put the variables in the client's MCP server configuration when necessary, omit empty values, and restart the client after changing them.

## Storage and safety

Fetched tool results use a common `{data, warnings, meta?}` envelope. Eligible results include a short-lived `meta.resultHandle`; save that handle immediately with `save_artifact` to preserve the exact normalized source response instead of asking the model to reconstruct JSON.

Artifacts are stored beneath the configured data root:

```text
knowledge/intel/{targetId}/{artifactId}.json
workspaces/{targetId}/{date}-{topicId}.md
workspaces/{targetId}/runs/{runId}.json
knowledge/intel/captures/{captureId}.{png|jpg}
knowledge/ui-references/{referenceId}.png
```

Display names are normalized to safe IDs. Arbitrary paths, traversal, symlink escapes, credentials in URLs, and unbounded payloads are rejected. See [Evidence and integrity](docs/reference/evidence-and-integrity.md) for size limits, canonical evaluation rules, and run verification.

## Verification

```bash
pnpm build
pnpm test
pnpm smoke:stdio
pnpm smoke:package
pnpm test:live
pnpm smoke:stdio --live
pnpm exec tsx scripts/smoke-package.ts --live
```

Live tests use Hades (`1145360`) for Steam data, Hades II (`1145350`) for Steam image capture, and `Action Roguelike` for SteamSpy discovery. Optional integrations are tested when configured and otherwise must return explicit warnings.

The strongest validated workflow today is evidence collection and review for released Steam games. Developer-project intake, user-supplied concept, first-contact, and playtest evidence, immutable runs, and prospective experiment wiring are implemented and package-tested; continued end-to-end dogfooding with real playable builds remains the highest-value validation area.

## Documentation

- [Developer projects](docs/guides/developer-project.md): Project Briefs, concept tests, first-contact evidence, and moment-to-moment experience reviews.
- [Existing games](docs/guides/existing-game.md): Steam triage, domains, competitor selection, updates, localization, price, and UI comparison.
- [Tool reference](docs/reference/tools.md): all 14 tools, result handles, image capture, and artifact read/write semantics.
- [Evidence and integrity](docs/reference/evidence-and-integrity.md): coverage, provenance, persona boundaries, canonical evaluations, and immutable runs.
- [Experiments and playtests](docs/reference/experiments.md): sessions, cohorts, retest lineage, prediction runs, measurements, and outcomes.
- [Dogfood data policy](docs/dogfood/README.md): how private raw research is separated from publishable summaries.
- [v1.1 design](docs/superpowers/specs/2026-08-11-steam-user-sim-v1-1-user-workflow-design.md) and [implementation plan](docs/superpowers/plans/2026-08-11-steam-user-sim-v1-1-user-workflow.md).
