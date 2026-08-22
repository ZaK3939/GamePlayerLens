# Tool reference

GamePlayerLens exposes exactly 32 MCP tools and six optional prompt shortcuts. All tools return a structured `{data, warnings, meta?}` envelope unless the protocol requires image content in addition to that envelope.

## Tools

| Tool | Purpose |
|---|---|
| `steam_search` | Resolve a known game name to Steam appid candidates |
| `steam_brief` | Collect bounded store, regional price, review, update, current snapshot, and competitor evidence with readiness gaps |
| `steam_fetch` | Fetch three-region pricing, English/Japanese/German store copy, categories, images, reference links, and SteamSpy data |
| `steam_reviews` | Fetch recent reviews filtered by language, polarity, and minimum playtime |
| `steam_timeline` | Fetch a current SteamSpy snapshot and optional ITAD price history |
| `steam_updates` | Fetch official Steam announcements with update selection, classification evidence, highlights, and cadence |
| `legal_source_plan` | Build an exact-saveable release-specific intake and controlling-source plan for engines, assets, components, and distribution agreements |
| `derive_personas` | Build a traceable review pack, schema, generation limits, and persona instructions; audience, research questions, and an explicit source-fit selection are required |
| `save_persona` | Validate a generated persona against an exact `derive_personas` result handle and atomically save its server grounding |
| `record_first_contact` | Normalize a compact pseudonymous first-contact test with a fixed unaided question protocol and return an exact-save handle |
| `validate_player_panel` | Dry-run an incomplete or complete player-panel candidate and return missing fields or grounding errors without saving |
| `record_player_panel` | Validate one shared operated-build stimulus and grounded lens hypotheses against exact saved persona memory, research questions, and persona SHA-256, then return an exact-save handle |
| `record_improvement` | Verify and bind one matched baseline-to-candidate improvement record, then return an exact-save handle |
| `report_agent_experience` | Explicitly record one agent success, partial result, failure, confusion, parameter guess, give-up, or feature request as an immutable local artifact |
| `summarize_agent_experience` | Aggregate explicit local agent feedback and identify repeated signals with distinct caller-provided session IDs that are eligible for a user-approved issue draft |
| `ui_capture` | Capture a normal page through Obscura or save an allowlisted Steam CDN JPEG |
| `save_capture` | Fully decode and import a PNG/JPEG from a project-relative path or bounded base64 into manifest-bound immutable capture evidence |
| `get_knowledge` | List or read canonical templates, rubrics, personas, and compatibility intel |
| `get_status` | Probe create-only publication readiness and report optional integration status without secrets or absolute paths |
| `coach_history` | Detect repeated review without a new build, direct stimulus, or human handoff across verified developer-project runs |
| `steam_discover` | Find SteamSpy tag/genre candidates or intersect up to four values |
| `save_result` | Exact-save one short-lived tool result handle as intel without model transcription |
| `save_intel` | Save bounded caller-authored JSON intel |
| `save_evaluation` | Validate and save canonical review Markdown |
| `save_run` | Validate, hash, and seal an immutable review run |
| `get_artifact` | List or read intel, evaluations, runs, captures, and UI references |
| `play_build` | Return the operation-first build workflow to an agent |
| `improve_build` | Operate, change, and replay one bounded game behavior |
| `review_change` | Return the current-versus-candidate workflow to an agent |
| `audit_project` | Return the milestone audit workflow to an agent |
| `ui_blind_compare` | Return the identity-hidden UI comparison workflow to an agent |
| `audit_game_legal` | Return the release-scoped legal issue-spotting workflow to an agent |

## Workflow tools and prompt shortcuts

Agents call the underscore-named workflow tools above. Clients that expose MCP prompts may also offer the matching hyphenated names as user-invoked shortcuts. The tool and prompt paths share one renderer and return identical instructions for the same input; prompt support is not required to reach a workflow.

- `audit_game_legal` reads a verified `legal_source_plan` handle through the packaged `game-legal-audit` skill. It performs source-grounded issue spotting, preserves `cannot-assess`, and never claims legal advice or clearance.
- `play_build` is the operation-first development loop. With no declared blockers it requires a credential-free build URL, build ID, task, controls, start state, and end state. `playerLensMode=neutral` performs observation only. `playerLensMode=grounded-personas` requires saved persona IDs and replays the same observed stimulus as a Virtual Player Panel. Its optional `coreClaim` adds a Core Delivery Trace. It returns a Player Probe Card and a compact Build Handoff; it never starts Steam research, persona derivation, a full audit, or mandatory persistence.
- `improve_build` is the bounded implementation loop. It additionally requires one observable success signal, its observable kind, one regression guardrail, and its observable kind. The agent operates the baseline, changes at most one player-facing variable in the current repository, runs focused checks, and replays the same task. Completed comparisons go through `record_improvement` with disjoint, time-stamped `improvement-operation-trace` intel payloads for both operations; each payload's build ID and three observation fields must exactly match the canonical record, while screenshots may supplement it. The caller supplies a success-signal comparison (`improved`, `unchanged`, or `regressed`), guardrail result (`held` or `failed`), and replay-conditions evidence; the server derives the final classification and record time. The result is exact-saved with `save_result`; blocked attempts are not recorded as verified improvements. The workflow does not authorize dependencies, commits, pushes, releases, Steam research, personas, or a second improvement attempt.
- `review_change` reviews one current-to-candidate revision, fixes `mode=change` internally, and requires `currentState`, `proposal`, and a Git/build/artifact-bound `revisionBundle`.
- `audit_project` reviews current milestone readiness and fixes `mode=baseline` internally. An active `developer-project` also requires an artifact-bound `auditSnapshotBundle`. Supplying `knownBlockers` short-circuits a premature audit to Repair First without requiring the full intake.
- `ui_blind_compare` freezes a pre-reveal UI judgment before identity mapping is disclosed.

`play_build` is intentionally separate from the two decision workflows. It operates one task, distinguishes observed responses from persona hypotheses, traces an optional declared core, and recommends `solo`, bounded `parallel-experiment`, or `specialist-production` for the next build. Missing repository, team, model-evaluation, or independent-review evidence remains `unassigned` or `missing`; the workflow does not invent an organization. The decision workflows orchestrate evidence collection, domain review, criticism, evaluation storage, and run storage. They lead with a compact Decision Check before detailed findings.

Workflow arguments are strings. Structured values such as `coreClaim`, `projectBrief`, `conceptTest`, `auditSnapshotBundle`, `playtestSession`, and `playtestCohort` are JSON-encoded strings at the MCP boundary. `coreClaim` declares a one-sentence promise, theme, distinctive system, intended experience, one of the six reward families, intended reward, proof moment, and optional amplifier. First-contact input goes through `record_first_contact`; pass its result handle as `firstContactResultHandle`.

`knownBlockers` is newline-separated in intended repair order. When non-empty, its Repair First route takes the first blocker while preserving the rest and takes precedence over missing build or audit fields. `personaIds` is a comma-separated list of already saved personas and is valid only with `playerLensMode=grounded-personas`. Without those IDs the workflow returns `needs-personas`; `play_build` never derives personas implicitly.

## Game legal audit

Use this workflow for one concrete decision such as a demo release, commercial release, port, publisher handoff, asset reuse, or team transfer:

1. Call `legal_source_plan` with an exact release/build ID and description, an evidence artifact for its exported asset/plugin/dependency inventory, the jurisdictions, engine versions and license routes, every shipped licensed material or package and intended use, every distribution channel, and an explicit `evidenceAccessMode`.
2. Exact-save its `meta.resultHandle` with `save_result`.
3. Supply the current evidence artifacts named by the plan. Private agreements remain user-supplied evidence; the workflow must not search for leaked copies or replace them with public summaries.
4. Call `audit_game_legal` with the same result handle. It automatically carries the evidence IDs recorded by the plan; use comma-separated `evidenceArtifactIds` only for supplemental evidence.

`ready-for-source-review` means only that source review can begin. It does not establish permission. The workflow requires current official public pages, exact item licenses and receipts, the publishing entity's accepted private agreements, jurisdiction-specific primary law when relevant, and qualified counsel for material unresolved questions.

`evidenceAccessMode` prevents silent disclosure through the AI client:

- `metadata-only`: artifact contents are never read; their permissions and obligations remain `cannot-assess`.
- `redacted-artifacts`: only copies explicitly prepared and approved for the client may be read; findings are limited to those excerpts.
- `approved-environment`: full artifacts may be read only after the user has confirmed that the processing environment is authorized. This declaration does not prove authorization.

The bundled source registry routes Unity Editor and Asset Store terms, Unreal Engine and Epic Content terms, Fab licensing, and Steam Direct public rules to their official hosts. These URLs are discovery anchors, not frozen legal authority: refresh them during every audit and record the effective date, controlling section, and access time. Marketplace-wide terms do not prove the entitlement or special terms for an individual asset.

## Partial success and provenance

External fetches preserve successful source data when another endpoint fails. Always retain `warnings`; they are part of the evidence envelope.

Results smaller than 1 MiB from `steam_search`, `steam_brief`, `steam_discover`, `steam_fetch`, `steam_reviews`, `steam_timeline`, `steam_updates`, `derive_personas`, `record_first_contact`, `record_player_panel`, `record_improvement`, and `legal_source_plan` include a short-lived `meta.resultHandle`. Pass evidence handles with `target` and `id` to `save_result` immediately. The server then saves the normalized source envelope, including warnings and metadata, without model transcription. For first contact and legal review, pass the same handle to the corresponding workflow first so it can include the normalized evidence and exact-save pointer.

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

After the neutral and grounded `play_build` passes, call `validate_player_panel` as a non-persisting preflight, then call `record_player_panel` once it reports `ready=true`. Its `stimulus` is shared by every lens rather than copied per persona. Each lens selects one saved persona research question and one-to-three exact review references. The server rejects unknown personas, review IDs absent from the persona, review evidence unrelated to the selected research question, and duplicate persona lenses. The returned record embeds the exact review text and persona SHA-256. Its `coreClarity` keeps `distinctiveness`, `communication`, and `sceneLegibility` separate; each is an observation about this stimulus, not a sales explanation.

The result store retains only the most recent 32 handles in the current MCP process. Handles expire when that process ends.

## Agent experience feedback

Use `report_agent_experience` once at the end of a meaningful GamePlayerLens workflow, or when a failure, confusion, guess, give-up, or missing capability changes the result. This is feedback about the Skill, MCP, or onboarding—not about the game or its players. Supply a stable kebab-case `signalKey`; a pseudonymous `sessionId` distinguishes caller-reported sessions without storing a user or agent identity. A guess names the guessed fields, a terminal failure records attempted recovery, and a feature request names the missing capability.

The report is saved immediately beneath the dedicated `gameplayerlens-agent-experience` intel target. No exact-save follow-up is needed. The input rejects credential-like text, credentialed URLs, and absolute paths, and requires an explicit privacy attestation. Do not include raw user prompts, proprietary game artifacts, source code, credentials, or personal identifiers.

`summarize_agent_experience` reads only those explicit records. It reports outcome, surface, stage, reuse, recommendation, and pseudonymous-session coverage without producing an agent-readiness score. Non-success reports sharing a `signalKey` become `readyForIssueDraft` only after at least two distinct session IDs. Those IDs are caller-provided and do not prove independent agents or users. Even then, the result requires reproduction and user approval; it never creates a GitHub issue or authorizes an automatic pull request. GamePlayerLens does not silently collect tool calls, arguments, intent, or sessions.

## Iteration coaching

Call `coach_history` only after saving at least two `developer-project` runs for the same target. `target` is the stored target display name or ID. `limit` is optional, defaults to 10, and accepts 2–20 recent runs.

```json
{
  "target": "Project Nyx",
  "limit": 10
}
```

The read-only tool uses only runs whose integrity is currently verified. It derives build identity from the bound audit or candidate revision bundle and counts only evidence aliases cited by stored review rounds. Captures and UI references must also be bound by the active audit snapshot or candidate revision; a newly added competitor image is research context, not new operation of the build. Direct-stimulus novelty is checked against every earlier run for the same build inside the requested window, so alternating old captures does not count as progress. It reports three deterministic conditions:

- `fix-now-without-new-build`: a `fix-now` decision was followed by another review of the same Git/build identity;
- `review-without-new-stimulus`: the same build was reviewed without a new cited build-bound capture or UI reference, first-contact result, playtest, or direct experiment measurement;
- `human-handoff-stall`: the same normalized human validation question appeared in consecutive reviews without a previously unseen human-evidence SHA-256 cited in that persona round's `stimulusEvidenceRefs`.

`activeFindings` contains only unresolved conditions. `findingHistory` retains both active and resolved occurrences and records the run that satisfied each stop condition. Reassigning an already-seen human observation to a different question does not satisfy a stop condition; one newly captured human artifact may answer multiple questions only when each corresponding persona round cites it.

`latestReviewDecision` returns the newest analyzed run's verdict, decision, player problem, highest risk, next action, and success signal. `sourceEvaluation` binds that projection to the run evidence alias, target, artifact ID, and SHA-256. If a finding is active, follow the coach card before resuming this saved review action. The projection is not a new verdict and does not override the evaluation.

The result card leads with the highest-priority active next action. It does not calculate a composite score, infer fun or demand, inspect unsaved `play_build` responses, or replace the next operation or human session. A finding means the stored iteration history repeated an evidence state; it is not a judgment of developer productivity or game quality.

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

The default `ui_capture` source type is `page`, which uses Obscura to capture a credential-free HTTP(S) page as PNG. Use `save_capture` for a screenshot already produced while operating a local build; Obscura is not required. `source.kind=project-file` accepts only a PNG/JPEG path relative to `GAME_PLAYER_LENS_PROJECT_ROOT` (or the server working directory when unset), rejects symlinks and traversal, and never exposes the configured project root in a source-read error. `source.kind=base64` accepts a bounded PNG/JPEG payload. Both `save_capture` paths and successful `ui_capture` output check the declared signature, fully decode compressed pixels with bounded dimensions/channels, and publish a create-only manifest containing the format, dimensions, size, and SHA-256 before publishing exactly one image extension. Concurrent MCP processes therefore cannot claim the same logical capture ID as different formats. Both tools return the capture ID needed by evidence references; `save_capture` also returns the SHA-256 directly.

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

Persistence uses one named tool per mode:

- `save_result`: exact-save a result handle.
- `save_intel`: directly save validated caller-authored JSON.
- `save_evaluation`: save Markdown that passes the canonical report structure and evidence checks, then return its structured `decisionCard` and compact `developerSummary`.
- `save_run`: seal the review context, dependencies, structured virtual-player and reviewer rounds, warnings, confidence, and final evaluation in an immutable run record.
- `save_capture`: import image bytes as capture evidence.

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
| `capture`, `ui-reference` | `id` | metadata, SHA-256, and valid `ImageContent` when at most 6 MiB; oversized images return metadata and a warning without a hash or inline bytes |

An `id` without `target` is invalid for target-scoped artifacts. A `target` is invalid for image artifacts.

## Data layout

```text
knowledge/intel/{targetId}/{artifactId}.json
workspaces/{targetId}/{date}-{topicId}.md
workspaces/{targetId}/runs/{runId}.json
knowledge/intel/captures/{captureId}.{png|jpg}
knowledge/intel/captures/{captureId}.capture.json
knowledge/ui-references/{referenceId}.png
```

Direct repository execution uses the repository as the data root. The packaged CLI uses `GAME_PLAYER_LENS_HOME`, or `~/.game-player-lens/` when unset. Tool responses always return paths relative to that data root. `get_status` and `doctor` also return a non-secret hashed `storage.instanceId`, allowing the two layers to confirm that they address the same store without exposing its absolute path.

## Client requirements

The client must support MCP tools. MCP prompts are optional shortcuts. Standard MCP `ImageContent` is needed to display stored images; filesystem access, subagents, and custom image tools are optional.

A browser-capable client may operate an HTTP(S) build. A client without browser or desktop control must use a user recording, consecutive captures, an input log, or a moderated session and state the limitation. The MCP server itself does not execute arbitrary native game files.
