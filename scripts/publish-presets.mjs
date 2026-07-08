import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

const BLOB_PATHNAME = "harpyhare/presets.json";
const CACHE_MAX_AGE_SECONDS = 60;

const source = fileURLToPath(new URL("../config/presets.json", import.meta.url));
const raw = await readFile(source, "utf8");

const parsed = JSON.parse(raw);
if (typeof parsed.version !== "number" || !Array.isArray(parsed.presets)) {
  throw new Error('presets.json: ожидаю { "version": number, "presets": [...] }');
}
const ids = new Set();
for (const preset of parsed.presets) {
  const ok =
    preset &&
    typeof preset.id === "string" &&
    typeof preset.name === "string" &&
    typeof preset.text === "string";
  if (!ok) {
    throw new Error(
      `presets.json: у пресета должны быть строковые id/name/text — ${JSON.stringify(preset)}`,
    );
  }
  if (ids.has(preset.id)) {
    throw new Error(`presets.json: повторяющийся id "${preset.id}"`);
  }
  ids.add(preset.id);
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error(
    "Нет BLOB_READ_WRITE_TOKEN. Создай Blob-стор и выполни `vercel env pull .env.local`.",
  );
}

const blob = await put(BLOB_PATHNAME, raw, {
  access: "public",
  contentType: "application/json; charset=utf-8",
  addRandomSuffix: false,
  allowOverwrite: true,
  cacheControlMaxAge: CACHE_MAX_AGE_SECONDS,
});

console.log(`✓ Опубликовано пресетов: ${parsed.presets.length} (version ${parsed.version})`);
console.log(`  URL: ${blob.url}`);
