import { useQuery } from "@tanstack/react-query";
import { listModels } from "@/ipc/commands";
import { curatedModels, FALLBACK_MODELS, type ModelInfo } from "@/lib/models";
import { queryKeys } from "@/lib/query-client";

const MODELS_STALE_MS = 60 * 60 * 1000;

async function listModelsOrFallback(): Promise<ModelInfo[]> {
  const fetched = await listModels();
  return curatedModels(fetched.length > 0 ? fetched : FALLBACK_MODELS);
}

export function useModels(): ModelInfo[] {
  const { data } = useQuery({
    queryKey: queryKeys.models,
    queryFn: listModelsOrFallback,
    staleTime: MODELS_STALE_MS,
    placeholderData: FALLBACK_MODELS,
  });
  return data ?? FALLBACK_MODELS;
}
