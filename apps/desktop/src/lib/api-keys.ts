export type ApiKeyId = "anthropic" | "groq";

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
    purpose: "ответы Claude",
    consoleUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "groq",
    name: "Groq",
    purpose: "распознавание речи",
    consoleUrl: "https://console.groq.com/keys",
  },
] as const satisfies readonly ApiKeyInfo[];

export function apiKeyInfo(id: ApiKeyId): ApiKeyInfo {
  return API_KEYS.find((k) => k.id === id) ?? API_KEYS[0];
}

export interface ApiKeySettings {
  anthropic_api_key: string;
  groq_api_key: string;
  access_token: string;
}

export function missingApiKeys(settings: ApiKeySettings): ApiKeyInfo[] {
  if (settings.access_token.trim() !== "") return [];
  return API_KEYS.filter((k) => settings[`${k.id}_api_key`].trim() === "");
}

export function missingKeysNotice(missing: ApiKeyInfo[]): string {
  const noun = missing.length === 1 ? "ключ" : "ключи";
  const names = missing.map((k) => k.name).join(" и ");
  return `Добавьте ${noun} ${names} или введите код доступа`;
}
