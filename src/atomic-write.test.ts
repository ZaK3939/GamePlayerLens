import {
  link,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {basename, dirname, join} from "node:path";
import {describe, expect, it, vi} from "vitest";
import {
  AtomicPublishCleanupError,
  writeTextFileAtomically,
} from "./atomic-write.js";

const DESTINATION = join("workspace", "data", "item.json");
const TEMPORARY = join(dirname(DESTINATION), ".item.json.fixed-id.tmp");

function nodeError(code: string): Error & {code: string} {
  return Object.assign(new Error(code), {code});
}

function fileOps() {
  return {
    writeFile: vi.fn(async () => undefined),
    link: vi.fn(async () => undefined),
    unlink: vi.fn(async () => undefined),
  };
}

describe("atomic text writes", () => {
  it("publishes a new file through a same-directory hard link and cleans the temporary", async () => {
    const ops = fileOps();

    await writeTextFileAtomically(DESTINATION, "payload", {
      fileOps: ops,
      alreadyExistsMessage: "item already exists",
      idFactory: () => "fixed-id",
    });

    const temporary = ops.writeFile.mock.calls[0]?.[0];
    expect(dirname(temporary ?? "")).toBe(dirname(DESTINATION));
    expect(basename(temporary ?? "")).toBe(".item.json.fixed-id.tmp");
    expect(ops.writeFile).toHaveBeenCalledWith(temporary, "payload", {
      encoding: "utf8",
      flag: "wx",
      flush: true,
    });
    expect(ops.link).toHaveBeenCalledWith(temporary, DESTINATION);
    expect(ops.unlink).toHaveBeenCalledWith(temporary);
  });

  it("maps destination collisions to the caller's domain message", async () => {
    const ops = fileOps();
    ops.link.mockRejectedValueOnce(nodeError("EEXIST"));

    await expect(writeTextFileAtomically(DESTINATION, "payload", {
      fileOps: ops,
      alreadyExistsMessage: "persona already exists: player-one",
      idFactory: () => "fixed-id",
    })).rejects.toThrow("persona already exists: player-one");
    expect(ops.unlink).toHaveBeenCalledWith(TEMPORARY);
  });

  it("retries transient Windows publication locks without replacing a destination", async () => {
    const ops = fileOps();
    ops.link
      .mockRejectedValueOnce(nodeError("EPERM"))
      .mockRejectedValueOnce(nodeError("EBUSY"));

    await expect(writeTextFileAtomically(DESTINATION, "payload", {
      fileOps: ops,
      alreadyExistsMessage: "item already exists",
      idFactory: () => "fixed-id",
    })).resolves.toBeUndefined();
    expect(ops.link).toHaveBeenCalledTimes(3);
    expect(ops.link).toHaveBeenLastCalledWith(TEMPORARY, DESTINATION);
  });

  it("does not retry a destination collision", async () => {
    const ops = fileOps();
    ops.link.mockRejectedValue(nodeError("EEXIST"));

    await expect(writeTextFileAtomically(DESTINATION, "payload", {
      fileOps: ops,
      alreadyExistsMessage: "item already exists",
      idFactory: () => "fixed-id",
    })).rejects.toThrow("item already exists");
    expect(ops.link).toHaveBeenCalledTimes(1);
  });

  it("does not replace the primary failure with a cleanup failure", async () => {
    const ops = fileOps();
    ops.writeFile.mockRejectedValueOnce(new Error("write failed"));
    ops.unlink.mockRejectedValueOnce(new Error("cleanup failed"));

    await expect(writeTextFileAtomically(DESTINATION, "payload", {
      fileOps: ops,
      alreadyExistsMessage: "item already exists",
      idFactory: () => "fixed-id",
    })).rejects.toThrow("write failed");
  });

  it("does not unlink a temporary path it failed to create", async () => {
    const ops = fileOps();
    ops.writeFile.mockRejectedValueOnce(nodeError("EEXIST"));

    await expect(writeTextFileAtomically(DESTINATION, "payload", {
      fileOps: ops,
      alreadyExistsMessage: "item already exists",
      idFactory: () => "colliding-id",
    })).rejects.toThrow("EEXIST");
    expect(ops.unlink).not.toHaveBeenCalled();
  });

  it("retries transient Windows cleanup locks after a successful publish", async () => {
    const ops = fileOps();
    ops.unlink
      .mockRejectedValueOnce(nodeError("EPERM"))
      .mockRejectedValueOnce(nodeError("EBUSY"));

    await expect(writeTextFileAtomically(DESTINATION, "payload", {
      fileOps: ops,
      alreadyExistsMessage: "item already exists",
      idFactory: () => "fixed-id",
    })).resolves.toBeUndefined();
    expect(ops.unlink).toHaveBeenCalledTimes(3);
  });

  it("marks an unrecoverable post-publish cleanup failure as committed", async () => {
    const ops = fileOps();
    ops.unlink.mockRejectedValue(nodeError("EPERM"));

    const failure = writeTextFileAtomically(DESTINATION, "payload", {
      fileOps: ops,
      alreadyExistsMessage: "item already exists",
      idFactory: () => "fixed-id",
      cleanupRetryTimeoutMs: 0,
    });
    await expect(failure).rejects.toBeInstanceOf(AtomicPublishCleanupError);
    await expect(failure).rejects.toMatchObject({committed: true});
    await expect(failure).rejects.toThrow(/file was saved.*read the saved record/i);
  });

  it("accepts an already-removed temporary after a successful publish", async () => {
    const ops = fileOps();
    ops.unlink.mockRejectedValueOnce(nodeError("ENOENT"));

    await expect(writeTextFileAtomically(DESTINATION, "payload", {
      fileOps: ops,
      alreadyExistsMessage: "item already exists",
      idFactory: () => "fixed-id",
    })).resolves.toBeUndefined();
  });

  it("publishes many immutable files without rename or temporary-file residue", async () => {
    const directory = await mkdtemp(join(tmpdir(), "game-player-lens-atomic-"));
    try {
      for (let iteration = 0; iteration < 100; iteration += 1) {
        const destination = join(directory, `item-${iteration}.json`);
        await writeTextFileAtomically(destination, `payload-${iteration}`, {
          fileOps: {writeFile, link, unlink},
          alreadyExistsMessage: "item already exists",
          idFactory: () => `iteration-${iteration}`,
        });
        await expect(readFile(destination, "utf8")).resolves.toBe(`payload-${iteration}`);
      }

      expect((await readdir(directory)).filter((entry) => entry.endsWith(".tmp")))
        .toEqual([]);
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  }, 30_000);

  it("creates Unicode evidence once and rejects replacement", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ゲーム証拠-é-"));
    const destination = join(directory, "プレイ結果-é.json");
    try {
      await writeTextFileAtomically(destination, "initial", {
        fileOps: {writeFile, link, unlink},
        alreadyExistsMessage: "evidence already exists",
        idFactory: () => "create",
      });
      await expect(writeTextFileAtomically(destination, "updated", {
        fileOps: {writeFile, link, unlink},
        alreadyExistsMessage: "evidence already exists",
      })).rejects.toThrow("evidence already exists");

      await expect(readFile(destination, "utf8")).resolves.toBe("initial");
      expect((await readdir(directory)).filter((entry) => entry.endsWith(".tmp")))
        .toEqual([]);
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  });
});
