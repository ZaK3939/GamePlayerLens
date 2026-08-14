import type {SubjectKind} from "./project-brief.js";
import type {SimulationDomain} from "./run-schemas.js";

const SECTION_PATTERN = /<!-- GPL:section ([a-z:-]+) -->\n([\s\S]*?)\n<!-- GPL:end -->/gu;
const DOMAIN_ORDER: readonly SimulationDomain[] = [
  "gameplay",
  "storefront",
  "ui",
  "price",
  "localization",
  "competition",
];
const SECTION_IDS = new Set([
  "core",
  "subject:existing-game",
  "subject:developer",
  ...DOMAIN_ORDER.map((domain) => `domain:${domain}`),
]);

export interface RunRecipeSelection {
  subjectKind?: SubjectKind;
  selectedDomains: readonly SimulationDomain[];
}

function parseSections(source: string): Map<string, string> {
  const sections = new Map<string, string>();
  const matches = [...source.matchAll(SECTION_PATTERN)];
  if (matches.length === 0) {
    throw new Error("run-sim recipe contains no declared sections");
  }

  const outside = source.replace(SECTION_PATTERN, "").trim();
  if (outside) throw new Error("run-sim recipe contains content outside declared sections");
  for (const match of matches) {
    const id = match[1]!;
    const content = match[2]!.trim();
    if (!SECTION_IDS.has(id)) throw new Error(`unknown run-sim recipe section: ${id}`);
    if (sections.has(id)) throw new Error(`duplicate run-sim recipe section: ${id}`);
    if (!content) throw new Error(`empty run-sim recipe section: ${id}`);
    sections.set(id, content);
  }
  if (!sections.has("core")) throw new Error("run-sim recipe is missing its core section");
  return sections;
}

function requiredSection(sections: Map<string, string>, id: string): string {
  const content = sections.get(id);
  if (!content?.trim()) throw new Error(`run-sim recipe is missing section: ${id}`);
  return content;
}

export function compileRunSimRecipe(
  source: string,
  selection: RunRecipeSelection,
): string {
  const sections = parseSections(source);
  const selected: string[] = [requiredSection(sections, "core")];
  if (selection.subjectKind) {
    selected.push(requiredSection(
      sections,
      selection.subjectKind === "existing-game"
        ? "subject:existing-game"
        : "subject:developer",
    ));
  }
  for (const domain of DOMAIN_ORDER) {
    if (selection.selectedDomains.includes(domain)) {
      selected.push(requiredSection(sections, `domain:${domain}`));
    }
  }
  return `${selected.join("\n\n")}\n`;
}
