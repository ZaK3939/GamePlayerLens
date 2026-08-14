# Tool reference

GamePlayerLens exposes exactly 16 MCP tools and four prompts. All tools return a structured `{data, warnings, meta?}` envelope unless the protocol requires image content in addition to that envelope.

## Tools

| Tool | Purpose |
|---|---|
| `steam_search` | Resolve a known game name to Steam appid candidates |
| `steam_brief` | Collect bounded store, regional price, review, update, current snapshot, and competitor evidence with readiness gaps |
| `steam_fetch` | Fetch three-region pricing, English/Japanese/German store copy, categories, images, reference links, and SteamSpy data |
| `steam_reviews` | Fetch recent reviews filtered by language, polarity, and minimum playtime |
| `steam_timeline` | Fetch a current SteamSpy snapshot and optional ITAD price history |
| `steam_updates` | Fetch official Steam announcements with update selection, classification evidence, highlights, and cadence |
| `derive_personas` | Build a traceable review pack, schema, generation limits, and persona instructions; audience, research questions, and an explicit source-fit selection are required |
| `save_persona` | Validate a generated persona against an exact `derive_personas` result handle and atomically save its server grounding |
| `record_first_contact` | Normalize a compact pseudonymous first-contact test with a fixed unaided question protocol and return an exact-save handle |
| `ui_capture` | Capture a normal page through Obscura or save an allowlisted Steam CDN JPEG |
| `get_knowledge` | List or read canonical templates, rubrics, personas, and compatibility intel |
| `get_status` | Report data-root writability and optional integration status without secrets or absolute paths |
| `coach_history` | Detect repeated review without a new build, direct stimulus, or human handoff across verified developer-project runs |
| `steam_discover` | Find SteamSpy tag/genre candidates or intersect up to four values |
| `save_artifact` | Save intel JSON, canonical evaluation Markdown, or an immutable review run |
| `get_artifact` | List or read intel, evaluations, runs, captures, and UI references |

## Prompts

- `play-build` is the operation-first development loop. With no declared blockers it requires a credential-free build URL, build ID, task, controls, start state, and end state. Its optional `coreClaim` adds a Core Delivery Trace. It returns a Player Probe Card and never starts Steam research, persona derivation, a full audit, or mandatory persistence.
- `review-change` reviews one current-to-candidate revision, fixes `mode=change` internally, and requires `currentState`, `proposal`, and a Git/build/artifact-bound `revisionBundle`.
- `audit-project` reviews current milestone readiness and fixes `mode=baseline` internally. An active `developer-project` also requires an artifact-bound `auditSnapshotBundle`. Supplying `knownBlockers` short-circuits a premature audit to Repair First without requiring the full intake.
- `ui-blind-compare` freezes a pre-reveal UI judgment before identity mapping is disclosed.

`play-build` is intentionally separate from the two decision prompts. It operates one task, distinguishes observed responses from persona hypotheses, traces an optional declared core, proposes one smallest change, and hands one falsifiable question to a person. The decision prompts orchestrate evidence collection, domain review, criticism, evaluation storage, and run storage. They lead with a compact Decision Check before detailed findings.

Prompt arguments are strings. Structured values such as `coreClaim`, `projectBrief`, `conceptTest`, `auditSnapshotBundle`, `playtestSession`, and `playtestCohort` are JSON-encoded strings at the MCP prompt boundary. `coreClaim` declares a one-sentence promise, theme, distinctive system, intended experience, one of the six reward families, intended reward, proof moment, and optional amplifier. First-contact input goes through `record_first_contact`; pass its result handle as `firstContactResultHandle`.

`knownBlockers` is newline-separated. When non-empty, its Repair First route takes precedence over missing build or audit fields. `personaIds` is a comma-separated list of already saved personas; `play-build` never derives personas implicitly.

## Partial success and provenance

External fetches preserve successful source data when another endpoint fails. Always retain `warnings`; they are part of the evidence envelope.

Results smaller than 1 MiB from `steam_search`, `steam_brief`, `steam_discover`, `steam_fetch`, `steam_reviews`, `steam_timeline`, `steam_updates`, `derive_personas`, and `record_first_contact` include a short-lived `meta.resultHandle`. Pass evidence handles with `target` and `id` to `save_artifact(kind=intel)` immediately. The server then saves the normalized source envelope, including warnings and metadata, without model transcription. For first contact, pass the same handle to the review prompt first so it can include the normalized observations and expose the exact-save pointer.

For persona generation, every requested appid needs an explicit `sourceRoles` entry linked to one of one-to-three `researchQuestions`. Each question has one-to-twelve `evidenceSignals` of 2–80 characters. The server applies Unicode/case normalization, removes reviews containing none of the signals mapped to their source, and records the matched question IDs and signals. A competitor source must be direct or adjacent and declare at least three fit axes. A reference source is limited to `system-reference`; visual references and market-success anchors belong in their own evidence ledgers, not persona voice. Pass the same `derive_personas` handle as `derivationResultHandle` to `save_persona`. The server compares every selected review field, research question, audience, and source-selection field with the cached result, then stores a SHA-256 binding to that result. Every saved voice must support an observed pattern whose evidence entry explains its relevance, and its matched question ID must equal the pattern's question. These deterministic checks expose and enforce a lexical relevance boundary; they do not prove the broader interpretation is true.

```json
{
  "appids": [1145360, 588650],
  "market": "United States",
  "language": "english",
  "researchQuestions": [
    {
      "id": "combat-readability",
      "question": "Which signals make the combat choice and result readable?",
      "evidenceSignals": ["combat", "controls", "attack", "feedback"]
    }
  ],
  "sourceRoles": [
    {
      "appid": 1145360,
      "role": "target",
      "fitRole": "target-game",
      "matchedAxes": ["player-problem"],
      "researchQuestionIds": ["combat-readability"],
      "rationale": "Target reviews directly describe the current readability problem."
    },
    {
      "appid": 588650,
      "role": "competitor",
      "fitRole": "adjacent-competitor",
      "matchedAxes": ["repeated-action", "decision-cadence", "system-response"],
      "researchQuestionIds": ["combat-readability"],
      "rationale": "The repeated combat action, decision cadence, and visible response match this question."
    }
  ]
}
```

Allowed match axes are `repeated-action`, `decision-cadence`, `system-response`, `reward-structure`, `player-problem`, `session-shape`, `platform-controls`, and `audience-expectation`.

The result store retains only the most recent 32 handles in the current MCP process. Handles expire when that process ends.

## Iteration coaching

Call `coach_history` only after saving at least two `developer-project` runs for the same target. `target` is the stored target display name or ID. `limit` is optional, defaults to 10, and accepts 2–20 recent runs.

```json
{
  "target": "Project Nyx",
  "limit": 10
}
```

The read-only tool uses only runs whose integrity is currently verified. It derives build identity from the bound audit or candidate revision bundle and counts only evidence aliases cited by stored review rounds. It reports three deterministic conditions:

- `fix-now-without-new-build`: a `fix-now` decision was followed by another review of the same Git/build identity;
- `review-without-new-stimulus`: the same build was reviewed without a new cited capture, UI reference, first-contact result, playtest, or direct experiment measurement;
- `human-handoff-stall`: the same normalized human validation question appeared in consecutive reviews without new cited human evidence.

The result leads with the highest-priority next action and the evidence condition that resolves it. It does not calculate a composite score, infer fun or demand, inspect unsaved `play-build` responses, or replace the next operation or human session. A finding means the stored iteration history repeated an evidence state; it is not a judgment of developer productivity or game quality.

## Discovery

`steam_discover` accepts a primary `kind` and `value`, up to three `additionalValues`, up to 50 `excludeAppids`, and a result limit of 1 to 50. Intersection candidates must occur in the first 50 valid SteamSpy entries for every requested value. They are ordered by the sum of source positions, with primary-source order breaking ties.

```json
{
  "kind": "tag",
  "value": "Action Roguelike",
  "additionalValues": ["Rogue-lite", "Hack and Slash"],
  "excludeAppids": [1145350],
  "limit": 10
}
```

`matchedValues` and `sourceRanks` explain the intersection. They do not prove final similarity, quality, success, or market fit.

## Image capture

The default `ui_capture` source type is `page`, which uses Obscura to capture a credential-free HTTP(S) page as PNG. If capture is unavailable, the tool returns a manual placement path under `knowledge/ui-references/`.

Use `sourceType=steam-image` for a JPEG URL returned by `steam_fetch.screenshots`:

```json
{
  "url": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145350/example.jpg",
  "name": "hades-ii-store-shot",
  "sourceType": "steam-image"
}
```

Direct image fetches are limited to `steamstatic.com` and its subdomains. Credentials, custom ports, redirects, non-JPEG payloads, and files larger than 6 MiB are rejected. `viewport` and `fullPage` apply only to normal page capture.

## Artifact writes

`save_artifact` supports three artifact kinds:

- `kind=intel`: exact-save a result handle or directly save a validated JSON envelope.
- `kind=evaluation`: save Markdown that passes the canonical report structure and evidence checks, then return its structured `decisionCard` and compact `developerSummary`.
- `kind=run`: seal the review context, dependencies, structured virtual-player and reviewer rounds, warnings, confidence, and final evaluation in an immutable run record.

All intel, evaluation, run, and persona IDs are immutable. Reusing an existing ID is rejected. Save every revision under a new ID and connect it through an audit snapshot, revision bundle, or experiment lineage.

## Artifact reads

| Kind | Arguments | Result |
|---|---|---|
| `intel`, `evaluation`, `run` | no `target` | target ID list |
| `intel`, `evaluation`, `run` | `target`, no `id` | artifact metadata list |
| `intel` | `target` and `id` | saved JSON content and metadata |
| `evaluation` | `target` and `id` | saved Markdown, metadata, structured Decision Card, and developer summary |
| `run` | `target` and `id` | run metadata, record, and integrity report |
| `capture`, `ui-reference` | no `id` | image metadata list |
| `capture`, `ui-reference` | `id` | metadata and valid `ImageContent` when at most 6 MiB |

An `id` without `target` is invalid for target-scoped artifacts. A `target` is invalid for image artifacts.

## Data layout

```text
knowledge/intel/{targetId}/{artifactId}.json
workspaces/{targetId}/{date}-{topicId}.md
workspaces/{targetId}/runs/{runId}.json
knowledge/intel/captures/{captureId}.{png|jpg}
knowledge/ui-references/{referenceId}.png
```

Direct repository execution uses the repository as the data root. The packaged CLI uses `GAME_PLAYER_LENS_HOME`, or `~/.game-player-lens/` when unset. Tool responses always return paths relative to that data root.

## Client requirements

The client must support MCP tools, MCP prompts, and standard MCP `ImageContent`. Filesystem access, subagents, and custom image tools are optional.

A browser-capable client may operate an HTTP(S) build. A client without browser or desktop control must use a user recording, consecutive captures, an input log, or a moderated session and state the limitation. The MCP server itself does not execute arbitrary native game files.
