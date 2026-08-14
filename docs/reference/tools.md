# Tool reference

GamePlayerLens exposes exactly 14 MCP tools and two prompts. All tools return a structured `{data, warnings, meta?}` envelope unless the protocol requires image content in addition to that envelope.

## Tools

| Tool | Purpose |
|---|---|
| `steam_search` | Resolve a known game name to Steam appid candidates |
| `steam_brief` | Collect bounded store, regional price, review, update, current snapshot, and competitor evidence with readiness gaps |
| `steam_fetch` | Fetch three-region pricing, English/Japanese/German store copy, categories, images, reference links, and SteamSpy data |
| `steam_reviews` | Fetch recent reviews filtered by language, polarity, and minimum playtime |
| `steam_timeline` | Fetch a current SteamSpy snapshot and optional ITAD price history |
| `steam_updates` | Fetch official Steam announcements with update selection, classification evidence, highlights, and cadence |
| `derive_personas` | Build a traceable review pack, schema, generation limits, and persona instructions; `market` and `language` are required |
| `save_persona` | Validate a generated persona against an exact `derive_personas` result handle and atomically save its server grounding |
| `ui_capture` | Capture a normal page through Obscura or save an allowlisted Steam CDN JPEG |
| `get_knowledge` | List or read canonical templates, rubrics, personas, and compatibility intel |
| `get_status` | Report data-root writability and optional integration status without secrets or absolute paths |
| `steam_discover` | Find SteamSpy tag/genre candidates or intersect up to four values |
| `save_artifact` | Save intel JSON, canonical evaluation Markdown, or an immutable simulation run |
| `get_artifact` | List or read intel, evaluations, runs, captures, and UI references |

## Prompts

- `run-sim` orchestrates intake, evidence collection, review-grounded virtual-player rounds, domain review, criticism, evaluation storage, and run storage. `domains` must explicitly name at least one domain; omission returns `needs-input`, and a ready prompt receives only the named domain recipe sections.
- `ui-blind-compare` freezes a pre-reveal UI judgment before identity mapping is disclosed.

Prompt arguments are strings. Structured values such as `projectBrief`, `conceptTest`, `firstContactTest`, `playtestSession`, and `playtestCohort` are JSON-encoded strings at the MCP prompt boundary.

## Partial success and provenance

External fetches preserve successful source data when another endpoint fails. Always retain `warnings`; they are part of the evidence envelope.

Results smaller than 1 MiB from `steam_search`, `steam_brief`, `steam_discover`, `steam_fetch`, `steam_reviews`, `steam_timeline`, `steam_updates`, and `derive_personas` include a short-lived `meta.resultHandle`. Pass the handle with `target` and `id` to `save_artifact(kind=intel)` immediately. The server then saves the normalized source envelope, including warnings and metadata, without model transcription.

For persona generation, pass that same `derive_personas` handle as `derivationResultHandle` to `save_persona`. The server compares every selected review field and the audience/source-role context with the cached tool result, then stores a SHA-256 binding to the exact result. An unknown, expired, non-derivation, blocked, or mismatched result is rejected.

The result store retains only the most recent 32 handles in the current MCP process. Handles expire when that process ends.

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

`save_artifact` supports three write modes:

- `kind=intel`: exact-save a result handle or directly save a validated JSON envelope.
- `kind=evaluation`: save Markdown that passes the canonical report structure and evidence checks.
- `kind=run`: seal the review context, dependencies, structured virtual-player and reviewer rounds, warnings, confidence, and final evaluation in an immutable run record.

Intel and evaluation writes default to `overwrite=false`. Experiment specs, measurements, and outcomes are immutable and must not use overwrite. Run IDs are always immutable.

## Artifact reads

| Kind | Arguments | Result |
|---|---|---|
| `intel`, `evaluation`, `run` | no `target` | target ID list |
| `intel`, `evaluation`, `run` | `target`, no `id` | artifact metadata list |
| `intel`, `evaluation` | `target` and `id` | JSON or Markdown content |
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
