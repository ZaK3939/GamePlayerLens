# GamePlayerLens

GamePlayerLens is an evidence-driven review agent for game teams. It reviews each playable revision through grounded player lenses and tells an AI client whether the project has enough evidence to advance. It combines current Steam data, review-derived player memories, matched competitors, UI stimuli, project briefs, playtest observations, and immutable review runs to answer four questions:

- Should this change or milestone advance now?
- What is supported by evidence?
- What is still unknown?
- What are the smallest useful validations to run next?

Review-derived personas remain part of the process, but they are evidence-grounded lenses for generating questions and response hypotheses—not substitutes for people who played the game. The server validates inputs, collects and normalizes evidence, stores artifacts, and checks coverage and integrity. The AI model in your MCP client writes the review; GamePlayerLens does not run a server-side LLM.

## Quick start

Requirements: a supported Node.js LTS release (22 or newer) and pnpm 10 or newer. CI verifies the complete build, test, stdio, and packaged-CLI gates on Linux, Windows, and macOS on Apple Silicon.

```bash
pnpm install
pnpm build
pnpm smoke:stdio
```

The repository includes `.mcp.json`, which starts the stdio server with `pnpm tsx src/index.ts`. Enable the `game-player-lens` server in your MCP client, then restart the client.

To use the packaged CLI instead:

```bash
pnpm pack
npm install --global ./game-player-lens-0.2.0.tgz
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

For a copy-runnable first review, call `audit-project` with a released game and one bounded decision:

```json
{
  "target": "Hades",
  "topic": "Current Japanese store promise and competitive position",
  "subjectKind": "existing-game",
  "domains": "storefront,competition",
  "market": "Japan",
  "language": "japanese"
}
```

For everyday development, use `review-change`. It fixes the workflow to a current-versus-candidate revision and requires a `revisionBundle` that binds both Git commits and build IDs to saved artifact SHA-256 values. This prevents screenshots, receipts, or test results from another build entering the change run. The [developer-project guide](docs/guides/developer-project.md) defines the bundle. Use `audit-project` at vertical-slice, demo, release, or other milestone boundaries.

## Choose a workflow

| Goal | Start here | Guide |
|---|---|---|
| Review one proposed revision | `review-change` with `currentState`, `proposal`, and `revisionBundle` | [Developer projects](docs/guides/developer-project.md) |
| Audit a concept, prototype, vertical slice, or milestone | `audit-project` with `subjectKind=developer-concept` or `developer-project` | [Developer projects](docs/guides/developer-project.md) |
| Audit a released Steam game | `steam_search` → `steam_brief`, then `audit-project` | [Existing games](docs/guides/existing-game.md) |
| Compare UI quality | Either review prompt with the `ui` domain and a concrete `uiBenchmarkTask` | [Existing games: UI comparison](docs/guides/existing-game.md#ui-comparison) |
| Record a playtest or revision | Either review prompt with `playtestSession` or `playtestCohort` | [Experiments and playtests](docs/reference/experiments.md) |
| Read previous evidence or reviews | `get_artifact` | [Tool reference](docs/reference/tools.md) |

## What GamePlayerLens does

| Stage | Capability | Typical output |
|---|---|---|
| Understand | Collect store data, regional prices, reviews, updates, current snapshots, and candidate competitors | `steam_brief`, provenance, supported decisions, gaps |
| Structure | Turn developer intent into a strict Project Brief | Core Experience Map, intake diagnostics |
| Review through player lenses | Expose the same server-grounded v3 personas to current and proposed scenarios | exact derivation memory, explicit research questions, source-fit rationale, explicit stimulus, perceived signals, action, predicted response, uncertainty, human falsifier |
| Compare | Review gameplay, storefront, UI, price, localization, and competition against matched evidence | Data Coverage Matrix, domain findings, UI quality gaps |
| Observe | Preserve concept tests, first-contact tests, playtest sessions, and cohorts | chronological action-response traces and bounded participant reports |
| Decide | Connect a player problem to the smallest change, success signal, guardrail, and revisit condition | one-screen Decision Check, severity-ranked findings, and prioritized backlog |
| Learn | Save source envelopes, personas, evaluations, runs, and experiment outcomes | exact-save artifacts, integrity reports, verified experiment decisions |

The three MCP prompts are:

- `review-change`: the daily current-versus-candidate revision review. It fixes `mode=change`, requires a revision bundle, and prioritizes changed findings.
- `audit-project`: the milestone readiness review for the current project or released game. It fixes `mode=baseline` internally.
- `ui-blind-compare`: a pre-reveal UI comparison workflow that separates reference identity from scoring.

Both main review prompts lead with a compact `Decision Check`: verdict, up to three proven items, up to three unproven items, the highest risk, and no more than three next validations. Detailed findings follow with `Blocker`, `Important`, or `Suggestion` severity and evidence links.

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
- A player lens's predicted feeling or continuation decision is not a human report or population rate.

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

Unicode display names are canonicalized before storage, including composed and decomposed forms commonly encountered on macOS. Repository and packaged operation use the same storage contract on Linux, Windows, and macOS.

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

Evidence collection and review for released Steam games remain the strongest validated workflow. `derive_personas` requires explicit research questions and a source selection for every appid. Direct or adjacent competitors need at least three declared fit axes; persona references are limited to system references, so visual-quality and market-success examples cannot silently become player voice. `save_persona` requires the original derivation handle, rejects source-selection drift, and requires every selected review voice to support an observed pattern with an explicit relevance explanation. These checks make semantic claims auditable; they do not make the server an automatic judge of meaning. Calibration against repeated real-player responses and continued end-to-end dogfooding with playable builds remain the highest-value validation work.

## Documentation

- [Developer projects](docs/guides/developer-project.md): Project Briefs, concept tests, first-contact evidence, and moment-to-moment experience reviews.
- [Existing games](docs/guides/existing-game.md): Steam triage, domains, competitor selection, updates, localization, price, and UI comparison.
- [Tool reference](docs/reference/tools.md): all 14 tools, result handles, image capture, and artifact read/write semantics.
- [Evidence and integrity](docs/reference/evidence-and-integrity.md): coverage, provenance, persona boundaries, canonical evaluations, and immutable runs.
- [Experiments and playtests](docs/reference/experiments.md): sessions, cohorts, retest lineage, prediction runs, measurements, and outcomes.
- [Dogfood data policy](docs/dogfood/README.md): how private raw research is separated from publishable summaries.
- [v1.1 design](docs/superpowers/specs/2026-08-11-steam-user-sim-v1-1-user-workflow-design.md) and [implementation plan](docs/superpowers/plans/2026-08-11-steam-user-sim-v1-1-user-workflow.md).
