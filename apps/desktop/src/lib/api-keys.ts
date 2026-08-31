export type ApiKeyId = "anthropic" | "xclis" | "groq" | "deepgram";

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
    purpose: "ответов Claude через альтернативный Anthropic-совместимый API",
    consoleUrl: "https://xclis.ai/ref/MGJST",
  },
  {
    id: "groq",
    name: "Groq",
    purpose: "распознавания речи через Whisper",
    consoleUrl: "https://console.groq.com/keys",
  },
  {
    id: "deepgram",
    name: "Deepgram",
    purpose: "распознавания речи через Nova-3",
    consoleUrl: "https://console.deepgram.com/",
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
  deepgram_api_key: string;
  llm_provider: string;
  stt_provider: string;
  access_token: string;
}

function selectedClaudeKey(settings: ApiKeySettings): ApiKeyId {
  return settings.llm_provider === "xclis" ? "xclis" : "anthropic";
}

function selectedSttKey(settings: ApiKeySettings): ApiKeyId {
  return settings.stt_provider === "deepgram" ? "deepgram" : "groq";
}

export function missingApiKeys(settings: ApiKeySettings): ApiKeyInfo[] {
  if (settings.access_token.trim() !== "") return [];

  const selectedClaude = selectedClaudeKey(settings);
  const selectedStt = selectedSttKey(settings);
  const missing: ApiKeyInfo[] = [];

  if (settings[`${selectedClaude}_api_key`].trim() === "") {
    missing.push(apiKeyInfo(selectedClaude));
  }
  if (settings[`${selectedSttKey}_api_key`].trim() === "") {
    missing.push(apiKeyInfo(selectedSttKey));
  }

  return missing;
}

export function missingKeysNotice(missing: ApiKeyInfo[]): string {
  if (missing.length === 0) return "";
  const noun = missing.length === 1 ? "ключ" : "ключи";
  const names = missing.map((k) => k.name).join(" и ");
  return `Добавьте ${noun} ${names} для выбранных провайдеров или введите код доступа`;
}
