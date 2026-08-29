import contract from "./release-assets.json" with { type: "json" };

/**
 * The half of the release contract a browser is allowed to have.
 *
 * `contract.js` is a build-time and server-time module: it RECOGNISES asset
 * names, and to do that it needs the whole `platforms` block plus the three
 * derived lists (`REQUIRED_UPDATER_TARGETS`, the installer suffixes,
 * `UPDATER_ONLY_SUFFIXES`). None of that is a browser's business — the landing
 * page resolves its download URLs on the server and hands the client finished
 * links — yet three Client Components import `lib/release.ts` for
 * `downloadHref` and `RELEASES_PAGE`, and `RELEASES_PAGE` is built from the
 * repository slug, which lives in the same module. So the slug dragged the
 * naming scheme into the client chunk with it: `darwin-aarch64`,
 * `windows-x86_64`, `.app.tar.gz`, `installerSuffix`, `updaterArtifactSuffix`
 * and three `Object.values(...)` statements whose results nothing reads.
 *
 * A second entry point is the fix, and it costs nothing structurally, because
 * `release-assets.json` stays the single source of truth: this file derives from
 * the same JSON, and `contract.js` re-exports these two constants rather than
 * declaring its own. Splitting the JSON would have been the other option, and it
 * would have destroyed the one property the package exists for.
 *
 * Keep this entry to constants a browser genuinely needs. Anything that reads
 * `contract.platforms` belongs in `contract.js`, or the residue comes back.
 */
export const RELEASES_REPO = contract.releasesRepo;
export const RELEASES_REPO_URL = `https://github.com/${RELEASES_REPO}`;
