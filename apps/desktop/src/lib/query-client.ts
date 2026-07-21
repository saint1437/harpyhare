import { QueryClient } from "@tanstack/react-query";

const DEFAULT_STALE_MS = 5 * 60 * 1000;
const DEFAULT_GC_MS = 30 * 60 * 1000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_MS,
        gcTime: DEFAULT_GC_MS,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
}

export const queryKeys = {
  models: ["models"] as const,
  officialPresets: ["official-presets"] as const,
  audioDevices: ["audio-devices"] as const,
  countTokens: (
    model: string,
    thinking: boolean,
    webSearch: boolean,
    system: string,
    messagesKey: string,
  ) => ["count-tokens", model, thinking, webSearch, system, messagesKey] as const,
};
