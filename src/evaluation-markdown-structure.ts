export interface EvaluationHeading {
  level: 2 | 3;
  title: string;
  line: number;
}

export function canonicalToken(value: string): string {
  return value.trim().replaceAll("`", "").trim().split(/[\s:：—–]/u)[0]?.trim() ?? "";
}

export function evaluationHeadings(lines: string[]): EvaluationHeading[] {
  const headings: EvaluationHeading[] = [];
  let fence: "`" | "~" | undefined;
  for (const [line, value] of lines.entries()) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(value);
    if (fenceMatch) {
      const marker = fenceMatch[1]?.[0] as "`" | "~";
      if (!fence) fence = marker;
      else if (fence === marker) fence = undefined;
      continue;
    }
    if (fence) continue;
    const match = /^ {0,3}(#{2,3})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(value);
    if (!match) continue;
    headings.push({
      level: match[1]?.length as 2 | 3,
      title: match[2] ?? "",
      line,
    });
  }
  return headings;
}

function evaluationSectionBody(
  lines: string[],
  headings: EvaluationHeading[],
  heading: EvaluationHeading,
): string {
  const next = headings.find(
    (candidate) => candidate.line > heading.line && candidate.level <= heading.level,
  );
  return lines
    .slice(heading.line + 1, next?.line ?? lines.length)
    .filter((line) => !/^ {0,3}#{1,6}[ \t]+/.test(line))
    .join("\n")
    .trim();
}

function markdownTableCells(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined;
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

export function sameCells(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && actual.every((cell, index) => cell === expected[index]);
}

export function tableRows(
  sectionLines: readonly string[],
  headers: readonly string[],
  label: string,
): string[][] {
  const matchingHeaders = sectionLines.flatMap((line, index) => {
    const cells = markdownTableCells(line);
    return cells && sameCells(cells, headers) ? [index] : [];
  });
  if (matchingHeaders.length !== 1) {
    throw new Error(
      `evaluation Markdown is not canonical: ${label} requires exactly one canonical table header`,
    );
  }
  const headerIndex = matchingHeaders[0]!;
  const separator = markdownTableCells(sectionLines[headerIndex + 1] ?? "");
  if (
    !separator
    || separator.length !== headers.length
    || separator.some((cell) => !/^:?-{3,}:?$/.test(cell))
  ) {
    throw new Error(
      `evaluation Markdown is not canonical: ${label} table separator is invalid`,
    );
  }
  const rows: string[][] = [];
  for (let index = headerIndex + 2; index < sectionLines.length; index += 1) {
    const cells = markdownTableCells(sectionLines[index] ?? "");
    if (!cells) break;
    if (cells.length !== headers.length || cells.some((cell) => cell.length === 0)) {
      throw new Error(
        `evaluation Markdown is not canonical: ${label} table row has invalid cells`,
      );
    }
    rows.push(cells);
  }
  return rows;
}

export function sectionLines(
  lines: string[],
  headings: EvaluationHeading[],
  title: string,
  level: 2 | 3,
): string[] {
  const heading = headings.find(
    (candidate) => candidate.level === level && candidate.title === title,
  );
  if (!heading) {
    throw new Error(`evaluation Markdown is not canonical: missing section ${title}`);
  }
  const next = headings.find(
    (candidate) => candidate.line > heading.line && candidate.level <= heading.level,
  );
  return lines.slice(heading.line + 1, next?.line ?? lines.length);
}


export function requireOrderedSections(
  lines: string[],
  headings: EvaluationHeading[],
  required: readonly string[],
  level: 2 | 3,
): void {
  let previousLine = -1;
  for (const title of required) {
    const matches = headings.filter(
      (heading) => heading.level === level && heading.title === title,
    );
    const label = `${"#".repeat(level)} ${title}`;
    if (matches.length === 0) {
      throw new Error(`evaluation Markdown is not canonical: missing section "${label}"`);
    }
    if (matches.length > 1) {
      throw new Error(`evaluation Markdown is not canonical: duplicate section "${label}"`);
    }
    const heading = matches[0];
    if (!heading || heading.line <= previousLine) {
      throw new Error(`evaluation Markdown is not canonical: section out of order "${label}"`);
    }
    if (!evaluationSectionBody(lines, headings, heading)) {
      throw new Error(`evaluation Markdown is not canonical: empty section "${label}"`);
    }
    previousLine = heading.line;
  }
}
