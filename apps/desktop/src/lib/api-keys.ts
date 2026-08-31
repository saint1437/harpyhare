import { STT_PROVIDER_OPENAI } from "./stt-providers";

export type ApiKeyId = "anthropic" | "groq" | "openai";

export interface ApiKeyInfo {
  id: ApiKeyId;
  name: string;
  purpose: string;
  consoleUrl: string;
}

const API_KEYS = [
  {
    id: "anthropic",
    name: "Anthropic",
    purpose: "ответов Claude",
    consoleUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "groq",
    name: "Groq",
    purpose: "распознавания речи через Whisper",
    consoleUrl: "https://console.groq.com/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    purpose: "распознавания речи через OpenAI",
    consoleUrl: "https://platform.openai.com/api-keys",
  },
] as const satisfies readonly ApiKeyInfo[];

export const API_KEY_IDS: readonly ApiKeyId[] = API_KEYS.map((k) => k.id);

export function apiKeyInfo(id: ApiKeyId): ApiKeyInfo {
  return API_KEYS.find((k) => k.id === id) ?? API_KEYS[0];
}

export interface ApiKeySettings {
  anthropic_api_key: string;
  groq_api_key: string;
  openai_api_key: string;
  access_token: string;
  stt_provider: string;
}

function sttKeyId(provider: string): ApiKeyId {
  return provider === STT_PROVIDER_OPENAI ? "openai" : "groq";
}

export function missingApiKeys(settings: ApiKeySettings): ApiKeyInfo[] {
  if (settings.access_token.trim() !== "") return [];
  const required: readonly ApiKeyId[] = ["anthropic", sttKeyId(settings.stt_provider)];
  return API_KEYS.filter(
    (k) => required.includes(k.id) && settings[`${k.id}_api_key`].trim() === "",
  );
}

export function missingKeysNotice(missing: ApiKeyInfo[]): string {
  const noun = missing.length === 1 ? "ключ" : "ключи";
  const names = missing.map((k) => k.name).join(" и ");
  return `Добавьте ${noun} ${names} или введите код доступа`;
}
