import { useCallback, useEffect, useRef, useState } from "react";
import type { StartupHealthReport } from "@/ipc/bindings";
import { checkStartupHealth } from "@/ipc/commands";
import type { Settings } from "@/ipc/types";

export interface StartupHealthState {
  report: StartupHealthReport | null;
  checking: boolean;
  retry: () => void;
}

function fingerprint(settings: Settings, model: string): string {
  return JSON.stringify([
    model,
    settings.openrouter_api_key,
    settings.stt_provider,
    settings.openrouter_stt_model,
    settings.groq_api_key,
    settings.openai_api_key,
    settings.xai_api_key,
    settings.deepgram_api_key,
    settings.access_token,
  ]);
}

export function useStartupHealth(
  settings: Settings,
  model: string,
  enabled = true,
): StartupHealthState {
  const [report, setReport] = useState<StartupHealthReport | null>(null);
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const current = fingerprint(settings, model);
  const lastRun = useRef<string | null>(null);

  const run = useCallback(
    async (force = false) => {
      if (!enabled) return;
      if (!force && lastRun.current === current) return;
      lastRun.current = current;
      const id = ++generation.current;
      setChecking(true);
      try {
        const next = await checkStartupHealth(model);
        if (id === generation.current) setReport(next);
      } catch {
        if (id === generation.current) setReport(null);
      } finally {
        if (id === generation.current) setChecking(false);
      }
    },
    [current, enabled, model],
  );

  useEffect(() => {
    if (!enabled) return;
    void run();
  }, [enabled, run]);

  return { report, checking, retry: () => void run(true) };
}
