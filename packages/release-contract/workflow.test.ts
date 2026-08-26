import { PLATFORMS } from "@harpyhare/platform";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  ASSET_SLUG,
  installerAssetName,
  RELEASE_PLATFORMS,
  RELEASES_REPO,
  REQUIRED_UPDATER_TARGETS,
  SIGNATURE_SUFFIX,
  UPDATER_MANIFEST_NAME,
  updaterAssetName,
} from "./contract.js";

/**
 * `.github/workflows/release.yml` used to be the fourth place the naming scheme
 * lived: it staged the artifacts under names typed into shell, and this test
 * compared those literals with the contract. Drift was caught, but the names
 * were still written twice.
 *
 * They are not any more — the workflow calls
 * `scripts/release-names.mjs` and reads the names out of `$GITHUB_ENV`. So this
 * file no longer checks literals (there are none left to check): it checks that
 * the reading step is still there, that no name has crept back into the YAML,
 * and that the helper prints exactly what `apps/desktop/scripts/release.mjs`
 * builds for the same version.
 */
const WORKFLOW_PATH = fileURLToPath(
  new URL("../../.github/workflows/release.yml", import.meta.url),
);
const HELPER_PATH = fileURLToPath(new URL("./scripts/release-names.mjs", import.meta.url));
const HELPER_IN_WORKFLOW = "packages/release-contract/scripts/release-names.mjs";

const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf8");
/** Prose is allowed to name `latest.json`; shell is not. */
const WORKFLOW_CODE = WORKFLOW.split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");

interface Step {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}
interface Job {
  env?: Record<string, string>;
  steps: Step[];
  strategy?: { matrix?: { include?: { runner: string; platform: string }[] } };
}
interface Workflow {
  env?: Record<string, string>;
  /** Named rather than indexed: the two jobs are the shape this test is about. */
  jobs: { bundle: Job; publish: Job };
}

const workflow = parse(WORKFLOW) as Workflow;
const jobs = Object.values(workflow.jobs);
const steps = jobs.flatMap((job) => job.steps);

const VERSION = "1.2.3";

/** Runs the helper the way the workflow runs it, and reads back its KEY=value lines. */
function helper(...args: string[]): Record<string, string> {
  const stdout = execFileSync(process.execPath, [HELPER_PATH, ...args], { encoding: "utf8" });
  return Object.fromEntries(
    stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
}

describe("release.yml reads the asset names instead of repeating them", () => {
  it("calls the contract helper in both jobs and exports what it prints", () => {
    const reading = steps.filter((step) => step.run?.includes(HELPER_IN_WORKFLOW));
    expect(reading).toHaveLength(jobs.length);
    for (const step of reading) expect(step.run).toContain('"$GITHUB_ENV"');
  });

  // The point of the rewrite: a name that is not in the YAML cannot drift from
  // the manifest. If one of these ever matches again, the fourth copy is back.
  it("carries no asset name, slug or repository of its own", () => {
    expect(WORKFLOW_CODE).not.toContain(ASSET_SLUG);
    expect(WORKFLOW_CODE).not.toContain(RELEASES_REPO);
    expect(WORKFLOW_CODE).not.toContain(UPDATER_MANIFEST_NAME);
  });

  it("builds exactly the platforms the updater manifest requires", () => {
    const matrix = workflow.jobs.bundle.strategy?.matrix?.include ?? [];
    expect(matrix.map((entry) => entry.platform).sort()).toEqual(
      [...REQUIRED_UPDATER_TARGETS].sort(),
    );
  });

  /**
   * A typo in `${INSTALER_NAME}` is an empty string under `set -u`… and `set -u`
   * only fires if the variable is read unquoted-but-undefined, which inside a
   * `cp` argument it is not. So the mis-spelling would stage a file under a
   * truncated name and the release would look fine until the updater 404s.
   */
  it("reads no shell variable nobody sets", () => {
    const provided = new Set([
      ...Object.keys(workflow.env ?? {}),
      ...jobs.flatMap((job) => Object.keys(job.env ?? {})),
      ...steps.flatMap((step) => Object.keys(step.env ?? {})),
      ...Object.keys(
        helper("--version", VERSION, "--target", RELEASE_PLATFORMS.macos.updaterTarget),
      ),
      // Provided by the runner itself.
      "GITHUB_ENV",
      "GITHUB_OUTPUT",
    ]);
    const read = new Set(
      (WORKFLOW.match(/\$\{?[A-Z][A-Z0-9_]*/g) ?? []).map((raw) => raw.replace(/^\$\{?/, "")),
    );
    expect([...read].filter((name) => !provided.has(name))).toEqual([]);
  });
});

describe("the helper prints what the release script builds", () => {
  it("prints the repository, the slug, the manifest and the required targets", () => {
    expect(helper("--version", VERSION)).toEqual({
      RELEASES_REPO,
      ASSET_SLUG,
      MANIFEST_NAME: UPDATER_MANIFEST_NAME,
      SIGNATURE_SUFFIX,
      REQUIRED_TARGETS: REQUIRED_UPDATER_TARGETS.join(","),
    });
  });

  // `release.mjs` renders the same two names through `installerAssetName` /
  // `updaterAssetName`, with the arch it derives from `process.arch` on the
  // host it runs on. On the two hosts the product ships from that arch is the
  // arch half of the updater target, which is what the helper uses — so this is
  // the byte-for-byte comparison between the workflow and the manual release.
  it.each(PLATFORMS)("names both %s assets", (platform) => {
    const entry = RELEASE_PLATFORMS[platform];
    const arch = entry.updaterTarget.slice(entry.updaterTarget.indexOf("-") + 1);
    const out = helper("--version", VERSION, "--target", entry.updaterTarget);
    expect(out).toMatchObject({
      PLATFORM_KEY: platform,
      ASSET_ARCH: arch,
      INSTALLER_SUFFIX: entry.installerSuffix,
      UPDATER_SUFFIX: entry.updaterArtifactSuffix,
      INSTALLER_NAME: installerAssetName(platform, VERSION, arch),
      UPDATER_NAME: updaterAssetName(platform, VERSION, arch),
    });
    expect(out["INSTALLER_NAME"]).toBe(`${ASSET_SLUG}_${VERSION}_${arch}${entry.installerSuffix}`);
  });

  it.each([
    ["an unknown platform", ["--version", VERSION, "--target", "linux-x86_64"]],
    ["a version that is not X.Y.Z", ["--version", "v1.2", "--target", "darwin-aarch64"]],
    ["no version at all", ["--target", "darwin-aarch64"]],
  ])("refuses %s", (_case, args) => {
    expect(() => helper(...args)).toThrow();
  });
});
