import { useEffect, useState } from "react";
import { listModels } from "@/ipc/commands";
import { FALLBACK_MODELS, type ModelInfo } from "@/lib/models";

/** Модели аккаунта из Models API; до ответа (и при ошибке) — фолбэк-список. */
export function useModels(): ModelInfo[] {
  const [models, setModels] = useState<ModelInfo[]>(FALLBACK_MODELS);

  useEffect(() => {
    let live = true;
    listModels()
      .then((fetched) => {
        if (live && fetched.length > 0) setModels(fetched);
      })
      .catch(() => {
        /* оффлайн/нет ключа — остаёмся на фолбэке */
      });
    return () => {
      live = false;
    };
  }, []);

  return models;
}
