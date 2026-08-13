import {z} from "zod";

export const RevisionIdSchema = z.string().trim().min(1).max(200).regex(
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/,
);

function safeIssuePath(
  path: readonly PropertyKey[],
  allowedFields: ReadonlySet<string>,
): string | undefined {
  let rendered = "";
  for (const segment of path) {
    if (typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0) {
      rendered += `[${segment}]`;
      continue;
    }
    if (typeof segment !== "string" || !allowedFields.has(segment)) return undefined;
    rendered += rendered === "" ? segment : `.${segment}`;
  }
  return rendered || undefined;
}

function safeSchemaIssueMessage(
  root: string,
  issue: {code: string; path: readonly PropertyKey[]},
  allowedFields: ReadonlySet<string>,
): string {
  const path = safeIssuePath(issue.path, allowedFields);
  const subject = path ? `${root}.${path}` : root;
  switch (issue.code) {
    case "unrecognized_keys": return `${subject} contains an unsupported field`;
    case "invalid_type": return `${subject} has the wrong type`;
    case "invalid_value": return `${subject} must use a supported value`;
    case "too_small": return `${subject} is below the allowed minimum`;
    case "too_big": return `${subject} exceeds the allowed maximum`;
    case "invalid_format": return `${subject} has an invalid format`;
    case "not_multiple_of": return `${subject} has an invalid numeric increment`;
    default: return `${subject} is invalid`;
  }
}

export function addSafeSchemaIssues(
  context: z.RefinementCtx,
  root: string,
  issues: readonly {code: string; path: readonly PropertyKey[]}[],
  allowedFields: ReadonlySet<string>,
): void {
  const messages = new Set(
    issues.map((issue) => safeSchemaIssueMessage(root, issue, allowedFields)),
  );
  for (const message of [...messages].slice(0, 8)) {
    context.addIssue({code: "custom", message});
  }
}
