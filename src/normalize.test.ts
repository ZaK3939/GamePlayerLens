import {describe, expect, it} from "vitest";
import {strictFiniteNumber} from "./normalize.js";

describe("strictFiniteNumber", () => {
  it("accepts finite numbers and non-blank numeric strings", () => {
    expect(strictFiniteNumber(12.5)).toBe(12.5);
    expect(strictFiniteNumber(" 42 ")).toBe(42);
  });

  it.each([
    null,
    undefined,
    true,
    false,
    "",
    "   ",
    "0x10",
    "1_000",
    {},
    [],
    Number.NaN,
    Infinity,
  ])(
    "rejects coercion-prone or non-finite input: %j",
    (value) => expect(strictFiniteNumber(value)).toBeNull(),
  );
});
