import {describe, expect, it} from "vitest";
import {
  normalizeReviewPages,
  sanitizeReviewText,
  type RawReview,
} from "./reviews.js";

function rawReview(
  recommendationid: string,
  overrides: Partial<RawReview> = {},
): RawReview {
  return {
    recommendationid,
    review: `review ${recommendationid}`,
    voted_up: true,
    language: "english",
    timestamp_created: 1_700_000_000,
    author: {playtime_forever: 90},
    ...overrides,
  };
}

describe("sanitizeReviewText", () => {
  it("removes control characters and runs of question marks", () => {
    expect(sanitizeReviewText(" good\u0000 game??? really???? yes\n"))
      .toBe("good game really yes");
  });
});

describe("normalizeReviewPages", () => {
  it("normalizes trace fields and playtime minutes to one-decimal hours", () => {
    const result = normalizeReviewPages([[rawReview("10", {
      review: "すばらしい",
      voted_up: false,
      language: "japanese",
      author: {playtime_forever: 95},
    })]], {type: "negative", limit: 1});

    expect(result).toEqual({
      data: [{
        recommendationId: "10",
        review: "すばらしい",
        votedUp: false,
        playtimeHours: 1.6,
        language: "japanese",
        timestamp: 1_700_000_000,
      }],
      warnings: [],
    });
  });

  it("applies playtime and polarity filters before limit across pages", () => {
    const result = normalizeReviewPages([
      [
        rawReview("low", {author: {playtime_forever: 30}}),
        rawReview("negative", {voted_up: false, author: {playtime_forever: 600}}),
      ],
      [
        rawReview("first", {author: {playtime_forever: 120}}),
        rawReview("second", {author: {playtime_forever: 180}}),
      ],
    ], {type: "positive", minPlaytimeHours: 2, limit: 2});

    expect(result.data?.map((review) => review.recommendationId))
      .toEqual(["first", "second"]);
    expect(result.warnings).toEqual([]);
  });

  it("deduplicates recommendation IDs", () => {
    const result = normalizeReviewPages([
      [rawReview("same")],
      [rawReview("same"), rawReview("other")],
    ], {limit: 2});

    expect(result.data?.map((review) => review.recommendationId))
      .toEqual(["same", "other"]);
  });

  it("drops reviews whose numeric fields are null, blank, or boolean", () => {
    const result = normalizeReviewPages([[
      rawReview("null-playtime", {author: {playtime_forever: null}}),
      rawReview("blank-playtime", {author: {playtime_forever: " "}}),
      rawReview("boolean-timestamp", {timestamp_created: false}),
    ]], {limit: 1});

    expect(result.data).toEqual([]);
    expect(result.warnings).toEqual([
      "steam reviews returned 0 of requested 1 after filters (scanned 3)",
    ]);
  });

  it("drops reviews with negative or fractional timestamps", () => {
    const result = normalizeReviewPages([[
      rawReview("negative-timestamp", {timestamp_created: -1}),
      rawReview("fractional-timestamp", {timestamp_created: 1.5}),
    ]], {limit: 1});

    expect(result.data).toEqual([]);
  });

  it("caps scanning at three pages and 300 raw reviews", () => {
    const pages = Array.from({length: 4}, (_, page) =>
      Array.from({length: 100}, (_, index) =>
        rawReview(`${page}-${index}`, {author: {playtime_forever: page === 3 ? 600 : 0}}),
      ),
    );

    const result = normalizeReviewPages(pages, {minPlaytimeHours: 1, limit: 1});
    expect(result.data).toEqual([]);
    expect(result.warnings).toEqual([
      "steam reviews returned 0 of requested 1 after filters (scanned 300)",
    ]);
  });

  it("warns with partial data when filters cannot satisfy the limit", () => {
    const result = normalizeReviewPages(
      [[rawReview("one", {voted_up: false}), rawReview("two")]],
      {type: "negative", limit: 2},
    );

    expect(result.data?.map((review) => review.recommendationId)).toEqual(["one"]);
    expect(result.warnings).toEqual([
      "steam reviews returned 1 of requested 2 after filters (scanned 2)",
    ]);
  });
});
