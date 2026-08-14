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
    });
    expect(ops.link).toHaveBeenCalledWith(temporary, DESTINATION);
    expect(ops.unlink).toHaveBeenCalledWith(temporary);
  });

  it("delegates an allowed overwrite to the resilient replacement boundary", async () => {
    const ops = fileOps();
    const replaceFile = vi.fn(async () => undefined);

    await writeTextFileAtomically(DESTINATION, "replacement", {
      fileOps: ops,
      alreadyExistsMessage: "item already exists",
      overwrite: true,
      idFactory: () => "fixed-id",
      replaceFile,
    });

    expect(replaceFile).toHaveBeenCalledWith(DESTINATION, "replacement");
    expect(ops.writeFile).not.toHaveBeenCalled();
    expect(ops.link).not.toHaveBeenCalled();
    expect(ops.unlink).not.toHaveBeenCalled();
  });

  it("surfaces replacement failures without touching create-only operations", async () => {
    const ops = fileOps();
    const replaceFile = vi.fn(async () => {
      throw nodeError("EPERM");
    });

    await expect(writeTextFileAtomically(DESTINATION, "replacement", {
      fileOps: ops,
      alreadyExistsMessage: "item already exists",
      overwrite: true,
      idFactory: () => "fixed-id",
      replaceFile,
    })).rejects.toThrow("EPERM");
    expect(ops.writeFile).not.toHaveBeenCalled();
    expect(ops.unlink).not.toHaveBeenCalled();
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

  it("repeatedly overwrites a real file without leaving temporary files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "game-player-lens-atomic-"));
    const destination = join(directory, "item.json");
    try {
      await writeFile(destination, "initial", "utf8");
      for (let iteration = 0; iteration < 100; iteration += 1) {
        await writeTextFileAtomically(destination, `payload-${iteration}`, {
          fileOps: {writeFile, link, unlink},
          alreadyExistsMessage: "item already exists",
          overwrite: true,
          idFactory: () => `iteration-${iteration}`,
        });
      }

      await expect(readFile(destination, "utf8")).resolves.toBe("payload-99");
      await expect(readdir(directory)).resolves.toEqual(["item.json"]);
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  });
});
