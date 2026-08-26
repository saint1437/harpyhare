import { format } from "@/i18n/format";
import type { Dictionary } from "@/i18n/types";
export type ApiKeyId = "anthropic" | "groq";

/**
 * `name` is a brand and stays out of the dictionary — "Anthropic" is the same
 * word everywhere. What the key is FOR is a sentence, so it lives in
 * `dict.common.apiKeys.purpose`, keyed by the same id.
 */
export interface ApiKeyInfo {
  id: ApiKeyId;
  name: string;
  consoleUrl: string;
}

const API_KEYS = [
  {
    id: "anthropic",
    name: "Anthropic",
    consoleUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "groq",
    name: "Groq",
    consoleUrl: "https://console.groq.com/keys",
  },
] as const satisfies readonly ApiKeyInfo[];

export const API_KEY_IDS: readonly ApiKeyId[] = API_KEYS.map((k) => k.id);

export function apiKeyInfo(id: ApiKeyId): ApiKeyInfo {
  return API_KEYS.find((k) => k.id === id) ?? API_KEYS[0];
}

/**
 * What deciding "which key is missing" needs — a subset of `SecretsStatus`, kept
 * structural so this module stays free of the IPC types.
 *
 * It is a set of FLAGS, not the keys themselves, and that is the whole point of
 * the split: the values never leave Rust, so the launcher, the «Старт» screen
 * and onboarding all reason about presence. Whitespace was trimmed on the Rust
 * side before the flag was raised, so a key of nothing but spaces still counts
 * as missing here.
 */
export interface ApiKeyPresence {
  anthropic_key_set: boolean;
  groq_key_set: boolean;
  access_code_active: boolean;
}

/**
 * An active access code silences BOTH keys — the app's requests go through the
 * proxy and the user's own keys are not used at all.
 */
export function missingApiKeys(secrets: ApiKeyPresence): ApiKeyInfo[] {
  if (secrets.access_code_active) return [];
  return API_KEYS.filter((k) => !secrets[`${k.id}_key_set`]);
}

/**
 * "Add the Anthropic key" against "Add the Anthropic and Groq keys" — the two
 * forms are separate templates rather than a glued-on plural: the number that
 * decides between them is 1 or 2, and no language declines that the same way.
 */
export function missingKeysNotice(missing: ApiKeyInfo[], dict: Dictionary): string {
  const copy = dict.common.apiKeys;
  const names = missing.map((k) => k.name).join(copy.and);
  return format(missing.length === 1 ? copy.missingOne : copy.missingMany, { names });
}
