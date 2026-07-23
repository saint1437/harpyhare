import { Button } from "@/components/ui/button";
import { BRAND_NAME } from "@/lib/brand";

export type CheckState = "idle" | "checking" | "latest" | "error";

export function VersionRow({
  appVersion,
  checkState,
  onCheck,
}: {
  appVersion: string;
  checkState: CheckState;
  onCheck: () => void;
}) {
  if (appVersion === "") return <span />;
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-caption text-muted-foreground">
        {BRAND_NAME} {appVersion}
        {checkState === "latest" && " — у вас последняя версия"}
        {checkState === "error" && (
          <span className="text-destructive"> — не удалось проверить</span>
        )}
      </span>
      <Button variant="ghost" size="sm" disabled={checkState === "checking"} onClick={onCheck}>
        {checkState === "checking" ? "Проверяю…" : "Проверить обновления"}
      </Button>
    </div>
  );
}
