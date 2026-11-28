/**
 * Console warnings `MeshTxBuilder` writes once per process, whatever number of builders and
 * builds: a value set in a loop must not flood the console.
 */

const written = new Set<string>();

/** Writes a warning, unless one with this key was written before in this process */
export const warnOnce = (key: string, message: string) => {
  if (written.has(key)) return;
  written.add(key);
  console.warn(message);
};

/** Forgets the warnings written, so that the next of each is written again; for tests */
export const resetWarnings = () => {
  written.clear();
};
