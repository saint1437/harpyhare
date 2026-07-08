import { useEffect, useState } from "react";
import { getOfficialPresets } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import { OFFICIAL_PRESETS_FALLBACK, type PromptPreset } from "@/lib/presets";

export function useOfficialPresets(): PromptPreset[] {
  const [presets, setPresets] = useState<PromptPreset[]>(OFFICIAL_PRESETS_FALLBACK);

  useEffect(() => {
    let live = true;
    void getOfficialPresets().then((p) => {
      if (live) setPresets(p);
    });
    const off = onEvent("official-presets-updated", (p) => {
      setPresets(p);
    });
    return () => {
      live = false;
      off();
    };
  }, []);

  return presets;
}
