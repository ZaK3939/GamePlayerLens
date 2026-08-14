# Reviewing a developer project

Use this workflow for a concept, prototype, vertical slice, demo, prelaunch build, or proposed change that is not fully represented by a public Steam page.

## Start with one decision

Do not ask for a general verdict on the whole game. Choose the next decision that could change development work, for example:

- Is the shortest gameplay loop legible enough to expand?
- Does the first viewport communicate the theme, action, and reward?
- Should the team build the next content wave or repair the current slice?
- Does a proposed UI change improve one concrete player task?

Use `mode=baseline` for the current state. Use `mode=change` only when both `currentState` and `proposal` are supplied.

## Minimal `run-sim` request

All prompt arguments are strings. `projectBrief` is a JSON object encoded as a string by the MCP client.

```json
{
  "target": "Project Nyx",
  "topic": "Prototype core and next milestone",
  "subjectKind": "developer-project",
  "mode": "baseline",
  "domains": "gameplay,storefront,competition",
  "market": "Japan",
  "language": "japanese",
  "projectBrief": "<JSON-encoded Project Brief>"
}
```

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

## Run review-grounded virtual players

The virtual player is built from saved v2 personas whose voice, observed patterns, decision triggers, and limitations trace back to real Steam recommendation IDs. Use target-game reviews for current expectations and competitor or reference-game reviews for genre conventions, alternatives, and dealbreakers. UI screenshots and builds are scenario stimuli; they do not become personality traits.

Each saved persona runs through every current or proposed scenario. A Player Simulation Card records:

- the exact review memories retrieved;
- what the player expected, noticed, and could not read;
- the next action and decision reason;
- predicted friction, reward signals, feeling, and continuation choice;
- confidence, unknowns, and the human question and observable signal that could falsify the prediction.

When UI is selected, each persona round must cite a captured target or reference image. When competition is selected, it must cite a review voice from a game assigned the `competitor` role. Use the same personas and evidence class across `current` and `proposal`; otherwise the delta is confounded.

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

Use `firstContactTest` for a real first viewport, store surface, screenshot sequence, trailer, or demo entry. Record device, viewport, exposure duration, sound, order, visual-quality response, theme comprehension, theme appeal, action and reward comprehension, try intent, and immediate rejection reasons separately.

Understanding a theme does not mean liking it. Try intent does not equal purchase or conversion.

### Playtest

If the client can control an HTTP(S) build, provide `playtestUrl`, a concrete `playtestTask`, build ID, controls, and duration. If direct control is unavailable, provide a recording, consecutive captures, input log, or moderated observation. Viewing a page is not a playtest.

Use a structured `playtestSession` or `playtestCohort` to preserve the evidence. See [Experiments and playtests](../reference/experiments.md).

## Expected output

A complete developer-project evaluation separates:

- each virtual player's response from the reviewer synthesis;
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
