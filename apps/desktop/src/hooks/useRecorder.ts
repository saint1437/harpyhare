import { useEffect, useState } from "react";
import { onEvent } from "@/ipc/events";
import type { RecorderState } from "@/ipc/types";

export function useRecorder(): RecorderState {
  const [state, setState] = useState<RecorderState>("idle");
  useEffect(() => onEvent("state-changed", setState), []);
  return state;
}
