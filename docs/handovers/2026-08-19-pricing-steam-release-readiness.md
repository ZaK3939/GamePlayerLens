# Pricing and Steam Release Readiness handover

- Date: 2026-08-19
- Branch: `main`
- Package version: `0.6.1` (unchanged; this handover is not a tagged release)
- Status: implemented and locally verified

## Objective

Make GamePlayerLens review a game's pricing as an objective-led decision rather than a cheap-versus-expensive opinion, and keep Steam publication feasibility separate from player, market, and pricing hypotheses.

## Delivered behavior

### Pricing Decision Trace

When `price` is selected, the review now records:

- one `primary objective`, such as net revenue, paid reach, qualified feedback, or positioning;
- base price, package / edition, and region;
- launch discount rate, duration, and post-offer price;
- the value or quality signal as a hypothesis rather than a fact;
- matched competitor and target-player evidence;
- one success signal and observation window;
- guardrail and revisit condition.

The harsh-critic gate rejects a recommendation that equates a lower price with more sales, mixes multiple objectives into one metric, or uses a single developer anecdote as market proof.

### Steam Release Readiness

For `store-reveal`, `release-date`, and `launch` decisions, the review now loads `steam-release-readiness.md` and reports ordered operational gates:

1. partner onboarding and app credit;
2. app, package, depot, launch-option, and pricing configuration;
3. Store Presence checklist and review submission;
4. Game Build upload, Steam-client test, checklist, and review;
5. Coming Soon publication and minimum live period;
6. pricing and launch-offer feasibility;
7. permissions, support / rollback ownership, and manual release.

Each gate keeps its status, evidence status, source, date, earliest completion, owner, and next action. A developer-entered Steamworks status is `reported` unless an authenticated view was directly observed. The workflow must not request or save Steamworks credentials, cookies, recovery codes, bank details, tax records, or identity documents.

## Current official constraints checked

Checked against official Steamworks documentation on 2026-08-19. The workflow must recheck them at execution time because platform rules can change.

- Steam Direct currently documents a USD 100 app fee and, for the first few titles, a 30-day wait from fee payment to release.
- Store Presence must be submitted before the Game Build review; both need approval before release.
- Store review is described as typically taking 3–5 business days, with submission at least 7 business days before the intended page publication recommended to allow changes.
- Coming Soon currently needs to be public for at least two weeks before release.
- An approved title does not release automatically; an authorized user completes the `Release App` flow.
- A launch discount is currently limited to 10–40% for 7–14 days and remains subject to regional minimum-price rules.

The source video's example of JPY 380 reduced to JPY 150 is approximately 60.5% off. It is useful as a pricing-positioning anecdote but is not currently feasible as a Steam launch discount under the documented 40% cap.

Official sources:

- https://partner.steamgames.com/steamdirect/
- https://partner.steamgames.com/doc/store/releasing
- https://partner.steamgames.com/doc/store/review_process
- https://partner.steamgames.com/doc/store/types
- https://partner.steamgames.com/doc/store/pricing
- https://partner.steamgames.com/doc/marketing/discounts

## Changed surfaces

- `knowledge/rubrics/evidence-coverage.md`: price decision evidence boundary.
- `knowledge/rubrics/steam-release-readiness.md`: new ordered Steam publication rubric.
- `knowledge/rubrics/harsh-critic.md`: price-purpose and platform-feasibility rejection gates.
- `knowledge/rubrics/indie-survival-strategy.md`: conditional release-readiness integration.
- `knowledge/templates/review-eval.md`: canonical Pricing Decision Trace and Steam Release Readiness output tables.
- `skills/game-review.md`: price-domain behavior and conditional rubric loading.
- `docs/guides/developer-project.md`: developer-facing Steam publication sequence and privacy boundary.
- `src/knowledge-content.test.ts`: canonical contract coverage.

## Verification

- `pnpm test`: 614 / 614 passed.
- `src/capture.test.ts` focused repetition: 10 / 10 passed after one transient failure in an earlier all-suite run.
- `pnpm build`: passed.
- `pnpm smoke:stdio`: passed; 30 tools, 5 prompts, 0 protocol errors.
- `pnpm smoke:package`: passed; 220 files, 0 internal files.
- `git diff --check`: passed.

## Boundaries and follow-up

- This change strengthens canonical review instructions and report structure; it does not connect to a private Steamworks account or verify partner-side state automatically.
- Rule-valid pricing does not prove conversion, demand, player trust, or net revenue.
- The new traces are canonical Markdown output contracts, not new dedicated MCP input schemas.
- Before a tagged release, dogfood both traces with one real prelaunch project, then decide whether repeated input friction justifies a structured intake helper.
- The package version and README's pinned `v0.6.1` installation commands remain unchanged until an explicit release is cut.
