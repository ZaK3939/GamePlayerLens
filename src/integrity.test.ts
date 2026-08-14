import {describe, expect, it} from "vitest";
import {canonicalJson, canonicalSha256, sha256} from "./integrity.js";

describe("integrity utilities", () => {
  it("computes SHA-256 for text and bytes", () => {
    const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(sha256("abc")).toBe(expected);
    expect(sha256(Buffer.from("abc"))).toBe(expected);
  });

  it("canonicalizes object keys recursively while preserving array order", () => {
    expect(canonicalJson({z: 1, a: {d: 4, b: 2}, list: [3, 1]})).toBe(
      '{"a":{"b":2,"d":4},"list":[3,1],"z":1}',
    );
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it("omits undefined object properties but rejects non-JSON values elsewhere", () => {
    expect(canonicalJson({kept: true, omitted: undefined})).toBe('{"kept":true}');
    expect(() => canonicalJson(undefined)).toThrow("not JSON serializable");
    expect(() => canonicalJson([undefined])).toThrow("not JSON serializable");
  });

  it("produces the same canonical hash for equivalent key order", () => {
    expect(canonicalSha256({b: 2, a: 1})).toBe(
      canonicalSha256({a: 1, b: 2}),
    );
  });
});
