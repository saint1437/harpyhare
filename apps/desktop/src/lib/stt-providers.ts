export const STT_PROVIDER_GROQ = "groq";
export const STT_PROVIDER_OPENAI = "openai";

export interface SttProviderOption {
  value: string;
  label: string;
}

export const STT_PROVIDERS = [
  { value: STT_PROVIDER_GROQ, label: "Groq · Whisper" },
  { value: STT_PROVIDER_OPENAI, label: "OpenAI · gpt-4o mini" },
] as const satisfies readonly SttProviderOption[];
