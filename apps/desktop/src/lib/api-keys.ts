export type ApiKeyId = "anthropic" | "xclis" | "groq";

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
    purpose: "ответов Claude через официальный API",
    consoleUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "xclis",
    name: "Xclis",
    purpose: "ответов Claude через Xclis",
    consoleUrl: "https://xclis.ai",
  },
  {
    id: "groq",
    name: "Groq",
    purpose: "распознавания речи",
    consoleUrl: "https://console.groq.com/keys",
  },
] as const satisfies readonly ApiKeyInfo[];

export const API_KEY_IDS: readonly ApiKeyId[] = API_KEYS.map((k) => k.id);

export function apiKeyInfo(id: ApiKeyId): ApiKeyInfo {
  return API_KEYS.find((k) => k.id === id) ?? API_KEYS[0];
}

export interface ApiKeySettings {
  anthropic_api_key: string;
  xclis_api_key: string;
  groq_api_key: string;
  access_token: string;
}

export function missingApiKeys(settings: ApiKeySettings): ApiKeyInfo[] {
  if (settings.access_token.trim() !== "") return [];

  const missing: ApiKeyInfo[] = [];
  const hasClaudeKey =
    settings.anthropic_api_key.trim() !== "" || settings.xclis_api_key.trim() !== "";

  if (!hasClaudeKey) missing.push(apiKeyInfo("anthropic"));
  if (settings.groq_api_key.trim() === "") missing.push(apiKeyInfo("groq"));

  return missing;
}

export function missingKeysNotice(missing: ApiKeyInfo[]): string {
  if (missing.some((k) => k.id === "anthropic")) {
    const needsGroq = missing.some((k) => k.id === "groq");
    return needsGroq
      ? "Добавьте ключ Anthropic или Xclis и ключ Groq, либо введите код доступа"
      : "Добавьте ключ Anthropic или Xclis, либо введите код доступа";
  }
  const noun = missing.length === 1 ? "ключ" : "ключи";
  const names = missing.map((k) => k.name).join(" и ");
  return `Добавьте ${noun} ${names} или введите код доступа`;
}
