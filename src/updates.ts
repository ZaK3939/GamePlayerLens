import {z} from "zod";
import type {FetchMeta, FetchResult, JsonValue} from "./http.js";
import {fetchJson} from "./http.js";

const STEAM_NEWS_API = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/";
const OFFICIAL_FEED = "steam_community_announcements";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_CONTENT_CHARS = 1_200;
const MIN_CONTENT_CHARS = 100;
const MAX_CONTENT_CHARS = 4_000;
const IsoDateTimeSchema = z.iso.datetime({offset: true});

export type SteamUpdateScope = "updates" | "official" | "all";
export type SteamPlatformHint =
  | "steam"
  | "steam-deck"
  | "windows"
  | "macos"
  | "linux"
  | "nintendo-switch"
  | "playstation"
  | "xbox"
  | "mobile"
  | "ios"
  | "android";
export type SteamUpdateType =
  | "major"
  | "content"
  | "balance"
  | "fixes"
  | "event"
  | "demo"
  | "localization"
  | "sale"
  | "community"
  | "general";

export interface SteamUpdateOptions {
  scope?: SteamUpdateScope;
  limit?: number;
  contentChars?: number;
  before?: string;
}

export interface NormalizedSteamUpdateOptions {
  scope: SteamUpdateScope;
  limit: number;
  contentChars: number;
}

export interface SteamUpdateItem {
  gid: string;
  title: string;
  url: string;
  author: string;
  publishedAt: string;
  feedLabel: string;
  official: boolean;
  tags: string[];
  type: SteamUpdateType;
  typeConfidence: number;
  isUpdateLike: boolean;
  updateEvidence: "steam-tag" | "title-inference" | "none";
  updateConfidence: number;
  platformHints: SteamPlatformHint[];
  classificationBasis: string[];
  summary: string;
  highlights: string[];
  detailsPreview: string;
  content: string;
}

export interface SteamUpdateHistory {
  appid: number;
  items: SteamUpdateItem[];
  summary: {
    apiReportedTotal: number | null;
    fetchedCount: number;
    returnedCount: number;
    officialCount: number;
    externalCount: number;
    fetchedTaggedPatchNotesCount: number;
    taggedPatchNotesCount: number;
    titleInferredUpdateCount: number;
    latestPublishedAt: string | null;
    earliestPublishedAt: string | null;
    medianIntervalDays: number | null;
    typeCounts: Partial<Record<SteamUpdateType, number>>;
  };
  referenceLinks: {
    steamCommunityNews: string;
    steamSonar: string;
  };
}

export interface UpdatesFetcherDependencies {
  fetcher?: (
    url: string | URL,
    options?: {timeoutMs?: number; source?: string},
  ) => Promise<FetchResult<unknown>>;
  now?: () => Date;
}

interface RawNewsItem {
  gid?: unknown;
  title?: unknown;
  url?: unknown;
  author?: unknown;
  contents?: unknown;
  feedlabel?: unknown;
  feedname?: unknown;
  date?: unknown;
  feed_type?: unknown;
  tags?: unknown;
}

interface RawNewsResponse {
  appnews?: {
    appid?: unknown;
    count?: unknown;
    newsitems?: unknown;
  };
}

interface TypeRule {
  type: SteamUpdateType;
  keywords: string[];
}

const TYPE_RULES: TypeRule[] = [
  {
    type: "major",
    keywords: [
      "major update",
      "big update",
      "huge update",
      "milestone update",
      "expansion",
      "new chapter",
      "new season",
      "launch update",
      "version 1.0",
      "v1.0 launch",
    ],
  },
  {
    type: "content",
    keywords: [
      "new content",
      "new map",
      "new mode",
      "new character",
      "new boss",
      "new mission",
      "new quest",
      "new weapon",
      "new feature",
      "content update",
      "cross-save",
      "cross save",
    ],
  },
  {
    type: "balance",
    keywords: [
      "balance patch",
      "balance update",
      "balance",
      "rework",
      "buff",
      "nerf",
      "tuning",
      "adjustment",
    ],
  },
  {
    type: "fixes",
    keywords: [
      "hotfix",
      "bug fix",
      "bugfix",
      "crash fix",
      "stability fix",
      "performance fix",
    ],
  },
  {
    type: "localization",
    keywords: [
      "localization",
      "language support",
      "translation",
      "voiceover",
      "voice over",
      "subtitle",
    ],
  },
  {type: "demo", keywords: ["demo", "playtest", "prologue", "trial"]},
  {
    type: "event",
    keywords: ["event", "festival", "anniversary", "celebration", "crossover", "collab"],
  },
  {
    type: "sale",
    keywords: ["sale", "discount", "free weekend", "special offer", "launch discount"],
  },
];

const UPDATE_TITLE_KEYWORDS = [
  "update",
  "patch",
  "hotfix",
  "bugfix",
  "changelog",
] as const;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)
    ? value
    : null;
}

function integerValue(value: unknown): number | null {
  const direct = finiteInteger(value);
  if (direct !== null) return direct;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#10;|&#13;/gi, "\n");
}

function markupLines(input: string): string[] {
  return decodeEntities(input)
    .replace(/\[(?:h[1-6]|list|olist|table|tr|p)\]/gi, "\n")
    .replace(/\[\/(?:h[1-6]|list|olist|table|tr|p)\]/gi, "\n")
    .replace(/\[\*\]|\[td\]/gi, "\n- ")
    .replace(/\[\/td\]/gi, "\n")
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, " ")
    .replace(/\[url=[^\]]+\]/gi, "")
    .replace(/\[url\][\s\S]*?\[\/url\]/gi, " ")
    .replace(/\[\/?(?:b|i|u|strike|code|quote|spoiler)[^\]]*\]/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line
      .replace(/\s+/g, " ")
      .replace(/^[-*•]+\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/https?:\/\/\S+/gi, "")
      .trim())
    .filter(Boolean);
}

function plainText(input: string, limit: number): {content: string; lines: string[]} {
  const lines = markupLines(input);
  return {content: lines.join(" ").slice(0, limit).trim(), lines};
}

function highlights(lines: string[], title: string): string[] {
  const titleLower = title.toLowerCase();
  return lines
    .filter((line) => line.length >= 18 && line.length <= 180)
    .filter((line) => line.toLowerCase() !== titleLower)
    .filter((line) => !/^(hello|hi|dear|thanks|thank you|read more|full notes|patch notes)$/i.test(line))
    .sort((left, right) => {
      const score = (value: string) => /^(new|added|fixed|improved|adjusted|balanced|support)\b/i
        .test(value) ? 1 : 0;
      return score(right) - score(left);
    })
    .filter((line, index, values) =>
      values.findIndex((candidate) => candidate.toLowerCase() === line.toLowerCase()) === index)
    .slice(0, 4);
}

function tags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(stringValue).filter(Boolean))];
}

function titleKeywordBasis(title: string): string[] {
  const normalized = title.toLowerCase();
  return UPDATE_TITLE_KEYWORDS
    .filter((keyword) => normalized.includes(keyword))
    .map((keyword) => `title-keyword:${keyword}`);
}

function namedUpdateTitle(title: string): boolean {
  const normalized = title.trim();
  return /^update\s+\d+\b/i.test(normalized)
    || /\b(?:the|our)\s+[^.!?]{1,70}\bupdate(?:\s+patch notes)?[!?.]*$/i.test(normalized)
    || /:\s*[^.!?]{1,70}\bupdate[!?.]*$/i.test(normalized);
}

function platformHints(title: string): SteamPlatformHint[] {
  const normalized = title.toLowerCase();
  const hints: SteamPlatformHint[] = [];
  const hasSteamDeck = /\bsteam deck\b/.test(normalized);
  if (/\bnintendo switch\b|\bswitch version\b/.test(normalized)) hints.push("nintendo-switch");
  if (/\bplaystation\b|\bps[45]\b/.test(normalized)) hints.push("playstation");
  if (/\bxbox\b/.test(normalized)) hints.push("xbox");
  if (/\bmobile\b/.test(normalized)) hints.push("mobile");
  if (/\bios\b/.test(normalized)) hints.push("ios");
  if (/\bandroid\b/.test(normalized)) hints.push("android");
  if (/\bwindows\b/.test(normalized)) hints.push("windows");
  if (/\bmac(?:os| os)?\b/.test(normalized)) hints.push("macos");
  if (/\blinux\b/.test(normalized)) hints.push("linux");
  if (hasSteamDeck) hints.push("steam-deck");
  if (!hasSteamDeck && /\bsteam\b/.test(normalized)) hints.push("steam");
  return hints;
}

function classify(
  title: string,
  content: string,
  itemTags: string[],
  official: boolean,
): Pick<
  SteamUpdateItem,
  | "type"
  | "typeConfidence"
  | "isUpdateLike"
  | "updateEvidence"
  | "updateConfidence"
  | "platformHints"
  | "classificationBasis"
> {
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  const taggedPatch = itemTags.some((tag) => tag.toLowerCase() === "patchnotes");
  const titleBasis = titleKeywordBasis(title);
  const classificationBasis = [
    ...(taggedPatch ? ["steam-tag:patchnotes"] : []),
    ...titleBasis,
  ];
  const isUpdateLike = taggedPatch || titleBasis.length > 0;
  const updateEvidence = taggedPatch
    ? "steam-tag"
    : titleBasis.length > 0
      ? "title-inference"
      : "none";
  const updateConfidence = taggedPatch ? 1 : titleBasis.length > 0 ? 0.75 : 0;

  let type: SteamUpdateType = official ? "community" : "general";
  let typeConfidence = official ? 0.25 : 0;
  let titleTypeMatched = false;
  for (const rule of TYPE_RULES) {
    const titleMatch = rule.keywords.find((keyword) => titleLower.includes(keyword));
    if (titleMatch) {
      type = rule.type;
      typeConfidence = 0.9;
      titleTypeMatched = true;
      if (!classificationBasis.includes(`title-keyword:${titleMatch}`)) {
        classificationBasis.push(`title-keyword:${titleMatch}`);
      }
      break;
    }
  }

  if (!titleTypeMatched && isUpdateLike) {
    // A body-only mention never proves that an announcement is an update. Once
    // the tag/title establishes that it is update-like, body text may only
    // refine its subtype. "major" is deliberately title-only because it is a
    // high-impact claim and launch boilerplate commonly appears in later fixes.
    const bodySubtypeTypes = new Set<SteamUpdateType>([
      "content",
      "balance",
      "fixes",
      "localization",
    ]);
    const contentRules = TYPE_RULES.filter((rule) => bodySubtypeTypes.has(rule.type));
    const contentRule = contentRules.find((rule) =>
      rule.keywords.some((keyword) => contentLower.includes(keyword)));
    const contentMatch = contentRule?.keywords.find((keyword) => contentLower.includes(keyword));
    if (contentRule && contentMatch) {
      type = contentRule.type;
      typeConfidence = contentRule.type === "fixes" && titleBasis.some((basis) =>
        basis === "title-keyword:patch"
        || basis === "title-keyword:hotfix"
        || basis === "title-keyword:bugfix") ? 0.8 : 0.65;
      classificationBasis.push(`content-keyword:${contentMatch}`);
    } else if (namedUpdateTitle(title)) {
      type = "content";
      typeConfidence = 0.6;
      classificationBasis.push("title-pattern:named-update");
    } else if (titleBasis.includes("title-keyword:hotfix")
      || titleBasis.includes("title-keyword:bugfix")) {
      type = "fixes";
      typeConfidence = 0.95;
    } else if (titleBasis.includes("title-keyword:patch")
      || titleBasis.includes("title-keyword:changelog")
      || taggedPatch) {
      type = "fixes";
      typeConfidence = titleBasis.includes("title-keyword:patch") ? 0.8 : 0.6;
    } else {
      type = "general";
      typeConfidence = 0.4;
    }
  }

  return {
    type,
    typeConfidence,
    isUpdateLike,
    updateEvidence,
    updateConfidence,
    platformHints: platformHints(title),
    classificationBasis,
  };
}

function officialItem(item: RawNewsItem): boolean {
  const feedType = finiteInteger(item.feed_type);
  const feedName = stringValue(item.feedname).toLowerCase();
  return feedType === 1
    || feedName === "steam_community_announcements"
    || feedName === "steam_announcements";
}

function normalizeItem(
  item: RawNewsItem,
  contentChars: number,
): SteamUpdateItem | null {
  const gid = stringValue(item.gid);
  const title = stringValue(item.title);
  const url = stringValue(item.url);
  const date = finiteInteger(item.date);
  if (!gid || !title || !url || date === null || date <= 0) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  const publishedAt = new Date(date * 1_000);
  if (Number.isNaN(publishedAt.getTime())) return null;

  const official = officialItem(item);
  const itemTags = tags(item.tags);
  const normalized = plainText(stringValue(item.contents), contentChars);
  const selectedHighlights = highlights(normalized.lines, title);
  const classification = classify(title, normalized.content, itemTags, official);
  return {
    gid,
    title,
    url,
    author: stringValue(item.author) || "Steam",
    publishedAt: publishedAt.toISOString(),
    feedLabel: stringValue(item.feedlabel) || "Steam",
    official,
    tags: itemTags,
    ...classification,
    summary: selectedHighlights[0] || normalized.content.split(/(?<=[.!?])\s+/)[0] || title,
    highlights: selectedHighlights,
    detailsPreview: normalized.content.slice(0, 320),
    content: normalized.content,
  };
}

function medianIntervalDays(items: SteamUpdateItem[]): number | null {
  if (items.length < 2) return null;
  const dates = items.map((item) => Date.parse(item.publishedAt)).sort((a, b) => b - a);
  const gaps = dates.slice(0, -1).map((date, index) =>
    Math.round(((date - dates[index + 1]!) / 86_400_000) * 10) / 10)
    .sort((a, b) => a - b);
  const middle = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 1
    ? gaps[middle]!
    : Math.round((((gaps[middle - 1] ?? 0) + (gaps[middle] ?? 0)) / 2) * 10) / 10;
}

function apiCount(value: unknown): number | null {
  const count = finiteInteger(value);
  return count !== null && count >= 0 ? count : null;
}

export function normalizeSteamUpdates(
  appid: number,
  raw: unknown,
  options: NormalizedSteamUpdateOptions,
): FetchResult<SteamUpdateHistory> {
  const response = raw as RawNewsResponse;
  if (!response?.appnews || !Array.isArray(response.appnews.newsitems)) {
    return {data: null, warnings: ["steam news returned an invalid response"]};
  }
  const responseAppid = integerValue(response.appnews.appid);
  if (responseAppid === null || responseAppid <= 0) {
    return {
      data: null,
      warnings: ["steam news response did not include a valid appid"],
    };
  }
  if (responseAppid !== appid) {
    return {
      data: null,
      warnings: [`steam news response appid ${responseAppid} did not match requested appid ${appid}`],
    };
  }

  const invalid: number[] = [];
  let duplicates = 0;
  const seen = new Set<string>();
  const normalized = response.appnews.newsitems.flatMap((value, index) => {
    if (!value || typeof value !== "object") {
      invalid.push(index);
      return [];
    }
    const item = normalizeItem(value as RawNewsItem, options.contentChars);
    if (!item) {
      invalid.push(index);
      return [];
    }
    if (seen.has(item.gid)) {
      duplicates += 1;
      return [];
    }
    seen.add(item.gid);
    return [item];
  });

  const officialCount = normalized.filter((item) => item.official).length;
  const fetchedTaggedPatchNotesCount = normalized.filter((item) =>
    item.tags.some((tag) => tag.toLowerCase() === "patchnotes")).length;
  const selected = normalized
    .filter((item) => options.scope === "all" || item.official)
    .filter((item) => options.scope !== "updates" || item.isUpdateLike)
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, options.limit);
  const warnings: string[] = [];
  if (invalid.length > 0) warnings.push(`steam news skipped ${invalid.length} invalid item(s)`);
  if (duplicates > 0) warnings.push(`steam news skipped ${duplicates} duplicate item(s)`);
  if (options.scope === "updates" && selected.length < options.limit) {
    warnings.push(
      `steam updates returned ${selected.length} of requested ${options.limit} high-precision update item(s)`,
    );
  }
  const typeCounts: Partial<Record<SteamUpdateType, number>> = {};
  for (const item of selected) typeCounts[item.type] = (typeCounts[item.type] ?? 0) + 1;

  return {
    data: {
      appid,
      items: selected,
      summary: {
        apiReportedTotal: apiCount(response.appnews.count),
        fetchedCount: normalized.length,
        returnedCount: selected.length,
        officialCount,
        externalCount: normalized.length - officialCount,
        fetchedTaggedPatchNotesCount,
        taggedPatchNotesCount: selected.filter((item) =>
          item.tags.some((tag) => tag.toLowerCase() === "patchnotes")).length,
        titleInferredUpdateCount: selected.filter((item) =>
          !item.tags.some((tag) => tag.toLowerCase() === "patchnotes")
          && item.classificationBasis.some((basis) => basis.startsWith("title-keyword:"))).length,
        latestPublishedAt: selected[0]?.publishedAt ?? null,
        earliestPublishedAt: selected.at(-1)?.publishedAt ?? null,
        medianIntervalDays: medianIntervalDays(selected),
        typeCounts,
      },
      referenceLinks: {
        steamCommunityNews: `https://store.steampowered.com/news/app/${appid}`,
        steamSonar: `https://www.steamsonar.gg/game/${appid}`,
      },
    },
    warnings,
  };
}

function requireOptions(appid: number, options: SteamUpdateOptions): Required<
  Pick<SteamUpdateOptions, "scope" | "limit" | "contentChars">
> & Pick<SteamUpdateOptions, "before"> {
  if (!Number.isInteger(appid) || appid <= 0) throw new TypeError("appid must be a positive integer");
  const scope = options.scope ?? "updates";
  if (!(["updates", "official", "all"] as string[]).includes(scope)) {
    throw new TypeError("scope must be updates, official, or all");
  }
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new TypeError(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  }
  const contentChars = options.contentChars ?? DEFAULT_CONTENT_CHARS;
  if (
    !Number.isInteger(contentChars)
    || contentChars < MIN_CONTENT_CHARS
    || contentChars > MAX_CONTENT_CHARS
  ) {
    throw new TypeError(
      `contentChars must be an integer from ${MIN_CONTENT_CHARS} to ${MAX_CONTENT_CHARS}`,
    );
  }
  if (options.before !== undefined) {
    if (!IsoDateTimeSchema.safeParse(options.before).success) {
      throw new TypeError("before must be an ISO date-time with an offset");
    }
  }
  return {scope, limit, contentChars, before: options.before};
}

function fetchCount(scope: SteamUpdateScope, limit: number): number {
  return scope === "updates" ? Math.min(MAX_LIMIT, Math.max(limit * 4, limit)) : limit;
}

function meta(
  observedAt: string,
  appid: number,
  options: ReturnType<typeof requireOptions>,
): FetchMeta {
  return {
    observedAt,
    sources: [{
      name: "Steam News",
      homepage: "https://partner.steamgames.com/doc/webapi/ISteamNews",
      notes: "Public ISteamNews/GetNewsForApp v2; official-feed filtering does not prove product impact.",
    }],
    request: {
      appid,
      scope: options.scope,
      limit: options.limit,
      contentChars: options.contentChars,
      ...(options.before ? {before: options.before} : {}),
    } satisfies JsonValue,
    methodology: {
      officialFeed: OFFICIAL_FEED,
      updateSelection: "Steam patchnotes tag or bounded title-keyword inference; body text never selects an update",
      taxonomy: "SteamSonar-compatible major/content/balance/fixes/event/demo/localization/sale/community/general",
      classificationIsHeuristic: true,
      cadenceIsDescriptive: true,
      causalClaims: false,
    },
  };
}

export function createUpdatesFetcher(
  dependencies: UpdatesFetcherDependencies = {},
): (appid: number, options?: SteamUpdateOptions) => Promise<FetchResult<SteamUpdateHistory>> {
  const fetcher = dependencies.fetcher
    ?? ((url, options) => fetchJson<unknown>(url, options));
  const now = dependencies.now ?? (() => new Date());
  return async (appid, input = {}) => {
    const options = requireOptions(appid, input);
    const observed = now();
    if (Number.isNaN(observed.getTime())) throw new TypeError("now must be valid");
    const resultMeta = meta(observed.toISOString(), appid, options);
    const url = new URL(STEAM_NEWS_API);
    url.searchParams.set("appid", String(appid));
    url.searchParams.set("count", String(fetchCount(options.scope, options.limit)));
    url.searchParams.set("maxlength", String(options.contentChars));
    url.searchParams.set("format", "json");
    if (options.scope !== "all") url.searchParams.set("feeds", OFFICIAL_FEED);
    if (options.before) {
      url.searchParams.set("enddate", String(Math.floor(Date.parse(options.before) / 1_000)));
    }

    const fetched = await fetcher(url, {source: "steam news"});
    if (!fetched.data) return {data: null, warnings: fetched.warnings, meta: resultMeta};
    const normalized = normalizeSteamUpdates(appid, fetched.data, options);
    return {
      data: normalized.data,
      warnings: [...fetched.warnings, ...normalized.warnings],
      meta: resultMeta,
    };
  };
}

export const fetchUpdates = createUpdatesFetcher();
