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

`save_artifact(kind=evaluation)` validates the canonical report rather than accepting arbitrary prose. It checks required sections, ordering, non-empty content, data coverage, Evidence Index structure, and detailed indie-strategy sections when applicable. Unfilled template markers and token completion text are rejected.

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
- Source roles distinguish target, competitor, and reference games.
- Observed patterns, inferred traits, unknowns, and limitations stay separate.

Review balance does not reveal population sentiment. Use separate aggregate review evidence for overall positive share, and never convert persona counts into affected-player share.

## External-data interpretation

- SteamSpy owners are estimate ranges, not sales.
- SteamSpy playtime and CCU are estimates or timestamped snapshots.
- `average_forever=0` is preserved as reported zero and interpreted with a missing-data warning.
- CCU zero remains a valid timestamped observation.
- `steam_timeline.currentCcu` is not a 24-hour peak, all-time peak, or history.
- ITAD price history uses a separate source and time axis.
- `matchesEnglishCopy` reports normalized exact equality only; it does not explain fallback behavior or translation quality.
- Update cadence is descriptive and does not prove update quality or retention impact.

## Immutable runs

A run seals:

- subject kind, market, language, mode, and selected domains;
- the normalized Project Brief for developer subjects;
- scenarios and persona IDs;
- saved evidence and its SHA-256;
- every independent analysis round;
- warnings, client-reported model and confidence;
- the final evaluation reference;
- the exact `run-sim` recipe bytes and canonical record seal.

Every scenario-domain pair and every persona-scenario pair must be represented by at least one round. Every non-final evidence item must be used by a round. The final evaluation is produced after synthesis and cannot be used as an earlier round's evidence.

`get_artifact(kind=run)` re-reads the recipe, personas, evidence, and record. `integrity.status=verified` means every required dependency still matches. `failed` identifies missing, mismatched, unreadable, or structurally invalid dependencies. This seal detects drift; it is not a cryptographic signature or external attestation.

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

The server does not return configured secrets or absolute data-root paths. External warnings omit response bodies, query strings, keys, and other sensitive request details.

## Partial external failure

Supported transient statuses, connection interruptions, timeouts, and temporary invalid JSON are retried once. A `Retry-After` longer than the bounded wait returns a warning instead of holding the request open.

Source failures are independent. Preserve successful evidence, leave the failed dimension missing, retain the warning, and name the smallest retrieval condition needed next.
