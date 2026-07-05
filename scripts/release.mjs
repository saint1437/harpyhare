#!/usr/bin/env node
/**
 * Релиз itech: бамп версии → подписанная сборка → GitHub-релиз в itech-releases.
 *
 *   npm run release -- 0.2.0 [--notes "Что нового"]
 *
 * Требует: gh (авторизованный), приватный ключ подписи updater-артефактов
 * (~/.tauri/itech.key или путь в ITECH_SIGNING_KEY), чистое git-дерево.
 * Шаги: версия в package.json / tauri.conf.json / Cargo.toml → npm run tauri build
 * (TAURI_SIGNING_PRIVATE_KEY) → latest.json → gh release create (tar.gz + dmg) →
 * git commit + tag vX.Y.Z (пуш — вручную).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASES_REPO = "screenfriskofficial/itech-releases";
const PLATFORM = "darwin-aarch64";

const die = (msg) => {
  console.error(`\x1b[31mошибка:\x1b[0m ${msg}`);
  process.exit(1);
};
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
const capture = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" }).trim();

// --- Аргументы -----------------------------------------------------------------
const args = process.argv.slice(2);
const version = args[0];
const notesIdx = args.indexOf("--notes");
const notes = notesIdx !== -1 ? (args[notesIdx + 1] ?? "") : "";
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  die('укажи версию: npm run release -- 0.2.0 [--notes "Что нового"]');
}

// --- Предпроверки (до долгой сборки) --------------------------------------------
const pkgPath = join(ROOT, "package.json");
const confPath = join(ROOT, "src-tauri/tauri.conf.json");
const cargoPath = join(ROOT, "src-tauri/Cargo.toml");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const conf = JSON.parse(readFileSync(confPath, "utf8"));
const current = pkg.version;
if (
  conf.version !== current ||
  !readFileSync(cargoPath, "utf8").includes(`version = "${current}"`)
) {
  die(`версии рассинхронизированы: package.json=${current}, tauri.conf.json=${conf.version}`);
}
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
if (!newer(version, current)) die(`версия ${version} не новее текущей ${current}`);

if (capture("git", ["status", "--porcelain"]) !== "") {
  die("git-дерево не чистое — закоммить или отложи изменения");
}
const keyPath = process.env.ITECH_SIGNING_KEY ?? join(homedir(), ".tauri/itech.key");
if (!existsSync(keyPath)) die(`нет ключа подписи ${keyPath} (см. README, раздел «Релиз»)`);
run("gh", ["auth", "status"], { stdio: "ignore" });
try {
  execFileSync("gh", ["release", "view", `v${version}`, "--repo", RELEASES_REPO], {
    stdio: "ignore",
  });
  die(`релиз v${version} уже существует в ${RELEASES_REPO}`);
} catch {
  /* релиза нет — это и нужно */
}

// --- Бамп версии ----------------------------------------------------------------
console.log(`\nitech ${current} → ${version}\n`);
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
conf.version = version;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");
writeFileSync(
  cargoPath,
  readFileSync(cargoPath, "utf8").replace(`version = "${current}"`, `version = "${version}"`),
);
run("npm", ["install", "--package-lock-only", "--ignore-scripts"]); // синхронизировать package-lock.json

// --- Сборка с подписью updater-артефактов ----------------------------------------
run("npm", ["run", "tauri", "build"], {
  env: {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: keyPath,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "",
  },
});

const bundle = join(ROOT, "src-tauri/target/release/bundle");
const tarSrc = join(bundle, "macos/itech.app.tar.gz");
const sigSrc = `${tarSrc}.sig`;
const dmgSrc = join(bundle, `dmg/itech_${version}_aarch64.dmg`);
for (const f of [tarSrc, sigSrc, dmgSrc]) {
  if (!existsSync(f)) die(`сборка не дала артефакт ${f}`);
}

// --- latest.json + ассеты с версионированными именами -----------------------------
const assetsDir = join(bundle, "release-assets");
mkdirSync(assetsDir, { recursive: true });
const tarName = `itech_${version}_aarch64.app.tar.gz`;
copyFileSync(tarSrc, join(assetsDir, tarName));
const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    [PLATFORM]: {
      signature: readFileSync(sigSrc, "utf8").trim(),
      url: `https://github.com/${RELEASES_REPO}/releases/download/v${version}/${tarName}`,
    },
  },
};
writeFileSync(join(assetsDir, "latest.json"), JSON.stringify(latest, null, 2) + "\n");

// --- Публикация и фиксация -------------------------------------------------------
run("gh", [
  "release",
  "create",
  `v${version}`,
  "--repo",
  RELEASES_REPO,
  "--title",
  `itech ${version}`,
  "--notes",
  notes,
  join(assetsDir, tarName),
  join(assetsDir, "latest.json"),
  dmgSrc,
]);

run("git", [
  "add",
  "package.json",
  "package-lock.json",
  confPath,
  cargoPath,
  "src-tauri/Cargo.lock",
]);
run("git", ["commit", "-m", `release: v${version}`]);
run("git", ["tag", `v${version}`]);

console.log(`\nготово: https://github.com/${RELEASES_REPO}/releases/tag/v${version}`);
console.log("не забудь: git push && git push --tags");
