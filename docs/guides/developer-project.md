# Reviewing a developer project

Use this workflow for a concept, prototype, vertical slice, demo, prelaunch build, or proposed change that is not fully represented by a public Steam page.

## Start with one next action

Do not ask for a general verdict on the whole game. Choose the next decision that could change development work, for example:

- Is the shortest gameplay loop legible enough to expand?
- Does the first viewport communicate the theme, action, and reward?
- Should the team build the next content wave or repair the current slice?
- Does a proposed UI change improve one concrete player task?

Start with `play-build` when a playable URL exists. Use `review-change` for one explicit current-to-proposed revision after both sides have useful evidence. Use `audit-project` only for the current milestone as a whole. The prompt name fixes the workflow; callers do not pass a `mode` argument.

## Operation-first daily loop

`play-build` needs no Project Brief, market, competitor set, audit bundle, or saved run. Give it one bounded operation:

```json
{
  "target": "Project Nyx",
  "buildUrl": "http://127.0.0.1:4173/play",
  "buildId": "prototype-042",
  "task": "Build one vehicle, carry one load, and read the arrival result",
  "controls": "Keyboard and mouse",
  "startState": "At the dock before construction",
  "endState": "The arrival result is visible",
  "timeLimitMinutes": "12",
  "personaIds": "cautious-builder,risk-taker"
}
```

The client operates the task once without a persona, then replays the same observed stimulus through only the explicitly named saved personas. It returns a compact Player Probe Card containing an Action → Response Trace, grounded lens reactions, the smallest playable change, and one human falsifier. It does not return a milestone verdict or automatically run Steam research.

If the client cannot operate the build, it reports an operation blocker. Loading a page, reading source, or viewing one static frame is not play.

### Trace one core claim

Use the optional `coreClaim` when the question is whether one operation delivers the intended playable core. It is a JSON object encoded as a string at the MCP boundary. Its unencoded shape is:

```json
{
  "oneSentencePromise": "Brace a storm-battered courier craft and learn which structural gamble survives the route",
  "theme": "A fragile courier craft crossing a violent storm",
  "distinctiveSystem": "Player-placed supports redistribute visible structural stress during travel",
  "intendedExperience": "Choose where to reinforce, commit, and watch the structure reveal the consequence",
  "rewardFamily": "discovery",
  "intendedReward": "Understand why one choice survived and want to revise the next build",
  "proofMoment": "A surviving reinforced joint makes the cause of the neighboring failure legible",
  "amplifier": "Directional deformation, escalating creaks, and a clear arrival comparison"
}
```

The field is optional, but all fields except `amplifier` are required when it is present. Reward families are `sensory`, `mastery`, `discovery`, `agency`, `attachment`, and `aesthetic-emotion`.

The returned Core Delivery Trace compares declared intent with observed signals for theme/system fit, experience, reward, amplification, and the proof moment. A visible after-state or feedback effect can be a reward signal; enjoyment, satisfaction, and replay intent require a human report. If `coreClaim` is omitted, the client records observations without inferring the intended core from genre, appearance, or a known game's surface.

Visual similarity, matching tags, camera, enemy counts, or an upgrade menu do not establish mechanism transfer. When a known game is used as evidence, preserve its source action → system response → reward and state the meaningful difference in the target build.

### Repair-first routing

When known execution defects already prevent a useful operation, declare them instead of assembling audit evidence:

```json
{
  "target": "Project Nyx",
  "knownBlockers": "Steering force is reversed\nStress feedback is binary"
}
```

This route returns a Repair First Card and blocks build operation, Steam research, persona derivation, full audit, and artifact saving. Re-enter through `play-build` after a new build can execute the task. `audit-project` accepts the same `knownBlockers` escape route when a premature milestone audit was requested.

The route is explicit rather than inferred from source code. Do not omit a known blocker merely to force a player simulation.

## Coach the iteration history

After at least two audit or change runs have been saved, use `coach_history` to check whether review work is outrunning playable work:

```json
{
  "target": "Project Nyx",
  "limit": 10
}
```

The tool reads verified `developer-project` runs and compares consecutive build identities, direct-stimulus novelty across all earlier runs for the same build, and exact normalized human-validation questions. A captured or manually placed image counts as build progress only when the active audit snapshot or candidate revision binds its evidence alias; adding an unbound competitor reference cannot clear the warning. Human evidence counts for a question only when its SHA-256 has not appeared earlier in the analysis window and the same persona round cites it in `stimulusEvidenceRefs`; moving an old observation to another question is not a new human handoff. It can tell you to stop reviewing and produce a new build, operate one genuinely new direct stimulus, or ask the repeated question in a bounded human session.

`activeFindings` contains current unresolved conditions; `findingHistory` preserves conditions that a later run resolved. `latestReviewDecision` projects the newest verified evaluation's verdict, player problem, highest risk, next action, and success signal together with its run ID and exact evaluation evidence identity. When a finding is active, perform the coach card's action first; after its stop condition is met, resume the concrete work in `latestReviewDecision` without reopening the full Markdown report.

This is a retrospective guardrail, not the daily loop. It sees only saved review runs, not an unsaved `play-build` response, local source edits, or a play session that was never preserved. The latest decision is a deterministic projection of the saved evaluation, not a new coach judgment. The tool returns no development score and makes no claim about fun, retention, demand, or team performance.

## Minimal `audit-project` request

All prompt arguments are strings. `projectBrief` and `auditSnapshotBundle` are JSON objects encoded as strings by the MCP client. An active `developer-project` audit requires both.

```json
{
  "target": "Project Nyx",
  "topic": "Prototype core and next milestone",
  "subjectKind": "developer-project",
  "domains": "gameplay,storefront,competition",
  "market": "Japan",
  "language": "japanese",
  "projectBrief": "<JSON-encoded Project Brief>",
  "auditSnapshotBundle": "<JSON-encoded Audit Snapshot Bundle>"
}
```

For a proposed revision, call `review-change` with the same audience and scope fields plus `currentState`, `proposal`, and an exact revision bundle:

```json
{
  "target": "Project Nyx",
  "topic": "First-route onboarding revision",
  "subjectKind": "developer-project",
  "domains": "gameplay",
  "market": "Japan",
  "language": "japanese",
  "projectBrief": "<JSON-encoded Project Brief>",
  "currentState": "The route rules are explained before the first decision",
  "proposal": "The first route teaches one tradeoff through immediate system response",
  "revisionBundle": "<JSON-encoded Revision Bundle>"
}
```

Keep one changed decision in each review so findings can be attributed to the revision.

## Audit Snapshot Bundle

Save the current build, capture, receipt, and test-result evidence under new immutable artifact IDs. Use the SHA-256 values returned by `get_artifact` to construct one baseline bundle:

```json
{
  "artifactType": "audit-snapshot-bundle",
  "observedAt": "2026-08-14T12:00:00+04:00",
  "snapshotId": "nyx-prototype-2026-08-14",
  "gitCommitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "buildId": "nyx-prototype-webgl2",
  "artifacts": [
    {
      "evidenceRef": "prototype-capture-2026-08-14",
      "kind": "capture",
      "sha256": "1111111111111111111111111111111111111111111111111111111111111111"
    }
  ]
}
```

The prompt exposes `auditSnapshotBundleEvidence.resultHandle`. Exact-save it as intel, include that alias as the run's `auditSnapshotBundleRef`, and include every bound artifact in run evidence. The server rejects missing refs and kind or hash mismatches.

This proves that the audit run used the declared immutable bundle and artifact bytes. It does not independently prove that the declared Git commit produced those files; a build pipeline must emit or attest that provenance before submission.

## Revision Bundle

Save the current and candidate artifacts first, then compute the SHA-256 of the stored files. The unencoded `revisionBundle` shape is:

```json
{
  "artifactType": "revision-bundle",
  "observedAt": "2026-08-14T12:00:00+04:00",
  "current": {
    "revisionId": "route-onboarding-v1",
    "gitCommitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "buildId": "nyx-route-current",
    "artifacts": [
      {
        "evidenceRef": "current-playtest",
        "kind": "intel",
        "sha256": "1111111111111111111111111111111111111111111111111111111111111111"
      }
    ]
  },
  "candidate": {
    "revisionId": "route-onboarding-v2",
    "gitCommitSha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "buildId": "nyx-route-candidate",
    "artifacts": [
      {
        "evidenceRef": "candidate-playtest",
        "kind": "intel",
        "sha256": "2222222222222222222222222222222222222222222222222222222222222222"
      }
    ]
  },
  "changedAreas": ["first-route teaching and immediate result feedback"],
  "invariantsKept": ["task, seed, controls, viewport, renderer, and target cohort"]
}
```

The prompt exposes `revisionBundleEvidence.resultHandle`. Save it immediately as intel and use that evidence alias as the change run's `revisionBundleRef`. The run must also include every artifact alias named inside the bundle. The server rejects reused commits, shared current/candidate evidence refs, missing refs, kind mismatches, and SHA-256 mismatches.

`market` fixes the audience context. `language` uses a Steam language code such as `japanese` or `english`. GamePlayerLens does not silently begin a Japan/Japanese review when either is absent.

## Project Brief

The unencoded form below shows the supported shape:

```json
{
  "revisionId": "brief-v3",
  "developmentStage": "prototype",
  "conceptOrigin": "theme-first",
  "decisionHorizon": "Decide whether to build the second route set",
  "targetPlayer": "Players who enjoy readable route-planning tradeoffs",
  "themeWorld": "A small airship post office operating inside a storm",
  "distinctiveSystem": "Redraw routes as the forecast changes",
  "primaryIntendedFeeling": "Tension turning into earned confidence when the forecast is read correctly",
  "shortestRepeatableLoop": "Read one forecast, choose one route, commit, read the result, and return to the next forecast",
  "playerDecision": "Trade delivery value against fuel and safety",
  "systemResponse": "Wind, fuel, cargo condition, and arrival time change immediately",
  "rewardMechanisms": [
    {
      "family": "mastery",
      "form": "mixed",
      "beforeState": "The safe route is uncertain",
      "playerAction": "Commit one route after reading the forecast",
      "systemResponse": "Wind and cargo state react to the route",
      "afterState": "The quality of the forecast read becomes visible",
      "perceivedReward": "The player sees that the risky delivery plan worked",
      "amplifier": "Storm audio, vehicle motion, and the recipient reaction"
    }
  ],
  "oneSentencePromise": "Outread the storm to keep a tiny airship postal network alive",
  "coreProofMoment": "The player redraws one route around a storm and immediately sees fuel, cargo damage, and arrival outcome change",
  "knownFrame": "route-planning management",
  "sourceAction": "Choose a path under resource constraints",
  "sourceSystemResponse": "Travel time and resources change with the route",
  "sourceReward": "A plan succeeds and efficiency improves",
  "meaningfulDifference": "Forecast uncertainty is drawn directly into the route",
  "teamCapacity": "Two developers and a part-time composer",
  "runwayMonths": 14,
  "nextIrreversibleCommitment": "Publish the Steam coming-soon page"
}
```

Allowed `conceptOrigin` values are `theme-first`, `system-first`, `holistic-image`, and `imitation`. They select the missing counterpart to investigate; they are not maturity scores.

Reward families are `sensory`, `mastery`, `discovery`, `agency`, `attachment`, and `aesthetic-emotion`. A reward mechanism must keep before state, player action, system response, after state, perceived reward, and optional amplifier separate. An effect is not proof that a player felt rewarded.

For imitation or a Known Frame, describe the source action, response, and reward separately from the target adaptation. A familiar surface feature is not a transferable mechanism by itself.

Everything in the Project Brief is declared design intent. It remains separate from implementation evidence, human response, market demand, and commercial readiness.

## Run evidence-grounded player-lens rounds

Each player lens uses a saved v3 persona whose voice, observed patterns, decision triggers, and limitations trace back to real Steam recommendation IDs and explicit research questions. Each question includes concrete `evidenceSignals` expected in relevant review text; the server removes reviews that match none and rechecks the match when saving a persona. It generates falsifiable response hypotheses; it is not a person who played the build. Every source game must state why its reviews answer a named question. Direct and adjacent competitors need three matching axes; system references may support a narrower mechanism question. Market-success anchors and visual references stay outside persona voice. UI screenshots and builds are scenario stimuli; they do not become personality traits.

Each saved persona reviews every current or proposed scenario. The stored Player Simulation Card records:

- the exact saved derivation pack that grounded the persona;
- the exact review memories retrieved;
- the exact captures or operated sessions exposed as scenario stimuli;
- what the player expected, noticed, and could not read;
- the next action and decision reason;
- predicted friction, reward signals, feeling, and continuation choice;
- confidence, unknowns, and the human question and observable signal that could falsify the prediction.

When UI is selected, each persona round must identify a captured target or reference image in `stimulusEvidenceRefs`. When competition is selected, it must cite a review voice from a game assigned the `competitor` role. `scenario-only` rounds must keep the stimulus list empty. Use the same personas and evidence class across `current` and `proposal`; otherwise the delta is confounded.

These cards are evidence-grounded behavioral hypotheses. They are useful for finding differentiated reactions and choosing a test. They do not prove fun, purchase intent, retention, or segment size until compared with human observations.

## Review the shortest emotional loop

The developer-project review includes a `Moment-to-Moment Experience Loop`:

1. `anticipation`: the player reads a threat, opportunity, or next goal.
2. `commit`: the player accepts a cost, risk, timing choice, or resource tradeoff.
3. `resolution`: the system makes cause, target, impact, and after-state readable.
4. `recovery / reset`: the player understands the next action or retry and returns to another decision.

The review records these checks separately:

- first-glance action and time to first meaningful input;
- decision tension and the participant's reason for choosing;
- difficulty ramp, boredom, overwhelm, and near-failure;
- fair failure through telegraph, available counterplay, and participant attribution;
- success amplification versus a human report of felt reward;
- novelty cadence;
- the participant's reason to play again;
- features or presentation that can be removed without weakening the primary feeling.

A three-second exposure may be declared as a test condition, but it is not a universal pass threshold. Creator self-play is useful for finding maker friction; it does not replace first-read human evidence.

## Add evidence in layers

### Concept test

Use `conceptTest` when participants see a pitch, mockup, or short concept stimulus. Record the actual stimulus, exposure protocol, recruitment, target-player definition, questions, and anonymous participant responses. Keep theme comprehension, theme-system fit, action comprehension, reward comprehension, and interest separate.

For a revision, supply all of `parentStimulusId`, `changeSummary`, `changedVariables`, and `invariantsKept`. A single declared change is still only a comparison candidate, not causal proof.

### First-contact test

Call `record_first_contact` for a real first viewport, store surface, screenshot sequence, trailer, or demo entry. It accepts the asset and exposure conditions plus pseudonymous participant observations, and fixes four unaided questions and the presentation order server-side. Pass the returned `meta.resultHandle` as `firstContactResultHandle` to `audit-project` or `review-change`; the prompt exposes it for immediate exact-save.

Record visual-quality response, theme comprehension, theme appeal, action and reward comprehension, try intent, and immediate rejection separately. The helper reduces intake work, but it does not turn a small cohort into representative evidence.

Understanding a theme does not mean liking it. Try intent does not equal purchase or conversion.

### Playtest

If the client can control an HTTP(S) build, provide `playtestUrl`, a concrete `playtestTask`, build ID, controls, and duration. If direct control is unavailable, provide a recording, consecutive captures, input log, or moderated observation. Viewing a page is not a playtest.

Use a structured `playtestSession` or `playtestCohort` to preserve the evidence. See [Experiments and playtests](../reference/experiments.md).

## Expected output

Saving a canonical evaluation returns both the complete artifact metadata and two structured views: `decisionCard` and `developerSummary`. The short summary contains the verdict, decision, highest risk, next action, and success signal, so daily work does not require parsing the full review Markdown.

A complete developer-project evaluation separates:

- each player lens's response hypothesis from the reviewer synthesis;
- the Appeal Promise before purchase from the Delivered Experience after play starts;
- the Core Experience Map from player evidence;
- reward mechanisms from their visual or audio amplifiers;
- repair work from experiments;
- current milestone blockers from future content ideas;
- creator judgment from human first-read, failure attribution, felt reward, and replay intent.

Known execution failures such as crashes, capture gaps, liveness failures, or missing instrumentation belong in the Repair Backlog. The Experiment Queue contains at most three unresolved player, asset, or market hypotheses after those prerequisites are repaired.

Do not expand scope, outsource, hire, or make another irreversible commitment without a project-specific bottleneck, evidence ID, capacity and runway boundary, reversible next step, and expansion trigger.

## Privacy and input boundaries

- Participant IDs must be anonymous pseudonyms.
- Remove names, email addresses, phone numbers, addresses, account IDs, and other personal data before submission.
- Do not place credentials in URLs or free text.
- The server accepts specification text and HTTP(S) URLs, not arbitrary local executables.
- Extract archives on the client and pass only the relevant text.
