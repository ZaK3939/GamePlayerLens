# Evidence and integrity

GamePlayerLens is designed to make unsupported conclusions visible. Coverage measures what evidence is present; integrity verifies that a stored run still points to the same bytes. Neither is a quality score or probability of success.

## Evidence statuses

Use these statuses consistently:

- `observed`: a source returned a valid value at the recorded time.
- `reported-zero`: a source explicitly returned zero.
- `estimated`: the value was produced by a stated estimation method.
- `missing`: the value was not obtained or is absent.
- `N/A`: the dimension is outside the declared review scope, with a reason.

Never replace missing with zero. Do not infer history or future direction from one observed snapshot. Keep the estimation method and caveat next to every estimated value.

## Coverage

Every selected domain has a fixed set of evidence dimensions. The evaluation reports:

- `Coverage rate`: observed, reported-zero, and estimated dimensions divided by applicable dimensions.
- `Direct observation rate`: observed and reported-zero dimensions divided by applicable dimensions.

Both are displayed to one decimal place. They do not represent confidence, quality, readiness, or success probability. A blocking missing dimension limits the recommendation even when the average coverage rate is high.

The evaluation's Selected Domains must exactly match the run's `selectedDomains`.

## Canonical evaluation

`save_artifact(kind=evaluation)` validates the canonical report rather than accepting arbitrary prose. It checks required sections, ordering, non-empty content, data coverage, Evidence Index structure, and detailed indie-strategy sections when applicable. The Decision Card must contain one valid verdict and decision, one to three evidence-linked Proven entries, one to three explicitly missing Unproven entries, one highest risk, one player problem, one to three structured next validations, confidence, and a revisit condition. Domain findings require a `Blocker`, `Important`, or `Suggestion` severity. Unfilled template markers and token completion text are rejected.

A successful evaluation save returns that validated card as structured `decisionCard` data and a five-field `developerSummary` containing verdict, decision, highest risk, next action, and success signal. These are deterministic projections of the saved Markdown, not an independent server judgment.

When competition is selected, the evaluation also requires:

- a freshness window;
- at least three must-match axes;
- at least two candidate routes;
- a three-to-eight-row Competitor Selection Ledger;
- separate Fit and Market roles;
- review and scale/momentum evidence for success rows;
- a direct or adjacent competitor, a recent success or breakout anchor, and a control or rejection.

This prevents visual references, direct competitors, and market-success examples from being silently merged into one role.

## Evidence Index

Every material claim points to a canonical Evidence ID. Each index row records a data-root-relative artifact path, observation time with timezone offset, source, and evidence status. A link alone is not retrieved evidence.

When a fetch tool returns `meta.resultHandle`, use exact-save. Model-reconstructed excerpts, merged payloads, or summaries are not substitutes for the source envelope.

## Personas

`derive_personas` builds a polarity-balanced problem-discovery sample. It is explicitly `representative: false`.

- Each persona requires at least three unique review voices.
- The same review voice is not reused across personas.
- `generationReadiness=blocked` prohibits persona generation.
- `partial` limits generation to `supportedCount`.
- Research questions are explicit, bounded, and exact-saved with the derivation result.
- Every research question declares `evidenceSignals`; reviews that contain none of the mapped signals are excluded before persona generation.
- Every appid has an explicit source selection; there is no implicit non-target-to-competitor default.
- Competitor sources declare direct or adjacent fit and at least three matching gameplay/player axes.
- Persona references are system references. Visual references and market-success anchors are not persona voice sources.
- Observed patterns, inferred traits, unknowns, and limitations stay separate.
- Every selected voice supports at least one observed pattern, and each citation names its research question and relevance rationale. Persona save rechecks that the exact review matched that question's declared signals.
- `save_persona` requires the live `derive_personas` result handle and server-verifies exact review text, ID, language, vote, audience, research questions, and source selection before adding a result hash to the stored persona.

Review balance does not reveal population sentiment. Use separate aggregate review evidence for overall positive share, and never convert persona counts into affected-player share.

## Player-lens hypothesis rounds

New review runs accept only grounded v3 personas. Every persona-scenario round contains a structured `playerSimulation` hypothesis with an exact-saved `memory.derivationEvidenceRef`, review-memory references, explicit `stimulusEvidenceRefs`, perception, decision, predicted response, reflection, uncertainty, and a human falsification signal. The server verifies the derivation artifact hash and content against the saved persona before accepting a recommendation ID.

If UI is selected, persona rounds must name a saved capture or UI reference inside `stimulusEvidenceRefs` and cannot use `scenario-only` exposure. If competition is selected, each round must cite a voice from a persona source assigned the `competitor` role. `visual-evidence` exposure requires an explicitly named image, `ai-operated` requires an explicitly named AI-operated playtest session, and `scenario-only` requires an empty stimulus list. This ensures that UI, competitor, and execution inputs affect the player simulation rather than appearing only in the final reviewer narrative.

The stored response remains a model-generated hypothesis. `exposure=ai-operated` means an AI client operated the recorded task; it does not mean the persona felt a human emotion. Predicted feelings, continuation choices, and agreement across personas are never human reports, population rates, demand, or retention.

## External-data interpretation

- SteamSpy owners are estimate ranges, not sales.
- SteamSpy playtime and CCU are estimates or timestamped snapshots.
- `average_forever=0` is preserved as reported zero and interpreted with a missing-data warning.
- CCU zero remains a valid timestamped observation.
- `steam_timeline.currentCcu` is not a 24-hour peak, all-time peak, or history.
- ITAD price history uses a separate source and time axis.
- `matchesEnglishCopy` reports normalized exact equality only; it does not explain fallback behavior or translation quality.
- Update cadence is descriptive and does not prove update quality or retention impact.

## Agent-experience feedback

Agent-experience reports describe how an agent experienced GamePlayerLens itself. They are kept outside game evidence and never support claims about player enjoyment, demand, retention, or commercial readiness. Collection is explicit: GamePlayerLens does not silently capture tool calls, prompts, arguments, or sessions.

Each report is create-only, version-bound, and may include a caller-provided pseudonymous session ID. Repeated signal keys support triage, not truth. At least two distinct session IDs are required before the deterministic summary marks a signal eligible for an issue draft; distinct caller-provided IDs do not prove independent agents or users. Eligibility does not verify the bug, authorize a GitHub mutation, or allow an automatic pull request. Reproduction and user approval remain separate gates.

Reports reject credential-like text, credentialed URLs, and common absolute-path forms. The reporter must attest that raw prompts, credentials, personal identifiers, source code, and proprietary artifacts were omitted.

## Immutable runs

A run seals:

- subject kind, market, language, mode, and selected domains;
- the normalized Project Brief for developer subjects;
- scenarios and persona IDs;
- saved evidence and its SHA-256;
- every independent analysis round, including structured persona-scenario responses;
- warnings, client-reported model and confidence;
- the final evaluation reference;
- the exact subject/domain-compiled game-review recipe bytes and canonical record seal.

Every scenario-domain pair and every persona-scenario pair must be represented by at least one round. Every non-final evidence item must be used by a round. The final evaluation is produced after synthesis and cannot be used as an earlier round's evidence.

A change run additionally requires `revisionBundleRef`. The referenced exact-saved manual artifact records different current and candidate Git commit SHAs, build IDs, changed areas, invariants, and at least one artifact binding for each revision. Run creation resolves every bound evidence ref and rejects a kind or SHA-256 mismatch.

A baseline `developer-project` run similarly requires `auditSnapshotBundleRef`. Its exact-saved manual artifact binds one snapshot ID, declared Git commit SHA, build ID, and one or more evidence refs to their saved SHA-256 values. The server verifies those artifact bytes when the run is sealed and read. This prevents later substitution and cross-build evidence mix-ups, but it does not independently attest that an external build process produced the artifacts from the declared commit.

`get_artifact(kind=run)` re-reads the recipe, personas, evidence, and record. `integrity.status=verified` means every required dependency still matches. `failed` identifies missing, mismatched, unreadable, or structurally invalid dependencies. This seal detects drift; it is not a cryptographic signature or external attestation.

The recipe is recompiled from the stored run's `subjectKind` and explicitly selected `selectedDomains` before hashing. `domains=auto` is not accepted. Changes to an unused domain do not invalidate the run; changes to core, the selected subject contract, or a selected domain do.

## Simulation readiness

`simulationReadiness.status=rehearsal` supports issue hypotheses, directional response hypotheses, and test priority. It blocks population rates, market share, causal lift, and retention impact.

`validation-ready` means a matching ExperimentSpec was registered and actually used as run evidence. It does not mean the experiment was executed or succeeded.

Server-verified calibration is limited to matching past outcomes with complete hash and protocol checks. It does not establish general model calibration, causality, or population validity.

## Storage boundaries

- Intel payload: at most 1 MiB.
- Evaluation Markdown: at most 512 KiB.
- Run record: at most 2 MiB.
- Inline image: at most 6 MiB.

Display names are normalized to canonical IDs. Arbitrary paths, path traversal, root escapes through symlinks, unsupported image formats, credentialed URLs, and oversized payloads are rejected.

Every save is create-only: a fsynced same-directory temporary file is published through a hard link, and an existing destination is never replaced. Revisions therefore use new artifact or persona IDs instead of overwrite. Publication and temporary-file cleanup retry transient filesystem locks; an existing destination is never retried or replaced. If cleanup still fails after publication, the error explicitly reports that the destination was already saved and must be read before retrying. Reads and writes in one server process share a FIFO coordinator for each normalized path, while different paths remain independent and can proceed concurrently. Removing replacement rename avoids the Windows EPERM path previously observed when antivirus or indexing software held the destination.

The complete build, test, stdio, and packaged-CLI gates run on Linux, Windows, and Apple Silicon macOS. Windows and macOS also repeat the full suite ten times as storage reliability gates. Unicode display names are normalized to one canonical ID before path resolution, so composed and decomposed input forms resolve to the same artifact on macOS filesystems.

The server does not return configured secrets or absolute data-root paths. External warnings omit response bodies, query strings, keys, and other sensitive request details.

## Partial external failure

Supported transient statuses, connection interruptions, timeouts, and temporary invalid JSON are retried once. A `Retry-After` longer than the bounded wait returns a warning instead of holding the request open.

Source failures are independent. Preserve successful evidence, leave the failed dimension missing, retain the warning, and name the smallest retrieval condition needed next.
