#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_NAME = "Audio System";
const ASSET_SLUG = "AudioSystem";
const RELEASES_REPO = "screenfriskofficial/harpyhare-releases";
const RELEASES_REPO_URL = `https://github.com/${RELEASES_REPO}`;
const ARCH = "aarch64";
const PLATFORM = `darwin-${ARCH}`;

const PKG_PATH = join(ROOT, "package.json");
const TAURI_CONF_PATH = join(ROOT, "src-tauri/tauri.conf.json");
const CARGO_TOML_PATH = join(ROOT, "src-tauri/Cargo.toml");
const BUNDLE_DIR = join(ROOT, "src-tauri/target/release/bundle");
const RELEASE_ASSETS_DIR = join(BUNDLE_DIR, "release-assets");
const LATEST_MANIFEST_NAME = "latest.json";

const DEFAULT_SIGNING_KEY_PATH = join(homedir(), ".tauri/itech.key");
const keyPath = process.env.ITECH_SIGNING_KEY ?? DEFAULT_SIGNING_KEY_PATH;

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const VERSION_PARTS = 3;
const JSON_INDENT = 2;
const ANSI_RED = "\x1b[31m";
const ANSI_RESET = "\x1b[0m";

const die = (msg) => {
  console.error(`${ANSI_RED}ошибка:${ANSI_RESET} ${msg}`);
  process.exit(1);
};
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
const capture = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" }).trim();
const writeJson = (path, data) =>
  writeFileSync(path, JSON.stringify(data, null, JSON_INDENT) + "\n");

const tauriBundleBase = (version) => `${PRODUCT_NAME}_${version}_${ARCH}`;
const uploadedAssetBase = (version) => `${ASSET_SLUG}_${version}_${ARCH}`;

const parseCliArgs = (argv) => {
  const version = argv[0];
  const notesIdx = argv.indexOf("--notes");
  const notes = notesIdx !== -1 ? (argv[notesIdx + 1] ?? "") : "";
  if (!version || !VERSION_RE.test(version)) {
    die('укажи версию: npm run release -- 0.2.0 [--notes "Что нового"]');
  }
  return { version, notes };
};

const readVersionedConfigs = () => {
  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
  const conf = JSON.parse(readFileSync(TAURI_CONF_PATH, "utf8"));
  return { pkg, conf };
};

const assertVersionsInSync = (pkg, conf) => {
  const current = pkg.version;
  if (
    conf.version !== current ||
    !readFileSync(CARGO_TOML_PATH, "utf8").includes(`version = "${current}"`)
  ) {
    die(`версии рассинхронизированы: package.json=${current}, tauri.conf.json=${conf.version}`);
  }
  return current;
};

const isNewerVersion = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < VERSION_PARTS; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

const releaseExists = (version) => {
  try {
    execFileSync("gh", ["release", "view", `v${version}`, "--repo", RELEASES_REPO], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

const assertReadyToRelease = (version, current) => {
  if (!isNewerVersion(version, current)) die(`версия ${version} не новее текущей ${current}`);
  if (capture("git", ["status", "--porcelain"]) !== "") {
    die("git-дерево не чистое — закоммить или отложи изменения");
  }
  if (!existsSync(keyPath)) die(`нет ключа подписи ${keyPath} (см. README, раздел «Релиз»)`);
  run("gh", ["auth", "status"], { stdio: "ignore" });
  if (releaseExists(version)) die(`релиз v${version} уже существует в ${RELEASES_REPO}`);
};

const bumpVersions = (pkg, conf, current, version) => {
  pkg.version = version;
  writeJson(PKG_PATH, pkg);
  conf.version = version;
  writeJson(TAURI_CONF_PATH, conf);
  writeFileSync(
    CARGO_TOML_PATH,
    readFileSync(CARGO_TOML_PATH, "utf8").replace(
      `version = "${current}"`,
      `version = "${version}"`,
    ),
  );
  run("npm", ["install", "--package-lock-only", "--ignore-scripts"]);
};

const buildSignedBundle = () => {
  run("npm", ["run", "tauri", "build"], {
    env: {
      ...process.env,
      TAURI_SIGNING_PRIVATE_KEY: keyPath,
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "",
    },
  });
};

const collectBuildArtifacts = (version) => {
  const tarSrc = join(BUNDLE_DIR, `macos/${PRODUCT_NAME}.app.tar.gz`);
  const sigSrc = `${tarSrc}.sig`;
  const dmgSrc = join(BUNDLE_DIR, `dmg/${tauriBundleBase(version)}.dmg`);
  for (const f of [tarSrc, sigSrc, dmgSrc]) {
    if (!existsSync(f)) die(`сборка не дала артефакт ${f}`);
  }
  return { tarSrc, sigSrc, dmgSrc };
};

const prepareReleaseAssets = ({ version, notes, tarSrc, sigSrc }) => {
  mkdirSync(RELEASE_ASSETS_DIR, { recursive: true });
  const tarName = `${uploadedAssetBase(version)}.app.tar.gz`;
  copyFileSync(tarSrc, join(RELEASE_ASSETS_DIR, tarName));
  const latest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: {
      [PLATFORM]: {
        signature: readFileSync(sigSrc, "utf8").trim(),
        url: `${RELEASES_REPO_URL}/releases/download/v${version}/${tarName}`,
      },
    },
  };
  writeJson(join(RELEASE_ASSETS_DIR, LATEST_MANIFEST_NAME), latest);
  return tarName;
};

const publishGithubRelease = ({ version, notes, tarName, dmgSrc }) => {
  run("gh", [
    "release",
    "create",
    `v${version}`,
    "--repo",
    RELEASES_REPO,
    "--title",
    `${PRODUCT_NAME} ${version}`,
    "--notes",
    notes,
    join(RELEASE_ASSETS_DIR, tarName),
    join(RELEASE_ASSETS_DIR, LATEST_MANIFEST_NAME),
    dmgSrc,
  ]);
};

const commitAndTag = (version) => {
  run("git", [
    "add",
    "package.json",
    "package-lock.json",
    TAURI_CONF_PATH,
    CARGO_TOML_PATH,
    "src-tauri/Cargo.lock",
  ]);
  run("git", ["commit", "-m", `release: v${version}`]);
  run("git", ["tag", `v${version}`]);
};

const { version, notes } = parseCliArgs(process.argv.slice(2));
const { pkg, conf } = readVersionedConfigs();
const current = assertVersionsInSync(pkg, conf);
assertReadyToRelease(version, current);

console.log(`\n${PRODUCT_NAME} ${current} → ${version}\n`);
bumpVersions(pkg, conf, current, version);
buildSignedBundle();

const { tarSrc, sigSrc, dmgSrc } = collectBuildArtifacts(version);
const tarName = prepareReleaseAssets({ version, notes, tarSrc, sigSrc });
publishGithubRelease({ version, notes, tarName, dmgSrc });
commitAndTag(version);

console.log(`\nготово: ${RELEASES_REPO_URL}/releases/tag/v${version}`);
console.log("не забудь: git push && git push --tags");
