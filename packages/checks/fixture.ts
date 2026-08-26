import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const roots: string[] = [];

/** Writes a throwaway tree and returns its root; `cleanupFixtures` removes them all. */
export function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "harpyhare-checks-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

export function cleanupFixtures(): void {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}
