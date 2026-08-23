import { Play } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { canLaunch, type LauncherReadiness } from "./useLauncherReadiness";

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
  return (
    <Button
      size={size}
      className="gap-1.5"
      disabled={!canLaunch(readiness, launching)}
      onClick={onLaunch}
    >
      <Play className="size-3" aria-hidden />
      {launching ? "Запускаю…" : "Запустить"}
    </Button>
  );
}
