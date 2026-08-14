# Experiments and playtests

GamePlayerLens separates direct operation, human reports, predictions, measurements, and decisions. Passing a technical test is not evidence of fun, and a participant report is not a population metric.

## A bounded playtest session

Before starting, fix:

- build ID and release stage;
- operating system, device, runtime, renderer backend and implementation, hardware/software acceleration, viewport, and DPR;
- controls;
- concrete player task;
- start state and end state;
- time limit;
- tester type and prior knowledge.

Record observations chronologically. Each row keeps player intent, input/action, system response, expected/observed difference, friction severity, reward signal, and Evidence IDs separate.

Observe at least:

- time to first meaningful action;
- task completion and elapsed time;
- mis-inputs, hesitation, backtracking, and help use;
- response latency or missing feedback;
- failure cause, retry location, and retry cost;
- when reward, progress, and the next goal become recognizable;
- visible frame drops, loading, and crashes without guessing their code cause.

## Moment-to-moment loop

Map the shortest repeatable loop as `anticipation → commit → resolution → recovery / reset`. Capture first-glance action, decision tension, difficulty ramp, fair-failure telegraph and counterplay, success amplifier, novelty cadence, and the reason to play again.

System output and effects are operational observations. `feltReward`, failure attribution, and replay intent come only from a human participant report. Creator self-play remains maker evidence, and an AI-operated session cannot contain a fabricated `humanReport`.

## Session input

Pass the completed session as the JSON-encoded `playtestSession` prompt argument. A human session uses a pseudonymous `participantId` and may include `humanReport`. AI-operated sessions store only operation and observation.

Non-completed outcomes require a stop reason. The prompt returns `playtestSessionEvidence.resultHandle`; exact-save it as `playtest-session-<sessionId>`.

One session does not become a completion rate, fun score, retention estimate, or demand estimate.

## Retest lineage

A retest requires all of:

- a new lowercase kebab-case `sessionId` of at most 47 characters;
- `parentSessionId`;
- `changeSummary`;
- a deduplicated `changedVariables` list;
- `invariantsKept`.

The parent artifact must be read back before comparison. Task, environment, controls, start state, tester type, observation source, prior knowledge, and participant exposure are checked separately.

One changed variable with matching recorded fields is a `comparison-candidate-only`; free-text invariants and moderator behavior are not proven equivalent. Multiple changes remain `unresolved-multiple-changes`. Protocol mismatch remains `unresolved-protocol-mismatch`.

## Playtest cohorts

Use `playtestCohort` for two to twenty complete sessions. Do not send `playtestSession` and `playtestCohort` together.

A cohort records assembly time, cohort ID, purpose, recruitment, target-player definition, sampling boundary, and complete sessions. Diagnostics preserve:

- session count;
- unique human participants and repeat exposure;
- AI versus human tester counts;
- outcomes and human-report coverage;
- friction and reward evidence counts;
- protocol groups and lineage.

AI and human sessions are not merged into a human metric. Repeat participants are not independent participants. Different protocols are not averaged. Counts are not converted into population rates or fixed pass thresholds.

Internal parent-child pairs expose protocol mismatches, participant exposure, changed variables, and before/after evidence. The transition is descriptive; it is not automatically the causal effect of the change.

## Prospective experiment loop

Use this sequence when a proposal needs a predefined success criterion and guardrail:

1. `ExperimentSpec`: save the target, mode, scenarios, metric, source, instrument, unit, aggregation, cohort, window, minimum sample, success criterion, guardrail, and prediction before seeing proposal results.
2. `Prediction Run`: use the saved spec as evidence and seal the prediction. A prediction run does not execute the experiment.
3. `ExperimentMeasurement`: after the prediction is sealed, save the raw observation in a strict measurement envelope.
4. `ExperimentOutcome`: reference the spec, prediction run, and raw measurement hashes; record resolved, failed, or missing criteria without changing the registered rule.
5. Next `ExperimentSpec`: reference the accepted parent outcome and state what was learned or rejected.

Specs, measurements, and outcomes use `save_artifact(kind=intel, sourceTool=manual)` without overwrite.

## Missing outcomes

If a metric cannot be measured, store it as missing and keep the criterion and overall verdict unresolved. Do not convert missing to zero or failure. A measurement from a different source, instrument, unit, cohort, window, or protocol is exploratory and cannot resolve the registered criterion.

## Server-verified decisions

The run readback checks:

- target, metric, source, instrument, unit, aggregation, cohort, protocol, and window alignment;
- minimum sample requirements;
- spec, run, measurement, and outcome SHA-256 links;
- chronological order;
- recomputation of success criteria and guardrails from raw values.

`forecastComparisons` describes error for the matching prediction only. `experimentDecisions` reports server-recomputed criteria, guardrails, overall verdict, and a bounded recommended action. A guardrail breach stops the decision; unresolved input stays unresolved.

Even a verified experiment decision does not prove causal lift or population success unless the experiment design itself establishes those properties.
