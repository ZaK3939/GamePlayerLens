import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";
import {compileRunSimRecipe} from "./run-recipe.js";

describe("run-sim recipe compiler", () => {
  it("selects only the requested subject and domains in canonical order", async () => {
    const source = await readFile(new URL("../skills/run-sim.md", import.meta.url), "utf8");
    const compiled = compileRunSimRecipe(source, {
      subjectKind: "developer-project",
      selectedDomains: ["competition", "gameplay", "ui"],
    });

    expect(compiled).toContain("Developer subject contract");
    expect(compiled).not.toContain("Existing-game subject contract");
    expect(compiled).toContain("Gameplay domain contract");
    expect(compiled).toContain("UI domain contract");
    expect(compiled).toContain("Competition domain contract");
    expect(compiled).not.toContain("Storefront domain contract");
    expect(compiled).not.toContain("Price domain contract");
    expect(compiled).not.toContain("Localization domain contract");
    expect(compiled.indexOf("Gameplay domain contract")).toBeLessThan(
      compiled.indexOf("UI domain contract"),
    );
    expect(compiled.length).toBeLessThan(12_000);
  });

  it("includes every domain only for auto selection", async () => {
    const source = await readFile(new URL("../skills/run-sim.md", import.meta.url), "utf8");
    const compiled = compileRunSimRecipe(source, {subjectKind: "existing-game"});

    for (const label of [
      "Gameplay domain contract",
      "Storefront domain contract",
      "UI domain contract",
      "Price domain contract",
      "Localization domain contract",
      "Competition domain contract",
    ]) {
      expect(compiled).toContain(label);
    }
    expect(compiled).toContain("Existing-game subject contract");
    expect(compiled).not.toContain("Developer subject contract");
  });

  it("treats an unsectioned test recipe as one core section", () => {
    expect(compileRunSimRecipe("# Test recipe\n", {
      subjectKind: "existing-game",
      selectedDomains: ["ui"],
    })).toBe("# Test recipe\n");
  });
});
