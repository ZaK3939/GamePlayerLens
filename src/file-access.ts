import {normalize, resolve} from "node:path";

export type FileAccessCoordinator = <T>(
  path: string,
  operation: () => Promise<T>,
) => Promise<T>;

const pathTails = new Map<string, Promise<void>>();

function accessKey(path: string): string {
  const absolute = normalize(resolve(path));
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

/**
 * Serializes reads and create-only publication for one path.
 *
 * This prevents a read from observing a path while the same process is
 * publishing it. Different paths remain independent so unrelated artifact
 * work can continue in parallel.
 */
export async function withFileAccess<T>(
  path: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = accessKey(path);
  const previous = pathTails.get(key) ?? Promise.resolve();
  let release: () => void;
  const turn = new Promise<void>((resolveTurn) => {
    release = resolveTurn;
  });
  const tail = previous.then(() => turn);
  pathTails.set(key, tail);

  await previous;
  try {
    return await operation();
  } finally {
    release!();
    if (pathTails.get(key) === tail) pathTails.delete(key);
  }
}
