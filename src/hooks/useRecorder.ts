import { useEffect, useState } from "react";
import { onEvent } from "@/ipc/events";
import type { RecorderState } from "@/ipc/types";

/** Подписка на state-changed. Логику «ошибка важнее idle» держит StatusBar. */
export function useRecorder(): RecorderState {
  const [state, setState] = useState<RecorderState>("idle");
  useEffect(() => onEvent("state-changed", setState), []);
  return state;
}
