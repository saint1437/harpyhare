import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getOfficialPresets } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import { OFFICIAL_PRESETS_FALLBACK, type PromptPreset } from "@/lib/presets";
import { queryKeys } from "@/lib/query-client";

export function useOfficialPresets(): PromptPreset[] {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: queryKeys.officialPresets,
    queryFn: getOfficialPresets,
    placeholderData: OFFICIAL_PRESETS_FALLBACK,
  });

  useEffect(
    () =>
      onEvent("official-presets-updated", (fresh) => {
        queryClient.setQueryData(queryKeys.officialPresets, fresh);
      }),
    [queryClient],
  );

  return data ?? OFFICIAL_PRESETS_FALLBACK;
}
