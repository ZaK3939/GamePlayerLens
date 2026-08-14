import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

const root = process.cwd();

async function read(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

describe("canonical adoption evaluation template", () => {
  it("contains the five required report sections and overall fields", async () => {
    const content = await read("knowledge/templates/review-eval.md");
    for (const heading of [
      "Overall Assessment",
      "Decision Card",
      "Who Plays and Why — Flow Analysis",
      "Flow Summary",
      "Update Strategy",
      "Player Simulation Cards",
      "Domain Findings",
      "Change Delta",
    ]) {
      expect(content).toContain(`## ${heading}`);
    }
    for (const field of [
      "Adoption Likelihood",
      "Initial Friction",
      "Retention Potential",
      "Key Blocking Factors",
      "Volume driver",
      "Friction",
      "Retention",
      "Current size",
      "What we control",
    ]) {
      expect(content).toContain(field);
    }
  });

  it("requires evidence or an explicit evidence gap in every domain", async () => {
    const content = await read("knowledge/templates/review-eval.md");
    for (const domain of ["ゲームプレイ", "ストア訴求", "UI", "価格", "ローカライズ", "競合"]) {
      expect(content).toMatch(new RegExp(`### ${domain}[\\s\\S]*?根拠:`));
    }
    expect(content).toContain("knowledge/intel/");
    expect(content).toContain("根拠不足");
    expect(content).toContain("現状 vs 変更案");
    expect(content).toMatch(
      /Derivation memory[\s\S]*Explicit stimuli[\s\S]*Review voice[\s\S]*Perception[\s\S]*Decision \/ reason/,
    );
    expect(content).toContain("derivation memory");
    expect(content).toContain("stimulusEvidenceRefs");
    expect(content).toContain("Human falsifier");
  });

  it("requires a role-separated, freshness-aware competitor selection ledger", async () => {
    const content = await read("knowledge/templates/review-eval.md");

    expect(content).toContain("Competitor freshness window");
    expect(content).toContain("Competitor must-match axes");
    expect(content).toContain("Competitor candidate routes");
    expect(content).toContain("Core-loop / purchase-reason evidence");
    expect(content).toContain("Review signal");
    expect(content).toContain("Scale / momentum signal");
    expect(content).toContain("direct-competitor");
    expect(content).toContain("recent-success");
    expect(content).toContain("comparison-control");
  });

  it("starts with mode, selected domains, and explicit N/A reasons", async () => {
    const content = await read("knowledge/templates/review-eval.md");
    const reportStart = content.slice(0, content.indexOf("## Overall Assessment"));

    expect(reportStart).toContain("Mode");
    expect(reportStart).toContain("Selected Domains");
    expect(reportStart).toContain("N/A");
    expect(reportStart).toContain("理由");
    expect(content).toMatch(/baseline[\s\S]*現状だけ/);
    expect(content).toMatch(/change[\s\S]*現状 vs 変更案/);
    expect(content.indexOf("## Decision Card")).toBeLessThan(
      content.indexOf("## Detailed Scope"),
    );
  });

  it("qualifies flow size and separates zero, missing, and estimates", async () => {
    const content = await read("knowledge/templates/review-eval.md");

    expect(content).toContain("reviewStats");
    expect(content).toMatch(/owners[\s\S]*推定[\s\S]*売上本数ではない/);
    expect(content).toContain("外部根拠");
    expect(content).toContain("reported-zero");
    expect(content).toContain("missing");
    expect(content).toContain("estimated");
    expect(content).toMatch(/observed[\s\S]*source[\s\S]*実値/);
    expect(content).toMatch(/balanced[\s\S]*市場母集団の比率ではない/);
  });

  it("requires an evidence index and an actionable final recommendation", async () => {
    const content = await read("knowledge/templates/review-eval.md");

    expect(content).toContain("## Evidence Index");
    expect(content).toContain("artifact repository-relative path");
    expect(content).toContain("observedAt");
    expect(content).toContain("source");
    expect(content).toContain("confidence");
    expect(content).toContain("next validation");
  });

  it("separates substantive data coverage from direct observation and integrity", async () => {
    const content = await read("knowledge/templates/review-eval.md");

    expect(content).toContain("## Data Coverage Matrix");
    expect(content).toContain("Coverage rate");
    expect(content).toContain("Direct observation rate");
    expect(content).toContain("observed / reported-zero / estimated / missing / N/A");
  });

  it("reports matched UI benchmark provenance and axis-level quality gaps", async () => {
    const content = await read("knowledge/templates/review-eval.md");

    expect(content).toContain("Benchmark task");
    expect(content).toContain("Reference provenance");
    expect(content).toContain("Game UI Database");
    expect(content).toContain("Reference median");
    expect(content).toContain("target - median");
    expect(content).toContain("static-only");
    expect(content).toContain("unscored");
  });

  it("turns findings into a bounded update decision and persona impact backlog", async () => {
    const content = await read("knowledge/templates/review-eval.md");

    expect(content).toContain("Verdict");
    expect(content).toContain("fix-now");
    expect(content).toContain("Proven");
    expect(content).toContain("Unproven");
    expect(content).toContain("Highest risk");
    expect(content).toContain("Next validations");
    expect(content).toContain("Success signal");
    expect(content).toContain("Guardrail / rollback");
    expect(content).toContain("Update inventory");
    expect(content).toContain("Persona Update Impact Matrix");
    expect(content).toContain("Prioritized Update Backlog");
  });

  it("adds a conditional indie survival strategy with traceable core and funnel outputs", async () => {
    const content = await read("knowledge/templates/review-eval.md");

    expect(content).toContain("## Indie Survival Strategy");
    expect(content).toContain("Core Experience Map");
    expect(content).toContain("coreProofMoment");
    expect(content).toContain("Concept Origin Route");
    expect(content).toContain("Reward Mechanism Trace");
    expect(content).toContain("Moment-to-Moment Experience Loop");
    expect(content).toContain("Mechanism Transfer Map");
    expect(content).toContain("Concept Test Trace");
    expect(content).toContain("Promise-Delivery Trace");
    expect(content).toContain("Funnel Health");
    expect(content).toContain("Milestone Readiness");
    expect(content).toContain("Capability Reinvestment Gate");
    expect(content).toContain("Repair Backlog");
    expect(content).toContain("Experiment Queue");
    expect(content).toContain("Core Legibility Gate");
    expect(content).toContain("Core Revision Ledger");
    expect(content).toContain("First-contact Asset Readiness");
    expect(content).toContain("Immediate reject risk");
    expect(content).toMatch(/適用外[\s\S]*N\/A理由/);
    expect(content).toMatch(/Experiment Queue[\s\S]*最大3件/);
    expect(content).toMatch(/Repair Backlog[\s\S]*(実験|Experiment)[\s\S]*(分離|混ぜない)/);
    expect(content).toMatch(/Repair Backlog[\s\S]*(0件|行を空)/);
    expect(content).toMatch(/Capability Reinvestment Gate[\s\S]*Bottleneck[\s\S]*Expansion trigger/);
    expect(content).toMatch(/Coverage rate[\s\S]*小数1桁/);
  });
});

describe("harsh critic rubric", () => {
  it("enforces evidence, blind comparison, and persona provenance", async () => {
    const content = await read("knowledge/rubrics/harsh-critic.md");
    expect(content).toContain("根拠なし主張が1つでもあれば差し戻し");
    expect(content).toContain("ブラインド比較");
    expect(content).toContain("voice[].text");
    expect(content).toContain("source_appid");
    expect(content).toContain("recommendation_id");
    expect(content).toContain("同一指摘");
    expect(content).toContain("根拠不足として停止");
  });

  it("rejects incomplete or overclaimed moment-to-moment experience evidence", async () => {
    const content = await read("knowledge/rubrics/harsh-critic.md");

    expect(content).toContain("Moment-to-Moment Experience Loop");
    expect(content).toMatch(/primaryIntendedFeeling[\s\S]*優先/);
    expect(content).toMatch(/anticipation[\s\S]*commit[\s\S]*resolution[\s\S]*recovery/);
    expect(content).toMatch(/telegraph[\s\S]*counterplay[\s\S]*failure attribution/);
    expect(content).toMatch(/amplifier[\s\S]*felt reward/);
    expect(content).toMatch(/creator self-play[\s\S]*human player evidence/);
    expect(content).toMatch(/3秒[\s\S]*固定/);
  });

  it("conditions UI review on scope and compares against the requested tier", async () => {
    const content = await read("knowledge/rubrics/harsh-critic.md");

    expect(content).toMatch(/UI[\s\S]*Selected Domains[\s\S]*選択/);
    expect(content).toMatch(/UI[\s\S]*選択外[\s\S]*N\/A[\s\S]*不合格理由にしない/);
    expect(content).toMatch(/qualityTier[\s\S]*同等[\s\S]*出荷済み製品/);
    expect(content).not.toContain("AAA");
  });

  it("rejects population claims from balanced samples and qualifies SteamSpy data", async () => {
    const content = await read("knowledge/rubrics/harsh-critic.md");

    expect(content).toContain("representative: false");
    expect(content).toContain("population ratio");
    expect(content).toMatch(/SteamSpy[\s\S]*owners[\s\S]*推定[\s\S]*売上本数ではない/);
    expect(content).toContain("reported-zero");
    expect(content).toContain("missing");
    expect(content).toContain("estimated");
    expect(content).toContain("observed");
  });

  it("rejects unsupported gameplay and localization quality claims", async () => {
    const content = await read("knowledge/rubrics/harsh-critic.md");

    expect(content).toMatch(/タグ[\s\S]*ゲームロジック[\s\S]*断定[\s\S]*差し戻す/);
    expect(content).toMatch(/対応言語[\s\S]*翻訳品質[\s\S]*断定[\s\S]*差し戻す/);
    expect(content).toMatch(/ストア訴求[\s\S]*localizedStorefronts/);
    expect(content).toMatch(/matchesEnglishCopy=true[\s\S]*fallback[\s\S]*翻訳品質/);
    expect(content).toMatch(/matchesEnglishCopy=false[\s\S]*fallback[\s\S]*断定/);
  });

  it("requires an immutable replay ledger without overstating calibration", async () => {
    const content = await read("knowledge/rubrics/harsh-critic.md");

    expect(content).toContain("run artifact");
    expect(content).toContain("recipe SHA-256");
    expect(content).toContain("evidence SHA-256");
    expect(content).toContain("reportedByClient");
    expect(content).toContain("calibrationStatus");
    expect(content).toMatch(/実測[\s\S]*calibrated[\s\S]*差し戻す/);
    expect(content).toContain("integrity.status=verified");
    expect(content).toMatch(/finalEvaluationRef[\s\S]*round[\s\S]*循環参照/);
  });

  it("rejects unmatched or unsupported UI quality comparisons", async () => {
    const content = await read("knowledge/rubrics/harsh-critic.md");

    expect(content).toContain("Game UI Database");
    expect(content).toContain("provenance artifact");
    expect(content).toContain("gap = target - median");
    expect(content).toMatch(/static screenshot[\s\S]*motion[\s\S]*unscored/);
  });

  it("rejects survival claims that collapse promise, fun, wishlists, and sales into one cause", async () => {
    const content = await read("knowledge/rubrics/harsh-critic.md");

    expect(content).toContain("indie-survival-strategy.md");
    expect(content).toMatch(/wishlist[\s\S]*面白さ[\s\S]*単独原因[\s\S]*差し戻す/);
    expect(content).toMatch(/販売本数[\s\S]*税率[\s\S]*普遍[\s\S]*差し戻す/);
    expect(content).toMatch(/購入前[\s\S]*購入後[\s\S]*単一score/);
    expect(content).toMatch(/Next Fest[\s\S]*公式Steamworks[\s\S]*現在/);
    expect(content).toMatch(/Core Legibility Gate[\s\S]*Core Revision Ledger[\s\S]*First-contact Asset Readiness/);
    expect(content).toMatch(/Concept Origin Route[\s\S]*Reward Mechanism Trace[\s\S]*Mechanism Transfer Map/);
    expect(content).toMatch(/表層feature[\s\S]*action → response → reward[\s\S]*差し戻す/);
    expect(content).toMatch(/AI[\s\S]*人間のfun[\s\S]*証明[\s\S]*差し戻す/);
    expect(content).toMatch(/最初の4枚[\s\S]*30秒[\s\S]*固定条件[\s\S]*差し戻す/);
    expect(content).toMatch(/understoodTheme[\s\S]*themeAppeal[\s\S]*tryIntent[\s\S]*(混同|分け)/);
    expect(content).toMatch(/outsource[\s\S]*runway[\s\S]*Evidence ID[\s\S]*差し戻す/);
  });
});

describe("indie survival strategy rubric", () => {
  it("separates pre-purchase promise from delivered player experience", async () => {
    const content = await read("knowledge/rubrics/indie-survival-strategy.md");

    expect(content).toContain("Appeal Promise");
    expect(content).toContain("Delivered Experience");
    expect(content).toContain("Promise-Delivery Trace");
    expect(content).toMatch(/掛け算[\s\S]*単一score[\s\S]*禁止/);
    expect(content).toMatch(/storefront[\s\S]*playtest[\s\S]*別のevidence/);
  });

  it("maps a distinctive core from theme through experience and reward", async () => {
    const content = await read("knowledge/rubrics/indie-survival-strategy.md");

    for (const field of [
      "targetPlayer",
      "themeWorld",
      "distinctiveSystem",
      "primaryIntendedFeeling",
      "shortestRepeatableLoop",
      "playerDecision",
      "systemResponse",
      "rewardMechanisms",
      "beforeState",
      "playerAction",
      "afterState",
      "perceivedReward",
      "oneSentencePromise",
    ]) {
      expect(content).toContain(field);
    }
    expect(content).toMatch(/表層[\s\S]*模倣[\s\S]*体験[\s\S]*報酬/);
    expect(content).toContain("Known Frame + Meaningful Difference");
    expect(content).toContain("Concept Origin Route");
    expect(content).toMatch(/theme-first[\s\S]*system-first[\s\S]*holistic-image[\s\S]*imitation/);
    expect(content).toContain("Reward Mechanism Trace");
    expect(content).toContain("Moment-to-Moment Experience Loop");
    expect(content).toMatch(/anticipation[\s\S]*commit[\s\S]*resolution[\s\S]*recovery/);
    expect(content).toMatch(/fair failure[\s\S]*telegraph[\s\S]*counterplay/i);
    expect(content).toMatch(/novelty cadence[\s\S]*replay pull/i);
    expect(content).toMatch(/creator self-play[\s\S]*human player evidence/i);
    expect(content).toContain("projectBriefDiagnostics.rewardMechanism");
    expect(content).toMatch(/inherent[\s\S]*transition/);
    expect(content).toMatch(/Before state[\s\S]*After state/);
    expect(content).toContain("Mechanism Transfer Map");
    expect(content).toMatch(/surface feature[\s\S]*source action → response → reward[\s\S]*target adaptation/i);
    expect(content).toMatch(/projectBrief[\s\S]*declared design intent[\s\S]*player evidence/);
    expect(content).toMatch(/visualQuality[\s\S]*visualQualityReason/);
    expect(content).toMatch(/understoodTheme[\s\S]*themeAppeal[\s\S]*tryIntent/);
  });

  it("diagnoses the acquisition and play funnel without blaming one metric", async () => {
    const content = await read("knowledge/rubrics/indie-survival-strategy.md");

    expect(content).toContain("impression → store visit → wishlist → demo start → demo completion → purchase → retained play");
    expect(content).toMatch(/wishlist[\s\S]*興味signal[\s\S]*面白さ[\s\S]*証明しない/);
    expect(content).toMatch(/exposure[\s\S]*cohort[\s\S]*window[\s\S]*単独原因/);
    expect(content).toContain("Traffic Breakdown");
  });

  it("uses readiness gates and current official Steamworks rules", async () => {
    const content = await read("knowledge/rubrics/indie-survival-strategy.md");

    for (const gate of [
      "concept",
      "prototype",
      "store-reveal",
      "demo-next-fest",
      "release-date",
      "launch",
      "post-launch",
    ]) {
      expect(content).toContain(`\`${gate}\``);
    }
    expect(content).toContain("partner.steamgames.com/doc/marketing/upcoming_events/nextfest");
    expect(content).toMatch(/Next Fest[\s\S]*1作品[\s\S]*1回/);
    expect(content).toMatch(/宣伝機会[\s\S]*4回だけ[\s\S]*採用しない/);
    expect(content).toContain("Update Visibility Round");
  });

  it("makes survival targets project-specific and experiment-driven", async () => {
    const content = await read("knowledge/rubrics/indie-survival-strategy.md");

    expect(content).toContain("ExperimentSpec");
    expect(content).toContain("ExperimentOutcome");
    expect(content).toMatch(/販売本数[\s\S]*runway[\s\S]*project固有/);
    expect(content).toMatch(/platform fee[\s\S]*refund[\s\S]*tax[\s\S]*固定値/);
    expect(content).toMatch(/AI playtest[\s\S]*human playtest[\s\S]*代表/);
    expect(content).toContain("Capability Reinvestment Gate");
    expect(content).toMatch(/outsource[\s\S]*hire[\s\S]*runway[\s\S]*reversible/i);
    expect(content).toMatch(/online[\s\S]*story[\s\S]*(scope|運用|依存)/i);
  });

  it("treats third-party concept tests as bounded observations rather than a success threshold", async () => {
    const content = await read("knowledge/rubrics/indie-survival-strategy.md");

    expect(content).toContain("conceptTest");
    expect(content).toMatch(/stimulusId[\s\S]*recruitment[\s\S]*questionsAsked/);
    expect(content).toMatch(/understoodTheme[\s\S]*themeSystemFit[\s\S]*understoodAction[\s\S]*understoodReward[\s\S]*interest/);
    expect(content).toMatch(/themeSystemFitReason[\s\S]*補完しない/);
    expect(content).toMatch(/固定threshold[\s\S]*採用しない/);
    expect(content).toMatch(/interest[\s\S]*purchase[\s\S]*証明しない/);
    expect(content).toMatch(/participantId[\s\S]*匿名[\s\S]*個人情報/);
    expect(content).toMatch(/projectBriefRevision[\s\S]*promiseShown/);
    expect(content).toMatch(/conceptTestEvidence\.resultHandle[\s\S]*exact-save/);
    expect(content).toMatch(/完全一致[\s\S]*品質[\s\S]*採点しない/);
    expect(content).toMatch(/自動検出[\s\S]*email形式だけ/);
    expect(content).toMatch(/parentStimulusId[\s\S]*changeSummary[\s\S]*Core Revision Ledger/);
    expect(content).toMatch(/一度に変えた変数[\s\S]*因果帰属/);
  });

  it("turns the core into an evidence-backed learning loop and first-contact audit", async () => {
    const content = await read("knowledge/rubrics/indie-survival-strategy.md");

    expect(content).toContain("Core Legibility Gate");
    expect(content).toContain("theme-specific play");
    expect(content).toContain("experience → reward");
    expect(content).toContain("unaided teach-back");
    expect(content).toContain("coreProofMoment");
    expect(content).toContain("core proof moment");
    expect(content).toContain("Core Revision Ledger");
    expect(content).toMatch(/定期[\s\S]*固定cadence[\s\S]*しない/);
    expect(content).toContain("First-contact Asset Readiness");
    expect(content).toContain("core-visible / theme-only / system-only / unreadable / untested");
    expect(content).toMatch(/第一viewport[\s\S]*最初に見えるscreenshots/);
    expect(content).toMatch(/AI[\s\S]*人間のfun[\s\S]*certifyしない/);
    expect(content).toMatch(/firstContactTestEvidence\.resultHandle[\s\S]*exact-save/);
    expect(content).toMatch(/changedVariables[\s\S]*invariantsKept[\s\S]*因果/);
    expect(content).toMatch(/theme appeal[\s\S]*theme comprehension[\s\S]*別/i);
    expect(content).toMatch(/try intent[\s\S]*(purchase|需要)[\s\S]*証明しない/i);
  });
});

describe("evidence coverage rubric", () => {
  it("defines fixed domain dimensions, two coverage rates, and confidence boundaries", async () => {
    const content = await read("knowledge/rubrics/evidence-coverage.md");

    for (const domain of [
      "gameplay",
      "storefront",
      "ui",
      "price",
      "localization",
      "competition",
    ]) {
      expect(content).toContain(`### ${domain}`);
    }
    expect(content).toContain("Coverage rate");
    expect(content).toContain("Direct observation rate");
    expect(content).toContain("reported-zero");
    expect(content).toContain("estimated");
    expect(content).toContain("missing");
    expect(content).toContain("N/A");
    expect(content).toMatch(/blocking[\s\S]*confidence[\s\S]*high/);
  });
});

describe("competitor selection rubric", () => {
  it("separates fit, success, freshness, controls, and structural code evidence", async () => {
    const rubric = await read("knowledge/rubrics/competitor-selection.md");
    const recipe = await read("skills/game-review.md");
    const critic = await read("knowledge/rubrics/harsh-critic.md");

    for (const role of [
      "direct-competitor",
      "adjacent-competitor",
      "system-reference",
      "visual-reference",
      "rejected-candidate",
      "recent-success",
      "breakout-anchor",
      "comparison-control",
    ]) {
      expect(rubric).toContain(role);
    }
    expect(rubric).toMatch(/高評価率[\s\S]*(十分|成功).*ではない/);
    expect(rubric).toMatch(/Review signal[\s\S]*Scale \/ momentum signal/);
    expect(rubric).toMatch(/freshness window[\s\S]*current-window/);
    expect(rubric).toMatch(/code-review-graph[\s\S]*(候補|補助)[\s\S]*(source|test|runtime)/i);
    expect(recipe).toMatch(/competitor-selection\.md[\s\S]*Competitor Selection Ledger/);
    expect(critic).toMatch(/Competitor Selection Ledger[\s\S]*高評価率/);
  });
});

describe("playtest rubric", () => {
  it("requires a bounded protocol, chronological observations, and human-validity limits", async () => {
    const content = await read("knowledge/rubrics/playtest.md");

    expect(content).toContain("build ID");
    expect(content).toContain("player task");
    expect(content).toContain("start state");
    expect(content).toContain("end state");
    expect(content).toContain("Action → response");
    expect(content).toContain("time to first meaningful action");
    expect(content).toContain("failure → retry");
    expect(content).toMatch(/AI[\s\S]*人間[\s\S]*代表/);
    expect(content).toContain("playtest provenance");
    expect(content).toContain("executionEnvironment");
    expect(content).toMatch(/software[\s\S]*hardware[\s\S]*(一般化|generaliz)/i);
  });

  it("observes the shortest emotional loop without turning creator judgment into player evidence", async () => {
    const content = await read("knowledge/rubrics/playtest.md");

    expect(content).toMatch(/first-glance[\s\S]*meaningful action/i);
    expect(content).toMatch(/decision tension[\s\S]*choice reason/i);
    expect(content).toMatch(/difficulty ramp[\s\S]*novelty cadence[\s\S]*replay pull/i);
    expect(content).toMatch(/fair failure[\s\S]*telegraph[\s\S]*counterplay[\s\S]*failure attribution/i);
    expect(content).toMatch(/success amplifier[\s\S]*felt reward/i);
    expect(content).toMatch(/creator self-play[\s\S]*human player evidence/i);
  });

  it("requires exact-saved session evidence and separates operation from human reward reports", async () => {
    const rubric = await read("knowledge/rubrics/playtest.md");
    const recipe = await read("skills/game-review.md");

    expect(rubric).toMatch(/playtestSessionEvidence\.resultHandle[\s\S]*exact-save/);
    expect(rubric).toMatch(/Action[\s\S]*response[\s\S]*rewardSignal/);
    expect(rubric).toMatch(/AI[\s\S]*humanReport[\s\S]*(禁止|受理しない)/);
    expect(recipe).toMatch(/playtestSessionEvidence\.resultHandle[\s\S]*save_artifact/);
    expect(recipe).toMatch(/one bounded session[\s\S]*(completion rate|retention|需要)/);
  });

  it("connects ordinary retests through explicit revision lineage", async () => {
    const rubric = await read("knowledge/rubrics/playtest.md");
    const recipe = await read("skills/game-review.md");

    expect(rubric).toMatch(/parentSessionId[\s\S]*changeSummary[\s\S]*changedVariables[\s\S]*invariantsKept/);
    expect(rubric).toMatch(/複数[\s\S]*(因果|causal)[\s\S]*(unresolved|未解決)/);
    expect(recipe).toMatch(/playtest-session-<sessionId>[\s\S]*parentSessionId[\s\S]*get_artifact/);
    expect(recipe).toMatch(/parent[\s\S]*task[\s\S]*executionEnvironment[\s\S]*controls[\s\S]*(cohort|participant)/);
  });

  it("aggregates bounded cohorts without inventing population rates", async () => {
    const rubric = await read("knowledge/rubrics/playtest.md");
    const recipe = await read("skills/game-review.md");
    const template = await read("knowledge/templates/review-eval.md");

    expect(rubric).toMatch(/playtestCohortEvidence\.resultHandle[\s\S]*exact-save/);
    expect(rubric).toMatch(/sessionCount[\s\S]*uniqueHumanParticipantCount[\s\S]*repeatHumanParticipantCount/);
    expect(rubric).toMatch(/AI[\s\S]*human[\s\S]*(分離|混ぜない)/);
    expect(rubric).toMatch(/件数[\s\S]*(率|rate)[\s\S]*(禁止|変換しない)/);
    expect(recipe).toMatch(/playtestCohortEvidence\.resultHandle[\s\S]*save_artifact/);
    expect(recipe).toMatch(/playtestSession[\s\S]*playtestCohort[\s\S]*(同時|一方)/);
    expect(template).toContain("Playtest Cohort Summary");
    expect(rubric).toMatch(/retestComparisons[\s\S]*mismatchedFields/);
    expect(rubric).toMatch(/comparison-candidate-only[\s\S]*(因果|causality)/);
    expect(recipe).toMatch(/internalComparisons[\s\S]*evidenceTransition/);
    expect(recipe).toMatch(/externalParentReadbacks[\s\S]*get_artifact/);
    expect(template).toContain("Retest Comparison Trace");
  });
});

describe("update strategy rubric", () => {
  it("separates official history, heuristic classification, persona response, and causality", async () => {
    const content = await read("knowledge/rubrics/update-strategy.md");

    expect(content).toContain("steam_updates");
    expect(content).toContain("patchnotes");
    expect(content).toContain("heuristic");
    expect(content).toContain("updateEvidence");
    expect(content).toContain("typeConfidence");
    expect(content).toContain("platformHints");
    expect(content).toMatch(/本文中の単語だけではupdateとして選定しません/);
    expect(content).toContain("medianIntervalDays");
    expect(content).toContain("Persona Update Impact Matrix");
    expect(content).toContain("fix-now / test-next-build / investigate / defer");
    expect(content).toMatch(/更新頻度[\s\S]*品質[\s\S]*retention/);
    expect(content).toMatch(/競合[\s\S]*証明ではありません/);
  });
});

describe("experiment loop rubric", () => {
  it("pre-registers a structured spec and records a hash-linked outcome", async () => {
    const content = await read("knowledge/rubrics/experiment.md");

    expect(content).toContain('artifactType: "experiment-spec"');
    expect(content).toContain('artifactType: "experiment-measurement"');
    expect(content).toContain('artifactType: "experiment-outcome"');
    for (const field of [
      "primaryMetricId",
      "plannedScenarios",
      "successCriteria",
      "guardrails",
      "predictions",
      "stoppingRule",
      "orderBiasPlan",
      "specRef",
      "predictionRunRef",
      "measurementEvidence",
      "criterionVerdicts",
      "overallVerdict",
    ]) {
      expect(content).toContain(field);
    }
    expect(content).toContain("run artifact SHA-256");
    expect(content).toContain("canonical record SHA-256");
    expect(content).toContain("forecastComparisons");
    expect(content).toContain("experimentDecisions");
  });

  it("derives immutable stages without calling prediction execution", async () => {
    const content = await read("knowledge/rubrics/experiment.md");

    for (const stage of ["registered", "predicted", "observed", "learned"]) {
      expect(content).toContain(stage);
    }
    expect(content).toMatch(/mutable status[\s\S]*持たない/);
    expect(content).toMatch(/run[\s\S]*予測simulation[\s\S]*executed[\s\S]*呼ばない/);
    expect(content).toMatch(/ExperimentSpec[\s\S]*overwrite=true[\s\S]*禁止/);
    expect(content).toMatch(/ExperimentOutcome[\s\S]*overwrite=true[\s\S]*禁止/);
  });

  it("keeps measurement sources separate and missing outcomes unresolved", async () => {
    const content = await read("knowledge/rubrics/experiment.md");

    for (const source of [
      "ai-playtest",
      "human-playtest",
      "telemetry",
      "steam-reviews",
      "store-metric",
      "manual-observation",
    ]) {
      expect(content).toContain(source);
    }
    expect(content).toMatch(/primary metric[\s\S]*ちょうど1件/);
    expect(content).toMatch(/metricId[\s\S]*metrics内[\s\S]*scenarioId[\s\S]*plannedScenarios内/);
    expect(content).toMatch(/candidate value - reference value/);
    expect(content).toMatch(/source[\s\S]*一致しない[\s\S]*criterion[\s\S]*unresolved/);
    expect(content).toMatch(/各result[\s\S]*cohort[\s\S]*window[\s\S]*sampleSize/);
    expect(content).toMatch(/missing[\s\S]*0[\s\S]*failure[\s\S]*変換しない/);
    expect(content).toMatch(/AI[\s\S]*human completion rate[\s\S]*observed[\s\S]*扱わない/);
  });

  it("scopes calibration to prior matching observed outcomes", async () => {
    const content = await read("knowledge/rubrics/experiment.md");

    expect(content).toContain("not-calibrated");
    expect(content).toContain("partially-calibrated");
    expect(content).toContain("calibrated");
    expect(content).toContain("reportedByClient=true");
    expect(content).toMatch(/calibrated[\s\S]*同一target[\s\S]*metric[\s\S]*source[\s\S]*instrument/);
    expect(content).toMatch(/モデル全般[\s\S]*統計的校正[\s\S]*意味しない/);
  });

  it("recomputes developer decisions without trusting reported verdicts", async () => {
    const content = await read("knowledge/rubrics/experiment.md");

    expect(content).toContain("serverOverallVerdict");
    expect(content).toContain("recommendedAction");
    expect(content).toContain("reportedVerdictsMatch");
    expect(content).toMatch(/guardrail[\s\S]*breached[\s\S]*stopped/);
    expect(content).toMatch(/未解決[\s\S]*unresolved/);
    expect(content).toMatch(/client申告[\s\S]*合わせません/);
  });
});

describe("UI quality gap rubric", () => {
  it("uses matched cohorts, provenance, ordinal anchors, and evidence boundaries", async () => {
    const content = await read("knowledge/rubrics/ui-quality-gap.md");

    expect(content).toContain("uiBenchmarkTask");
    expect(content).toContain("Game UI Database");
    expect(content).toContain("Interface In Game");
    expect(content).toContain("bulk scraping");
    expect(content).toContain("sourceTool=`manual`");
    expect(content).toContain("0〜4");
    expect(content).toContain("gap = target score - reference median");
    expect(content).toContain("unscored");
    expect(content).toContain("conversion");
    expect(content).toContain("non-blind structured comparison");
  });
});

describe("MCP prompt source recipes", () => {
  it("leads game reviews with a compact evidence-linked decision check", async () => {
    const content = await read("skills/game-review.md");

    expect(content).toMatch(/Decision Check[\s\S]*Verdict[\s\S]*Proven[\s\S]*Unproven[\s\S]*Highest risk[\s\S]*Next validations/);
    expect(content).toMatch(/Blocker[\s\S]*Important[\s\S]*Suggestion/);
    expect(content).toMatch(/reviewWorkflow=change[\s\S]*current\/proposal[\s\S]*audit[\s\S]*milestone readiness/);
    expect(content).toMatch(/persona[\s\S]*人間参加者の代替ではなく[\s\S]*review lens/);
  });

  it("game review references every workflow tool and saves derived personas in order", async () => {
    const content = await read("skills/game-review.md");
    for (const tool of [
      "steam_search",
      "steam_discover",
      "steam_fetch",
      "steam_reviews",
      "steam_timeline",
      "steam_updates",
      "derive_personas",
      "save_persona",
      "ui_capture",
      "get_knowledge",
      "save_artifact",
      "get_artifact",
    ]) {
      expect(content).toContain(`\`${tool}\``);
    }
    expect(content.indexOf("`derive_personas`")).toBeLessThan(
      content.indexOf("`save_persona`"),
    );
    expect(content).toContain("generationReadiness");
    expect(content).toContain("generationAllowed=false");
    expect(content).toContain("generationReadiness.supportedCount");
    expect(content).toContain("同じreview voiceをpersona間で再利用しません");
    expect(content).toContain("workspaces/");
  });

  it("requires the saved evaluation relative path for completion", async () => {
    const content = await read("skills/game-review.md");
    const completion = content.slice(content.indexOf("## 完了条件"));

    expect(completion).toContain("evaluation");
    expect(completion).toContain("repo-relative path");
    expect(completion).toContain("run ID");
    expect(completion).toContain("workspaces/<target>/runs/");
  });

  it("seals replay inputs, exact rounds, and calibration claims as a run artifact", async () => {
    const content = await read("skills/game-review.md");

    expect(content).toContain("kind=`run`");
    expect(content).toContain("scenario");
    expect(content).toContain("rounds");
    expect(content).toContain("finalEvaluationRef");
    expect(content).toContain("reportedByClient");
    expect(content).toContain("calibrationStatus");
    expect(content).toContain("SHA-256");
    expect(content).toContain("evidence-coverage.md");
    expect(content).toContain("scenario × Selected Domain");
    expect(content).toContain("persona × scenario");
    expect(content).toMatch(/finalEvaluationRef[\s\S]*evidenceRefs[\s\S]*含め/);
    expect(content).toContain("integrity.status");
    expect(content).toContain("simulationReadiness");
    expect(content).toContain("simulationReadinessStatus");
    expect(content).toContain("status=rehearsal");
    expect(content).toContain("calibration.serverVerified=true");
    expect(content).toContain("outcomeChecks");
    expect(content).toContain("forecastComparisons");
    expect(content).toContain("experimentDecisions");
    expect(content).toContain("recommendedAction");
    expect(content).toContain("reportedVerdictsMatch=false");
    expect(content).toContain("population rate");
    expect(content).toContain("causal lift");
  });

  it("runs prospective experiments as spec, prediction, outcome, and learning artifacts", async () => {
    const content = await read("skills/game-review.md");

    expect(content).toContain("experiment.md");
    expect(content).toContain("ExperimentSpec");
    expect(content).toContain("Prediction Run");
    expect(content).toContain("ExperimentOutcome");
    expect(content).toMatch(/結果を見る前[\s\S]*ExperimentSpec[\s\S]*保存/);
    expect(content).toMatch(/ExperimentSpec[\s\S]*evidence[\s\S]*SHA-256/);
    expect(content).toMatch(/missing[\s\S]*unresolved[\s\S]*保存/);
    expect(content).toMatch(/次[\s\S]*ExperimentSpec[\s\S]*parentOutcomeRef/);
    expect(content).toContain("simulationReadiness.status=validation-ready");
    expect(content).toContain("heldOutValidation.status=planned");
    expect(content).toContain("artifactType=experiment-measurement");
    expect(content).toContain("calibration.serverVerified=true");
  });

  it("applies the indie survival strategy to concept, launch, and marketing consultations", async () => {
    const content = await read("skills/game-review.md");

    expect(content).toContain("indie-survival-strategy.md");
    expect(content).toContain("Core Experience Map");
    expect(content).toContain("Promise-Delivery Trace");
    expect(content).toContain("Funnel Health");
    expect(content).toContain("Milestone Readiness");
    expect(content).toMatch(/wishlist[\s\S]*単独[\s\S]*面白さ/);
    expect(content).toMatch(/Steamworks[\s\S]*Next Fest[\s\S]*現在/);
  });

  it("keeps the developer project brief separate from player evidence", async () => {
    const recipeContent = await read("skills/game-review.md");
    const criticContent = await read("knowledge/rubrics/harsh-critic.md");

    expect(recipeContent).toMatch(/projectBrief[\s\S]*declared design intent[\s\S]*player evidence/);
    expect(recipeContent).toMatch(/projectBriefDiagnostics[\s\S]*inventory[\s\S]*quality[\s\S]*pass/);
    expect(recipeContent).toMatch(/sourceAction[\s\S]*sourceSystemResponse[\s\S]*sourceReward/);
    expect(recipeContent).toMatch(/targetPlayer[\s\S]*oneSentencePromise[\s\S]*coreProofMoment[\s\S]*intake/);
    expect(recipeContent).toMatch(/mechanismTransfer[\s\S]*declared[\s\S]*evidence/);
    expect(recipeContent).toMatch(/blocking[\s\S]*missing[\s\S]*捏造/);
    expect(criticContent).toMatch(/projectBrief[\s\S]*player evidence[\s\S]*差し戻す/);
    expect(criticContent).toMatch(/projectBriefDiagnostics[\s\S]*quality score[\s\S]*差し戻す/);
    expect(criticContent).toMatch(/sourceAction[\s\S]*sourceSystemResponse[\s\S]*sourceReward[\s\S]*差し戻す/);
  });

  it("saves and interprets concept tests without turning sample counts into demand", async () => {
    const recipeContent = await read("skills/game-review.md");
    const criticContent = await read("knowledge/rubrics/harsh-critic.md");

    expect(recipeContent).toMatch(/conceptTest[\s\S]*save_artifact[\s\S]*manual/);
    expect(recipeContent).toMatch(/understoodTheme[\s\S]*themeSystemFit[\s\S]*understoodAction[\s\S]*understoodReward[\s\S]*interest[\s\S]*別/);
    expect(recipeContent).toMatch(/themeSystemFitReason[\s\S]*要求/);
    expect(recipeContent).toMatch(/participant count[\s\S]*conversion[\s\S]*変換しない/);
    expect(criticContent).toMatch(/conceptTest[\s\S]*固定threshold[\s\S]*差し戻す/);
  });

  it("saves and interprets first-contact tests as bounded observations", async () => {
    const content = await read("skills/game-review.md");

    expect(content).toMatch(/firstContactTestEvidence\.resultHandle[\s\S]*save_artifact/);
    expect(content).toMatch(/theme[\s\S]*action[\s\S]*reward[\s\S]*immediateReject/);
    expect(content).toMatch(/bounded sample[\s\S]*(conversion|需要)[\s\S]*(証明しない|変換しない)/);
  });

  it("uses the bounded Steam CDN image path for storefront screenshots", async () => {
    const content = await read("skills/game-review.md");

    expect(content).toMatch(
      /steam_fetch\.screenshots[\s\S]*steamstatic\.com[\s\S]*sourceType[\s\S]*steam-image/,
    );
    expect(content).toMatch(/Steam Sonar[\s\S]*sourceType[\s\S]*page[\s\S]*Obscura/);
  });

  it("uses UI reference catalogs without treating popularity or scraping as evidence", async () => {
    const content = await read("skills/game-review.md");

    expect(content).toContain("Game UI Database");
    expect(content).toContain("Interface In Game");
    expect(content).toContain("uiBenchmarkTask");
    expect(content).toContain("uiReferenceUrls");
    expect(content).toContain("sourceTool=`manual`");
    expect(content).toContain("bulk scraping");
    expect(content).toContain("gap = target score - reference median");
  });

  it("keeps both prompt files non-empty and freezes blind results before reveal", async () => {
    const gameReview = await read("skills/game-review.md");
    const blind = await read("skills/ui-blind-compare.md");
    expect(gameReview.trim().length).toBeGreaterThan(100);
    expect(blind.trim().length).toBeGreaterThan(100);
    expect(blind).toContain("匿名化");
    expect(blind).toContain("正解を明かす前");
    expect(blind).toContain("固定");
  });
});
