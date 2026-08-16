---
name: game-player-lens
description: Turn an indie game's playable build or milestone into one evidence-grounded next decision using the GamePlayerLens MCP. Use when a developer asks what to fix next, wants an AI-operated play probe or review-grounded virtual player panel, needs player personas built from relevant Steam reviews, challenges a risky product assumption, compares current and candidate builds or UI, researches relevant competitors, or decides whether a vertical slice, demo, or release should advance. Do not use for engine API implementation or as a replacement for human fun or demand tests.
---

# GamePlayerLens

Move one indie game decision forward. Prefer a live build, one player task, one risky assumption, the smallest playable change, and a neutral human falsifier over a broad report.

## Connection gate

1. Find the GamePlayerLens MCP server and call `get_status`.
2. If it is unavailable, do not imitate its tools or claim that evidence was saved. Explain that this skill supplies agent guidance but does not install the MCP server. Point the developer to the repository README for the version-pinned `npx` doctor and MCP configuration.
3. Continue when storage is writable. Treat missing ITAD or Obscura configuration as a warning unless the chosen task needs that integration.

## Choose the smallest route

| Current need | Route |
|---|---|
| A known blocker prevents play | `play-build` with `knownBlockers`; repair the first blocker |
| A playable build has one bounded player task | `play-build` |
| Grounded virtual players are requested but relevant saved personas are absent | Run the neutral task, then prepare grounded player lenses |
| A candidate must be compared with current behavior | `review-change` |
| A vertical slice, demo, release, or other milestone needs a gate | `audit-project` |
| UI stimuli are ready for an identity-hidden comparison | `ui-blind-compare` |
| One release needs license issue spotting | `legal_source_plan`, exact-save, then `audit-game-legal` |

Use Steam, competitor, review, persona, and update tools only when their evidence can change the current decision. Match competitors by the relevant mechanic, player task, genre, release freshness, and market question; popularity or review percentage alone is insufficient. Do not turn a playable-build question into a whole-game audit.

## Prepare grounded player lenses

Prepare lenses only when the developer asks for differentiated target-player hypotheses or when those hypotheses can change the next build decision.

1. Call `play-build` with `playerLensMode=neutral` first. If a known blocker prevents the task, do not prepare or derive any persona; repair and replay first.
2. Turn one observed player-task uncertainty into one research question. Declare concrete `evidenceSignals` likely to occur in reviews discussing that action, response, reward, or friction.
3. Prefer target-game reviews when the game is already released. Otherwise use `steam_search`, `steam_discover`, and game evidence to select only sources that answer the question. A direct or adjacent competitor must match at least three match axes; prefer a newer or actively maintained game only after task and mechanism fit are established. Never select a game because it is famous, highly rated, or visually similar.
4. Call `derive_personas` with explicit market, language, research question, signals, and source roles. A UI capture or operated build is a stimulus for the panel, not a persona trait or personality evidence.
5. Respect `generationReadiness`. Generate only the supported count, keep voices disjoint, follow the returned schema, and call `save_persona` once for each persona with the exact derivation result handle. If readiness is blocked, return the evidence gap instead of a virtual player.
6. Call `play-build` again with `playerLensMode=grounded-personas`, the saved `personaIds`, and exactly the same build, task, start state, end state, and evidence class. Compare the neutral response with each grounded hypothesis.
7. Call `record_player_panel` with one shared observed stimulus, the neutral summary, distinctiveness / communication / scene-legibility checks, and one lens per saved persona. Let the server resolve exact review text, research-question grounding, and persona SHA-256.
8. Exact-save the returned handle with `save_artifact(kind=intel)`. If validation fails, return the missing or mismatched grounding instead of keeping an unchecked panel.

Do not use a market-success anchor or visual reference as persona voice. Do not use Balatro, Hades, or any familiar title unless its declared source role and match axes answer this task's research question.

## Developer Decision Challenge

Challenge intent only when the next playable question or product tradeoff is ambiguous.

- Inspect the repository, build, and available evidence before asking the developer.
- Ask one dependent intent question per turn. Do not ask the developer technical implementation questions that repository evidence or established practice can answer.
- Use this four-part form:

  - **Question:** the unresolved product or player-outcome choice.
  - **Recommended answer:** the best current choice.
  - **Why:** observed evidence and the assumption being made.
  - **Cost if wrong:** time, rework, or player harm caused by a mistaken choice.

- Stop when the intended player behavior, one task, success or kill signal, and invariants are explicit enough to execute.
- If a known blocker already prevents the task, skip the challenge and run the repair-first route. Do not interview the developer about a defect that can already be reproduced.

The developer challenge may recommend a direction. The later Human falsifier must be neutral and must never reveal a leading recommendation or the developer's recommended answer.

## Operate before interpreting

1. Start the real build and perform the declared task from its declared start state.
2. Record player action, visible or audible response, transition, end state, and recovery behavior.
3. For Canvas or WebGL findings, capture a screenshot before making a visual claim.
4. Report each defect with reproduction steps, player-visible effect, severity, and likely subsystem. Keep code ownership unassigned unless source evidence identifies it.
5. Use review-grounded personas to produce questions and response hypotheses, never invented testimony. Do not claim fun, frustration, demand, retention, or purchase intent without an eligible human observation.

## Close the loop after a change

Re-run the same player task under the same relevant build conditions and invariants. A successful compile or unit test is necessary evidence, but it is not behavior proof. Compare the live action-response trace against one success signal and one regression guardrail.

If the behavior still fails, choose the smallest bounded repair supported by the new observation. Do not respond to a reproducible build failure with more market research.

## Output contract

Keep daily development output compact:

1. **Findings first:** at most three, ordered by player impact, with direct evidence.
2. **Developer Decision Challenge:** include only if an unresolved product choice blocks execution.
3. **Build Handoff:** smallest change, keep-unchanged invariants, execution mode, same player task, success signal, and guardrail.
4. **Human falsifier:** one neutral task or question that could disprove the player hypothesis. Do not include a leading cue or recommended answer.

When grounded personas were requested, place this compact block after the observed trace:

### Virtual Player Panel

| Lens | Grounded memory | Observed target stimulus | Predicted response | Next choice | Confidence | Human falsifier |
|---|---|---|---|---|---|---|

Keep disagreement visible. Do not average the panel into a vote, segment size, or market prediction.

Treat the validated `record_player_panel` artifact as the canonical panel. Do not preserve a conflicting free-form version.

Use GO, HOLD, or NO-GO only for `review-change` or `audit-project`. A daily `play-build` loop ends with the next executable build decision, not a ceremonial verdict.

## Boundaries

- Prefer fixing and replaying a known defect over collecting more evidence about why it might matter.
- A predicted player response is a hypothesis, even when it is grounded in a real Steam review.
- AI operation can test controls, state transitions, rendering, causality, and recovery. It cannot substitute for a person's felt reward, comprehension, replay intent, or willingness to buy.
- A static screenshot cannot prove motion, latency, input feel, audio timing, or hidden state.
- A milestone review cannot compensate for a missing playable build or missing human observation.
