# Reviewing an existing Steam game

Use this workflow for a released game, an Early Access title, or a public store page with a resolvable Steam appid.

## Fast triage

1. Resolve the appid with `steam_search` when necessary.
2. Call `steam_brief` with the appid, requested Steam language, and country code.
3. Read `readiness.supportedDecisions`, `unsupportedClaims`, `gaps`, and `nextActions`.
4. Save the returned `resultHandle` immediately when the evidence will be used later.
5. Call only the deeper tools needed for the selected decision.

`steam_brief` is a bounded first pass. It preserves source-specific provenance and partial success; it is not a replacement for every specialized tool and it does not operate the game build.

## Full `audit_project` request

```json
{
  "target": "Hades",
  "topic": "Current Japan positioning and closest competitors",
  "subjectKind": "existing-game",
  "domains": "storefront,price,localization,competition",
  "market": "Japan",
  "language": "japanese",
  "qualityTier": "premium indie"
}
```

Use `review_change` with `currentState`, `proposal`, and the exact `revisionBundle` described in the [developer-project guide](developer-project.md#revision-bundle). `domains` is a required comma-separated selection from `gameplay`, `storefront`, `ui`, `price`, `localization`, and `competition`.

## Domain boundaries

| Domain | Evidence-grounded questions | Unsupported shortcut |
|---|---|---|
| `gameplay` | What loop, goal, progression, failure, retry, and continued-play motives are observable? | Inferring internal state machines, formulas, or balance from tags and reviews |
| `storefront` | What promise do localized copy, screenshots, and public dashboard evidence create? | Treating an uncaptured deep link as evidence |
| `ui` | How does one matched task compare on hierarchy, legibility, density, state, feedback, accessibility, and finish? | Scoring motion or controller feel from a static image |
| `price` | What are current US, JP, and DE prices, discount state, and optional ITAD history? A selected price review also records a Pricing Decision Trace for primary objective, base price, and launch-offer feasibility; none of these prove conversion. | Inventing past trends from a current price |
| `localization` | What do requested-locale copy, target-language reviews, and game captures show? | Treating a supported-language list as translation quality |
| `competition` | Which games match the player action, system response, reward, audience, freshness, and market role? | Selecting by one tag, one review percentage, or one old hit |

## Competitor selection

Start with at least three must-match axes, such as:

- repeated player action and decision cadence;
- system response and reward structure;
- target-player problem or play context;
- platform, controls, and session length;
- release stage and freshness window;
- screen state for a visual comparison.

Use at least two candidate routes. `steam_discover` can intersect one primary SteamSpy tag or genre with up to three additional values, but tag overlap is only candidate generation. Recheck candidates with `steam_fetch`, store evidence, reviews, and current release information.

The canonical Competitor Selection Ledger keeps two independent roles:

- Fit role: `direct-competitor`, `adjacent-competitor`, `system-reference`, `visual-reference`, `comparison-control`, or `rejected-candidate`.
- Market role: `recent-success`, `breakout-anchor`, `established-reference`, `emerging-watch`, or `not-market-evidence`.

An included cohort needs a direct or adjacent competitor, a recent success or breakout anchor, and a comparison control or explicit rejected candidate. A success claim requires both a review signal and a separate scale or momentum signal. SteamSpy owners remain estimate ranges, not unit sales.

Keep direct competitors, system references, visual references, and market-success examples in separate rows. A visually excellent game from another genre can be a visual reference without becoming a direct competitor.

## Updates

`steam_updates` uses Steam's official news feed. The default `updates` scope selects `patchnotes`-tagged items or bounded title-based update signals. `updateEvidence`, `updateConfidence`, `typeConfidence`, and `classificationBasis` keep official selection separate from heuristic classification.

Update frequency and the date of the latest announcement do not prove quality, development speed, abandonment, sales, or retention impact. A useful update recommendation connects:

- a player problem in the target game;
- a relevant competitor precedent;
- the smallest update;
- a success signal;
- a guardrail or rollback condition.

## UI comparison

When the `ui` domain is selected, supply a `uiBenchmarkTask` containing the player's goal, starting state, completion state, platform, and control method. Choose two to four shipped references with the same screen state, similar information load, and requested quality tier.

Game UI Database and Interface In Game are candidate catalogs, not quality evidence by themselves. Preserve each reference's page URL, access time, game, screen state, platform, controls, static/video status, capture ID, and cohort-selection reason. Respect authentication, robots rules, licenses, and download restrictions.

Score the anonymous set before identity reveal. After reveal, report axis-level ordinal scores and `gap = target - reference median`. Use `unscored` for unsupported axes. A static screenshot cannot support motion, latency, hover, focus, disabled, loading, error, or controller-feel scores.

If the same model already knows the identity mapping and cannot isolate that memory, call the result a `non-blind structured comparison`, not a blind comparison.

## Price and localization

Current regional prices are observations at the reported time. ITAD history is an optional, separate source. Do not merge the two time axes.

Localized store responses can fall back to English. `matchesEnglishCopy` reports normalized string equality only; neither `true` nor `false` proves why Steam returned the text or whether the translation is good. Use requested-locale copy, target-language reviews, and in-game captures as separate evidence.

## External-source failures

Supported transient HTTP and JSON failures are retried once. Longer `Retry-After` values return a warning instead of blocking the MCP call. Each source can fail independently, so one unavailable endpoint does not discard data already collected from another source.

Preserve warnings in the Evidence Index. Do not reinterpret unavailable as zero, not present, or not supported. Reference links to Steam Sonar, SteamDB, or another dashboard become evidence only after their content is captured or saved with provenance.
