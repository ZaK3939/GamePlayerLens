import {join, resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {resolveDataRoot} from "./cli.js";

describe("packaged CLI data home", () => {
  it("uses an explicit absolute GAME_PLAYER_LENS_HOME", () => {
    const root = resolve("/tmp/game-player-lens-test-home");
    expect(resolveDataRoot({GAME_PLAYER_LENS_HOME: `  ${root}  `}, "/users/test"))
      .toBe(root);
  });

  it("defaults to a hidden directory in the user home", () => {
    expect(resolveDataRoot({}, "/users/test"))
      .toBe(join("/users/test", ".game-player-lens"));
  });

  it("rejects a relative GAME_PLAYER_LENS_HOME", () => {
    expect(() => resolveDataRoot({GAME_PLAYER_LENS_HOME: "relative/path"}, "/users/test"))
      .toThrow(/absolute/i);
  });
});
