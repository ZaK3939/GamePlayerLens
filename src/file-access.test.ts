import {join, resolve} from "node:path";
import {describe, expect, it, vi} from "vitest";
import {withFileAccess} from "./file-access.js";

function deferred(): {promise: Promise<void>; resolve: () => void} {
  let resolvePromise: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {promise, resolve: resolvePromise!};
}

describe("file access coordination", () => {
  it("runs operations for the same normalized path in FIFO order", async () => {
    const firstMayFinish = deferred();
    const firstStarted = deferred();
    const order: string[] = [];
    const path = resolve("workspace", "artifact.json");

    const first = withFileAccess(path, async () => {
      order.push("first-start");
      firstStarted.resolve();
      await firstMayFinish.promise;
      order.push("first-finish");
    });
    await firstStarted.promise;
    const secondOperation = vi.fn(async () => {
      order.push("second");
    });
    const second = withFileAccess(join(path, "..", "artifact.json"), secondOperation);

    await Promise.resolve();
    expect(secondOperation).not.toHaveBeenCalled();
    firstMayFinish.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual(["first-start", "first-finish", "second"]);
  });

  it("does not serialize unrelated paths", async () => {
    const firstMayFinish = deferred();
    const firstStarted = deferred();
    const secondStarted = deferred();

    const first = withFileAccess("first.json", async () => {
      firstStarted.resolve();
      await firstMayFinish.promise;
    });
    await firstStarted.promise;
    const second = withFileAccess("second.json", async () => {
      secondStarted.resolve();
    });

    await secondStarted.promise;
    firstMayFinish.resolve();
    await Promise.all([first, second]);
  });

  it("releases the next operation when the current operation fails", async () => {
    const next = vi.fn(async () => "saved");

    await expect(withFileAccess("failed.json", async () => {
      throw new Error("read failed");
    })).rejects.toThrow("read failed");

    await expect(withFileAccess("failed.json", next)).resolves.toBe("saved");
    expect(next).toHaveBeenCalledOnce();
  });
});
