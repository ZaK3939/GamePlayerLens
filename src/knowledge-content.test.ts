import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

const root = process.cwd();

async function read(path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

describe("canonical adoption evaluation template", () => {
  it("contains the five required report sections and overall fields", async () => {
    const content = await read("knowledge/templates/adoption-eval.md");
    for (const heading of [
      "Overall Assessment",
      "Decision Card",
      "Who Plays and Why — Flow Analysis",
      "Flow Summary",
      "Update Strategy",
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
    const content = await read("knowledge/templates/adoption-eval.md");
    for (const domain of ["ゲームプレイ", "ストア訴求", "UI", "価格", "ローカライズ", "競合"]) {
      expect(content).toMatch(new RegExp(`### ${domain}[\\s\\S]*?根拠:`));
    }
    expect(content).toContain("knowledge/intel/");
    expect(content).toContain("根拠不足");
    expect(content).toContain("現状 vs 変更案");
  });

  it("starts with mode, selected domains, and explicit N/A reasons", async () => {
    const content = await read("knowledge/templates/adoption-eval.md");
    const reportStart = content.slice(0, content.indexOf("## Overall Assessment"));

    expect(reportStart).toContain("Mode");
    expect(reportStart).toContain("Selected Domains");
    expect(reportStart).toContain("N/A");
    expect(reportStart).toContain("理由");
    expect(content).toMatch(/baseline[\s\S]*現状だけ/);
    expect(content).toMatch(/change[\s\S]*現状 vs 変更案/);
  });

  it("qualifies flow size and separates zero, missing, and estimates", async () => {
    const content = await read("knowledge/templates/adoption-eval.md");

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
    const content = await read("knowledge/templates/adoption-eval.md");

    expect(content).toContain("## Evidence Index");
    expect(content).toContain("artifact repository-relative path");
    expect(content).toContain("observedAt");
    expect(content).toContain("source");
    expect(content).toContain("confidence");
    expect(content).toContain("next validation");
  });

  it("separates substantive data coverage from direct observation and integrity", async () => {
    const content = await read("knowledge/templates/adoption-eval.md");

    expect(content).toContain("## Data Coverage Matrix");
    expect(content).toContain("Coverage rate");
    expect(content).toContain("Direct observation rate");
    expect(content).toContain("observed / reported-zero / estimated / missing / N/A");
  });

  it("reports matched UI benchmark provenance and axis-level quality gaps", async () => {
    const content = await read("knowledge/templates/adoption-eval.md");

    expect(content).toContain("Benchmark task");
    expect(content).toContain("Reference provenance");
    expect(content).toContain("Game UI Database");
    expect(content).toContain("Reference median");
    expect(content).toContain("target - median");
    expect(content).toContain("static-only");
    expect(content).toContain("unscored");
  });

  it("turns findings into a bounded update decision and persona impact backlog", async () => {
    const content = await read("knowledge/templates/adoption-eval.md");

    expect(content).toContain("fix-now");
    expect(content).toContain("Smallest next update");
    expect(content).toContain("Success signal");
    expect(content).toContain("Guardrail / rollback");
    expect(content).toContain("Update inventory");
    expect(content).toContain("Persona Update Impact Matrix");
    expect(content).toContain("Prioritized Update Backlog");
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
  it("run-sim references every workflow tool and saves derived personas in order", async () => {
    const content = await read("skills/run-sim.md");
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
    expect(content).toContain("workspaces/");
  });

  it("requires the saved evaluation relative path for completion", async () => {
    const content = await read("skills/run-sim.md");
    const completion = content.slice(content.indexOf("## 完了条件"));

    expect(completion).toContain("evaluation");
    expect(completion).toContain("repo-relative path");
    expect(completion).toContain("run ID");
    expect(completion).toContain("workspaces/<target>/runs/");
  });

  it("seals replay inputs, exact rounds, and calibration claims as a run artifact", async () => {
    const content = await read("skills/run-sim.md");

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
  });

  it("uses the bounded Steam CDN image path for storefront screenshots", async () => {
    const content = await read("skills/run-sim.md");

    expect(content).toMatch(
      /steam_fetch\.screenshots[\s\S]*steamstatic\.com[\s\S]*sourceType[\s\S]*steam-image/,
    );
    expect(content).toMatch(/Steam Sonar[\s\S]*sourceType[\s\S]*page[\s\S]*Obscura/);
  });

  it("uses UI reference catalogs without treating popularity or scraping as evidence", async () => {
    const content = await read("skills/run-sim.md");

    expect(content).toContain("Game UI Database");
    expect(content).toContain("Interface In Game");
    expect(content).toContain("uiBenchmarkTask");
    expect(content).toContain("uiReferenceUrls");
    expect(content).toContain("sourceTool=`manual`");
    expect(content).toContain("bulk scraping");
    expect(content).toContain("gap = target score - reference median");
  });

  it("keeps both prompt files non-empty and freezes blind results before reveal", async () => {
    const runSim = await read("skills/run-sim.md");
    const blind = await read("skills/ui-blind-compare.md");
    expect(runSim.trim().length).toBeGreaterThan(100);
    expect(blind.trim().length).toBeGreaterThan(100);
    expect(blind).toContain("匿名化");
    expect(blind).toContain("正解を明かす前");
    expect(blind).toContain("固定");
  });
});
