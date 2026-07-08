import { useEffect, useState } from "react";
import { listModels } from "@/ipc/commands";
import { FALLBACK_MODELS, type ModelInfo } from "@/lib/models";

async function listModelsOrEmpty(): Promise<ModelInfo[]> {
  try {
    return await listModels();
  } catch {
    return [];
  }
}

export function useModels(): ModelInfo[] {
  const [models, setModels] = useState<ModelInfo[]>(FALLBACK_MODELS);

  useEffect(() => {
    let live = true;
    void listModelsOrEmpty().then((fetched) => {
      if (live && fetched.length > 0) setModels(fetched);
    });
    return () => {
      live = false;
    };
  }, []);

  return models;
}
