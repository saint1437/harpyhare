import type { ReactNode } from "react";
import { Wordmark } from "@/components/Wordmark";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import { PLATFORM } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { StatusObject, type SaveState } from "./StatusObject";
import { LaunchButton } from "./LaunchButton";
import type { LauncherBlocker, LauncherReadiness } from "./useLauncherReadiness";

const MACOS_TRAFFIC_LIGHTS_CLASS = PLATFORM === "macos" ? "pl-16" : "";

export function LaunchBar({
  readiness,
  launching,
  saveState,
  audioCheckRunning,
  search,
  onGoToBlocker,
  onRetrySave,
  onLaunch,
}: {
  readiness: LauncherReadiness;
  launching: boolean;
  saveState: SaveState;
  audioCheckRunning: boolean;
  search: ReactNode;
  onGoToBlocker: (blocker: LauncherBlocker) => void;
  onRetrySave: () => void;
  onLaunch: () => void;
}) {
  const onDragMouseDown = useWindowDrag();
  return (
    <header
      onMouseDown={onDragMouseDown}
      className={cn("flex h-9 shrink-0 items-center gap-3", MACOS_TRAFFIC_LIGHTS_CLASS)}
    >
      <div className="flex shrink-0 items-center gap-2">
        <Wordmark />
      </div>

      <div className="max-w-96 min-w-0 flex-1">{search}</div>

      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
        <div className="max-w-80 min-w-0">
          <StatusObject
            readiness={readiness}
            launching={launching}
            audioCheckRunning={audioCheckRunning}
            saveState={saveState}
            onGoToBlocker={onGoToBlocker}
            onRetrySave={onRetrySave}
          />
        </div>
        <LaunchButton readiness={readiness} launching={launching} onLaunch={onLaunch} />
      </div>
    </header>
  );
}
