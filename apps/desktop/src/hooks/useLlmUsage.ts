import { useEffect, useState } from "react";
import { onEvent } from "@/ipc/events";

export function useLlmUsage(): Record<string, number> {
  const [usage, setUsage] = useState<Record<string, number>>({});
  useEffect(
    () =>
      onEvent("llm-usage", ({ chatId, inputTokens }) => {
        setUsage((prev) => ({ ...prev, [chatId]: inputTokens }));
      }),
    [],
  );
  return usage;
}
