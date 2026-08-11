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
      "Who Plays and Why — Flow Analysis",
      "Flow Summary",
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
    for (const domain of ["UI", "価格", "ローカライズ", "競合"]) {
      expect(content).toMatch(new RegExp(`### ${domain}[\\s\\S]*?根拠:`));
    }
    expect(content).toContain("knowledge/intel/");
    expect(content).toContain("根拠不足");
    expect(content).toContain("現状 vs 変更案");
  });
});

describe("harsh critic rubric", () => {
  it("enforces evidence, blind comparison, and persona provenance", async () => {
    const content = await read("knowledge/rubrics/harsh-critic.md");
    expect(content).toContain("根拠なし主張が1つでもあれば差し戻し");
    expect(content).toContain("ブラインド比較");
    expect(content).toContain("AAAに見えなければ続行");
    expect(content).toContain("voice[].text");
    expect(content).toContain("source_appid");
    expect(content).toContain("recommendation_id");
    expect(content).toContain("同一指摘");
    expect(content).toContain("根拠不足として停止");
  });
});

describe("MCP prompt source recipes", () => {
  it("run-sim references every v1 tool and saves derived personas in order", async () => {
    const content = await read("skills/run-sim.md");
    for (const tool of [
      "steam_search",
      "steam_fetch",
      "steam_reviews",
      "steam_timeline",
      "derive_personas",
      "save_persona",
      "ui_capture",
      "get_knowledge",
    ]) {
      expect(content).toContain(`\`${tool}\``);
    }
    expect(content.indexOf("`derive_personas`")).toBeLessThan(
      content.indexOf("`save_persona`"),
    );
    expect(content).toContain("workspaces/");
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
