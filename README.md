# GamePlayerLens

GamePlayerLens is an operation-first, review-grounded virtual-player and evidence-review MCP server for game teams. Its shortest loop is `play build → form grounded player hypotheses → make the smallest change → ask a human to falsify them`. Milestone auditing remains available after the build produces useful evidence. It combines direct build operation, review-derived player memories, UI stimuli, human observations, and—only when the decision needs them—Steam and competitor data to answer four questions:

- What happened when one bounded player task was operated?
- How might different grounded player lenses interpret that response?
- What is the smallest playable change to try next?
- At a milestone, is there enough evidence to advance?

Review-derived personas remain part of the process, but they are evidence-grounded lenses for generating questions and response hypotheses—not substitutes for people who played the game. The server validates inputs, collects and normalizes evidence, stores artifacts, and checks coverage and integrity. The AI model in your MCP client writes the review; GamePlayerLens does not run a server-side LLM.

## Quick start

From the game repository that should use GamePlayerLens, install the version-pinned v0.6.1 Agent Skill and confirm that the project can see it:

```bash
cd /path/to/your-game
npx skills add https://github.com/ZaK3939/GamePlayerLens/tree/v0.6.1/skills/game-player-lens --list
npx skills add https://github.com/ZaK3939/GamePlayerLens/tree/v0.6.1/skills/game-player-lens --skill game-player-lens
npx skills list
```

Add `-a codex`, `-a claude-code`, or another supported agent when automatic detection is not appropriate. This installs the Agent Skill; it does not install or register the MCP server that supplies data, storage, and prompts.

The Skill does not install the MCP server. With Node.js 22 or newer, run the version-pinned server doctor directly from GitHub before editing client configuration:

```bash
npx --yes --package=github:ZaK3939/GamePlayerLens#v0.6.1 game-player-lens doctor
```

The doctor returns JSON, never secrets or absolute paths, and exits unsuccessfully when Node or storage is not ready. Storage readiness runs the same create-only `write → flush → hard-link publish → read-back → cleanup` primitive used by artifact saves; a writable-directory check alone is not treated as sufficient. Register that same pinned package in the MCP configuration used by your client:

```bash
npx --yes --package=github:ZaK3939/GamePlayerLens#v0.6.1 game-player-lens docs list
```

This machine-readable index lets an agent discover version-matched operational docs without web search. Use `docs show developer-project` or another listed name for the full topic.

```json
{
  "mcpServers": {
    "game-player-lens": {
      "command": "npx",
      "args": [
        "--yes",
        "--package=github:ZaK3939/GamePlayerLens#v0.6.1",
        "game-player-lens"
      ]
    }
  }
}
```

Enable the server and restart the client. Verify both layers independently: **Skill check:** invoke `$game-player-lens` from the game repository. **MCP check:** call `get_status` with no arguments. It reports `storage.publicationReady`, the checked publication primitive, an opaque storage identity that can be compared with doctor, agent-callable workflow counts, and optional integration state—without returning secrets or absolute paths. Clone the repository only for development; `.mcp.json` remains the repository-local development configuration. CI verifies the complete build, test, stdio, doctor, and packaged-CLI gates on Linux, Windows, and macOS on Apple Silicon.

For a playable development build, start with `play_build` rather than a full audit:

```json
{
  "target": "Project Nyx",
  "buildUrl": "http://localhost:4173/play",
  "buildId": "prototype-042",
  "task": "Complete one delivery and read the result",
  "controls": "Keyboard and mouse",
  "startState": "At the dock before construction",
  "endState": "The delivery result is visible",
  "playerLensMode": "neutral",
  "timeLimitMinutes": "12"
}
```

For a virtual-player panel, operate this exact task in `neutral` mode first. Then derive and save personas from reviews selected for the observed question, and repeat it with `playerLensMode=grounded-personas` plus their `personaIds`. Submit the shared observed stimulus and lens hypotheses to `record_player_panel`; it resolves exact review text, verifies research-question grounding, binds each saved persona SHA-256, and returns an exact-save handle. Predictions remain hypotheses until people falsify or support them.

When the immediate question is whether the playable core lands, add the optional `coreClaim`. It declares the theme plus distinctive system, intended experience and reward, proof moment, and optional amplifier. `play_build` then returns a Core Delivery Trace alongside the Action → Response Trace. Omit it for neutral operation; GamePlayerLens will not infer the intended core from genre labels, visual resemblance, or the build's appearance.

If known execution blockers already prevent that task, pass one per line in intended repair order as `knownBlockers`. The route repairs the first blocker while preserving the rest in a short Repair First Card, without operating the build, researching Steam, deriving personas, saving artifacts, or running an audit. After a candidate build exists, use `review_change`. Use `audit_project` only at vertical-slice, demo, release, or another milestone boundary.

## Choose a workflow

| Goal | Start here | Guide |
|---|---|---|
| Operate one build task through player lenses | `play_build` with build, task, controls, and start/end state; preserve local images with `save_capture` | [Developer projects](docs/guides/developer-project.md) |
| Build a grounded virtual-player panel | neutral `play_build` → `derive_personas` / `save_persona` → grounded `play_build` on the same task | [Developer projects](docs/guides/developer-project.md#run-evidence-grounded-player-lens-rounds) |
| Validate and preserve that panel | `validate_player_panel` → `record_player_panel` → exact `save_result` | [Tool reference](docs/reference/tools.md#partial-success-and-provenance) |
| Repair already-known execution blockers | `play_build` with `target` and newline-separated `knownBlockers` | [Developer projects](docs/guides/developer-project.md#repair-first-routing) |
| Review one proposed revision | `review_change` with `currentState`, `proposal`, and `revisionBundle` | [Developer projects](docs/guides/developer-project.md) |
| Audit a concept, prototype, vertical slice, or milestone | `audit_project`; active projects also require an `auditSnapshotBundle` | [Developer projects](docs/guides/developer-project.md) |
| Audit a released Steam game | `steam_search` → `steam_brief`, then `audit_project` | [Existing games](docs/guides/existing-game.md) |
| Spot engine, asset, component, and storefront license risks for one release | `legal_source_plan` → exact-save → `audit_game_legal` | [Tool reference](docs/reference/tools.md#game-legal-audit) |
| Compare UI quality | Either review workflow with the `ui` domain and a concrete `uiBenchmarkTask` | [Existing games: UI comparison](docs/guides/existing-game.md#ui-comparison) |
| Record a first-contact observation | `record_first_contact`, then pass its handle to either review workflow | [Developer projects](docs/guides/developer-project.md#first-contact-test) |
| Record a playtest or revision | Either review workflow with `playtestSession` or `playtestCohort` | [Experiments and playtests](docs/reference/experiments.md) |
| Detect repeated review without new evidence | `coach_history` after at least two saved developer-project runs | [Developer projects](docs/guides/developer-project.md#coach-the-iteration-history) |
| Report or inspect agent friction with GamePlayerLens itself | `report_agent_experience` / `summarize_agent_experience` | [Tool reference](docs/reference/tools.md#agent-experience-feedback) |
| Read previous evidence or reviews | `get_artifact` | [Tool reference](docs/reference/tools.md) |

## What GamePlayerLens does

| Stage | Capability | Typical output |
|---|---|---|
| Route | Stop known blockers before research or audit | Repair First Card and re-entry condition |
| Play | Operate one bounded task in a playable build | Action → Response Trace |
| Trace the core | Compare declared theme/system and experience/reward delivery with one operation | Core Delivery Trace and one primary drift |
| Hypothesize | Replay the same observed stimulus through explicit grounded personas | Virtual Player Panel with confidence and human falsifier |
| Fix | Choose the smallest change and the least costly delivery topology that can alter the next operation | compact Build Handoff with change, invariants, task, success signal, and guardrail |
| Human check | Preserve first-contact and playtest observations without merging them into AI evidence | bounded participant reports and falsification result |
| Compare | Review gameplay, storefront, UI, price, localization, and competition against matched evidence | Data Coverage Matrix, domain findings, UI quality gaps |
| Audit | Decide whether a milestone or bounded revision should advance | structured Decision Card, immutable evidence run, prioritized backlog |
| Legal issue spotting | Bind one release to current public terms, exact item licenses, and supplied private agreements | Legal Risk Card, source register, missing evidence, counsel handoff |
| Coach | Detect review loops that did not add a build, direct stimulus, or human handoff | one deterministic finding card, its stop condition, and the latest saved review action |
| Research | Collect current Steam, review, update, price, and competitor evidence when the selected decision requires it | `steam_brief`, provenance, supported decisions, gaps |
| Learn | Preserve explicit agent success and friction without hidden telemetry | local feedback records and evidence-gated issue candidates |

The five workflows are available both as agent-callable tools (`play_build`, `review_change`, `audit_project`, `ui_blind_compare`, `audit_game_legal`) and as matching hyphenated MCP prompts for clients that expose user-invoked prompt menus. Agents should call the tools; prompt-only clients may use the slash-command surface. Both paths render the same versioned instructions.

The five workflows are:

- `audit_game_legal`: reads an exact `legal_source_plan` result through the bundled `game-legal-audit` skill and produces a source-cited, release-scoped risk review. It never promises legal clearance.
- `play_build`: the default development loop. It operates one bounded task and returns a compact Player Probe Card with Action → Response, optional Core Delivery traces, and an indie-sized Build Handoff, not a milestone verdict.
- `review_change`: the daily current-versus-candidate revision review. It fixes `mode=change`, requires a revision bundle, and prioritizes changed findings.
- `audit_project`: the milestone readiness review for the current project or released game. It fixes `mode=baseline` internally.
- `ui_blind_compare`: a pre-reveal UI comparison workflow that separates reference identity from scoring.

`play_build` never returns GO / HOLD / NO-GO. The two decision workflows lead with a compact Decision Check: verdict, up to three proven items, up to three unproven items, the highest risk, and no more than three next validations.

The server currently exposes exactly 30 tools. See the [tool reference](docs/reference/tools.md) for their inputs, outputs, and storage behavior.

## Agent experience feedback

`report_agent_experience` lets an agent explicitly record a meaningful success, partial result, failure, confusion, parameter guess, give-up, or feature request about the Skill, MCP, or onboarding. Reports are create-only local artifacts. GamePlayerLens does not silently record tool calls, prompts, or sessions and does not transmit these reports to an external analytics service.

`summarize_agent_experience` groups those reports by a stable signal key. A signal becomes eligible for issue review only after reports carry at least two distinct pseudonymous session IDs. IDs are caller-provided and do not prove independent agents or users. This never creates a GitHub issue or pull request: reproduction and user approval remain required.

## What it does not prove

GamePlayerLens deliberately refuses several shortcuts:

- Tags, store copy, and reviews do not prove internal game logic or balance.
- A static image does not prove motion, latency, controller feel, or hidden states.
- One AI-operated playtest does not represent human fun, demand, completion, or retention.
- A polarity-balanced persona sample does not represent market proportions.
- SteamSpy owners are estimate ranges, not unit sales; current CCU is a timestamped snapshot, not a historical trend.
- Wishlists alone do not prove fun, sales, or algorithmic visibility.
- A rule-valid Steam price or launch discount does not prove conversion, demand, or net revenue; Steam Release Readiness is publication feasibility, not player or market readiness.
- A high review percentage alone does not establish a successful or relevant competitor.
- A prediction run is not an executed experiment.
- A player lens's predicted feeling or continuation decision is not a human report or population rate.
- Iteration coaching detects repeated evidence state; it does not grade effort, game quality, fun, or commercial potential.
- A legal source plan or AI issue-spotting review is not legal advice, ownership proof, non-infringement assurance, or release clearance.

Missing evidence remains missing. It is never silently converted to zero, success, or an industry average. Read [Evidence and integrity](docs/reference/evidence-and-integrity.md) for the complete interpretation rules.

## Optional configuration

The server starts without external keys. Missing integrations produce scoped warnings and setup instructions instead of blocking unrelated analysis.

```bash
export ITAD_API_KEY="your-isthereanydeal-api-key"
export OBSCURA_PATH="/absolute/path/to/obscura"
export GAME_PLAYER_LENS_HOME="/absolute/path/to/player-research-data"
export GAME_PLAYER_LENS_PROJECT_ROOT="/absolute/path/to/your-game"
```

- `ITAD_API_KEY` enables IsThereAnyDeal price history.
- `OBSCURA_PATH` enables normal page capture. Loopback capture requires Obscura v0.1.6 or newer with private-network support.
- `GAME_PLAYER_LENS_HOME` changes the packaged CLI data root. The default is `~/.game-player-lens/`; direct repository execution uses the repository-local layout.
- `GAME_PLAYER_LENS_PROJECT_ROOT` fixes the allowed root for `save_capture` project-file imports. Without it, the MCP server process working directory is used.

GUI clients may not inherit shell exports. Put the variables in the client's MCP server configuration when necessary, omit empty values, and restart the client after changing them.

## Storage and safety

Fetched tool results use a common `{data, warnings, meta?}` envelope. Eligible results include a short-lived `meta.resultHandle`; save that handle immediately with `save_result` to preserve the exact normalized source response instead of asking the model to reconstruct JSON. Use `save_intel` only for bounded caller-authored JSON, `save_evaluation` for canonical review Markdown, `save_run` for a sealed review run, and `save_capture` for a PNG/JPEG supplied as project-relative file or base64. The named tools deliberately replace the former overloaded save mode.

Artifacts are stored beneath the configured data root:

```text
knowledge/intel/{targetId}/{artifactId}.json
workspaces/{targetId}/{date}-{topicId}.md
workspaces/{targetId}/runs/{runId}.json
knowledge/intel/captures/{captureId}.capture.json + {captureId}.{png|jpg}
knowledge/ui-references/{referenceId}.png
```

Every artifact and persona ID is create-only. To revise evidence, save a new ID and bind that revision in the next audit or change bundle. Both `save_capture` and `ui_capture` publish through one capture path: claim the logical ID with an immutable manifest, then publish exactly one declared PNG or JPEG. They fully decode the compressed pixels before publication and bind format, dimensions, byte length, and SHA-256; reads reject later byte drift. The server never replaces a published file; this removes the Windows overwrite-rename path that could fail under antivirus or file-indexer locks.

Agent-experience feedback is stored separately under the canonical `gameplayerlens-agent-experience` intel target. It rejects credential-like text and absolute paths; reporters must also attest that they did not include raw prompts or proprietary artifacts.

Display names are normalized to safe IDs. Arbitrary paths, traversal, symlink escapes, credentials in URLs, and unbounded payloads are rejected. See [Evidence and integrity](docs/reference/evidence-and-integrity.md) for size limits, canonical evaluation rules, and run verification.

Legal evidence requires an explicit processing mode. `metadata-only` keeps artifact contents unread, `redacted-artifacts` limits the client to approved excerpts, and `approved-environment` records the user's authorization decision before full-document access. GamePlayerLens never treats that declaration as proof of authority or legal clearance.

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

Evidence collection and review for released Steam games remain the strongest validated workflow. `derive_personas` requires explicit research questions with concrete `evidenceSignals` and a source selection for every appid. Reviews that contain none of a source's mapped signals are removed before generation. Direct or adjacent competitors need at least three declared fit axes; persona references are limited to system references, so visual-quality and market-success examples cannot silently become player voice. `save_persona` requires the original derivation handle and rejects source-selection drift or a citation whose exact review did not match the pattern's research question. These deterministic checks prevent an unrelated market-awareness comment from silently supporting a gameplay claim. They do not make the server an automatic judge of broader meaning. Calibration against repeated real-player responses and continued end-to-end dogfooding with playable builds remain the highest-value validation work.

## Documentation

- [Developer projects](docs/guides/developer-project.md): Project Briefs, concept tests, first-contact evidence, and moment-to-moment experience reviews.
- [Existing games](docs/guides/existing-game.md): Steam triage, domains, competitor selection, updates, localization, price, and UI comparison.
- [Tool reference](docs/reference/tools.md): all 30 tools, agent-callable workflows, validated player panels, local capture import, feedback, legal issue spotting, result handles, iteration coaching, and immutable artifact semantics. The packaged CLI also exposes these versioned docs through `game-player-lens docs list` / `game-player-lens docs show <name>` and advertises those commands in help, version, and errors.
- [Evidence and integrity](docs/reference/evidence-and-integrity.md): coverage, provenance, persona boundaries, canonical evaluations, and immutable runs.
- [Experiments and playtests](docs/reference/experiments.md): sessions, cohorts, retest lineage, prediction runs, measurements, and outcomes.
- [Dogfood data policy](docs/dogfood/README.md): how private raw research is separated from publishable summaries.
- [v1.1 design](docs/superpowers/specs/2026-08-11-steam-user-sim-v1-1-user-workflow-design.md) and [implementation plan](docs/superpowers/plans/2026-08-11-steam-user-sim-v1-1-user-workflow.md).
