import { Play } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { canLaunch } from "@/features/settings/readiness";
import { useDict } from "@/hooks/useDict";
import { type LauncherReadiness } from "./useLauncherReadiness";

/**
 * Кнопка запуска стоит и в шапке, и на «Старте». Компонент один, чтобы подпись
 * и условие блокировки не разъехались между двумя местами.
 */
export function LaunchButton({
  readiness,
  launching,
  size = "compact",
  onLaunch,
}: {
  readiness: LauncherReadiness;
  launching: boolean;
  size?: ComponentProps<typeof Button>["size"];
  onLaunch: () => void;
}) {
  const copy = useDict().launcher.launch;
  return (
    <Button
      size={size}
      className="gap-1.5"
      disabled={!canLaunch(readiness, launching)}
      onClick={onLaunch}
    >
      <Play className="size-3" aria-hidden />
      {launching ? copy.busy : copy.idle}
    </Button>
  );
}
