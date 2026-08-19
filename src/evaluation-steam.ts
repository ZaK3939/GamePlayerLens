import {hasActualCalendarDate, isActualCalendarDate} from "./calendar-date.js";
import {
  canonicalToken,
  type EvaluationHeading,
  sectionLines,
  tableRows,
} from "./evaluation-markdown-structure.js";

export const STEAM_RELEASE_READINESS_HEADERS = [
  "Gate",
  "Current status",
  "Evidence status / ID",
  "Official source",
  "Date / earliest completion",
  "Owner",
  "Next action",
] as const;
export const STEAM_RELEASE_GATES = [
  "Onboarding / app credit",
  "App configuration",
  "Store Presence",
  "Game Build",
  "Coming Soon",
  "Pricing / launch offer",
  "Manual release",
] as const;
export const STEAM_RELEASE_STATUSES = new Set([
  "not-started",
  "blocked",
  "submitted",
  "changes-requested",
  "approved",
  "live",
  "N/A",
]);
export const STEAM_PUBLICATION_GATES = new Set([
  "store-reveal",
  "release-date",
  "launch",
]);
export const MILESTONE_CURRENT_GATES = new Set([
  "concept",
  "prototype",
  "store-reveal",
  "demo-next-fest",
  "release-date",
  "launch",
  "post-launch",
]);
const STEAM_RELEASE_GATE_SET = new Set<string>(STEAM_RELEASE_GATES);

function bulletValue(lines: readonly string[], label: string): string[] {
  const prefix = `- ${label}:`;
  return lines.flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith(prefix)) return [];
    const value = trimmed.slice(prefix.length).trim();
    return value ? [value] : [];
  });
}

function requiredBulletValue(lines: readonly string[], label: string): string {
  const matches = bulletValue(lines, label);
  if (matches.length !== 1) {
    throw new Error(
      `evaluation Markdown is not canonical: Steam Release Readiness requires exactly one ${label} metadata line`,
    );
  }
  return matches[0]!;
}

function steamStatus(lines: readonly string[]): string | undefined {
  const statuses = bulletValue(lines, "Status");
  if (statuses.length > 1) {
    throw new Error(
      "evaluation Markdown is not canonical: Steam Release Readiness requires exactly one Status metadata line",
    );
  }
  return statuses[0] ? canonicalToken(statuses[0]) : undefined;
}

function isExplicitNa(lines: readonly string[]): boolean {
  return lines.some((line) => /^適用外:[ \t]*\S/u.test(line.trim()))
    || steamStatus(lines) === "N/A";
}

function requireMilestoneCurrentGate(
  lines: string[],
  headings: EvaluationHeading[],
): string {
  const values = bulletValue(
    sectionLines(lines, headings, "Milestone Readiness", 3),
    "Current gate",
  );
  if (values.length !== 1) {
    throw new Error(
      "evaluation Markdown is not canonical: Milestone Readiness requires exactly one Current gate metadata line",
    );
  }
  const gate = canonicalToken(values[0]!);
  if (!MILESTONE_CURRENT_GATES.has(gate)) {
    throw new Error(
      "evaluation Markdown is not canonical: Milestone Readiness Current gate must be concept, prototype, store-reveal, demo-next-fest, release-date, launch, or post-launch",
    );
  }
  return gate;
}

function requireEvidenceStatus(
  value: string,
  evidenceIds: ReadonlySet<string>,
  gate: string,
): void {
  const match = /^(observed|reported|missing)(?:\b|[;,])/u.exec(value);
  if (!match) {
    throw new Error(
      `evaluation Markdown is not canonical: Steam Release Readiness ${gate} Evidence status / ID must start with observed, reported, or missing`,
    );
  }
  if (match[1] === "missing") return;
  const ids = [...value.matchAll(/E-\d{3,}/gu)].map((hit) => hit[0]);
  if (ids.length === 0 || ids.some((id) => !evidenceIds.has(id))) {
    throw new Error(
      `evaluation Markdown is not canonical: Steam Release Readiness ${gate} must cite Evidence Index IDs unless evidence is missing`,
    );
  }
}

function validateSelectedTable(
  section: readonly string[],
  evidenceIds: ReadonlySet<string>,
): void {
  const earliest = requiredBulletValue(section, "Earliest release date");
  const blocking = requiredBulletValue(section, "Blocking gate");
  const official = requiredBulletValue(section, "Official rules checked at");
  const earliestToken = canonicalToken(earliest);
  if (earliestToken !== "unresolved" && !isActualCalendarDate(earliestToken)) {
    throw new Error(
      "evaluation Markdown is not canonical: Steam Release Readiness Earliest release date must be YYYY-MM-DD or unresolved",
    );
  }
  if (blocking !== "none" && !STEAM_RELEASE_GATE_SET.has(blocking)) {
    throw new Error(
      "evaluation Markdown is not canonical: Steam Release Readiness Blocking gate must be one of the 7 gate names or none",
    );
  }
  if (
    !official.toLowerCase().includes("partner.steamgames.com")
    || !hasActualCalendarDate(official)
  ) {
    throw new Error(
      "evaluation Markdown is not canonical: Steam Release Readiness Official rules checked at must cite a Steamworks URL and accessedAt date",
    );
  }

  const rows = tableRows(
    section,
    STEAM_RELEASE_READINESS_HEADERS,
    "Steam Release Readiness",
  );
  if (rows.length !== STEAM_RELEASE_GATES.length) {
    throw new Error(
      "evaluation Markdown is not canonical: Steam Release Readiness requires the 7 ordered gates",
    );
  }
  for (const [index, expectedGate] of STEAM_RELEASE_GATES.entries()) {
    const [gate, status, evidence, source, date, ,] = rows[index]!;
    if (gate !== expectedGate) {
      throw new Error(
        `evaluation Markdown is not canonical: Steam Release Readiness row ${index + 1} must be ${expectedGate}`,
      );
    }
    if (!STEAM_RELEASE_STATUSES.has(status!)) {
      throw new Error(
        `evaluation Markdown is not canonical: Steam Release Readiness ${expectedGate} has an invalid Current status`,
      );
    }
    requireEvidenceStatus(evidence!, evidenceIds, expectedGate);
    if (
      !source!.toLowerCase().includes("partner.steamgames.com")
      && canonicalToken(source!).toLowerCase() !== "n/a"
    ) {
      throw new Error(
        `evaluation Markdown is not canonical: Steam Release Readiness ${expectedGate} Official source must be a Steamworks URL or N/A`,
      );
    }
    const dateToken = canonicalToken(date!);
    if (dateToken !== "unresolved" && !isActualCalendarDate(dateToken)) {
      throw new Error(
        `evaluation Markdown is not canonical: Steam Release Readiness ${expectedGate} Date / earliest completion must be YYYY-MM-DD or unresolved`,
      );
    }
  }
}

export function validateSteamReleaseReadiness(
  lines: string[],
  headings: EvaluationHeading[],
  evidenceIds: ReadonlySet<string>,
): void {
  const section = sectionLines(lines, headings, "Steam Release Readiness", 3);
  const currentGate = requireMilestoneCurrentGate(lines, headings);
  const selected = steamStatus(section) === "Selected";
  const na = isExplicitNa(section);
  if (STEAM_PUBLICATION_GATES.has(currentGate) && !selected) {
    throw new Error(
      "evaluation Markdown is not canonical: store-reveal, release-date, and launch require Steam Release Readiness Status Selected",
    );
  }
  if (selected && na) {
    throw new Error(
      "evaluation Markdown is not canonical: Steam Release Readiness cannot be both Selected and N/A",
    );
  }
  if (selected) {
    validateSelectedTable(section, evidenceIds);
    return;
  }
  if (na) return;
  throw new Error(
    "evaluation Markdown is not canonical: Steam Release Readiness requires Status Selected with the 7-gate table, or an explicit N/A reason",
  );
}
