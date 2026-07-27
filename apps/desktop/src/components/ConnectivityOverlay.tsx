import { LoaderCircle } from "lucide-react";

const TITLE = "Ожидается подключение к интернету";
const HINT = "Приложению нужен интернет. Проверь сеть или VPN — экран пропадёт автоматически.";

export function ConnectivityOverlay() {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center rounded-[var(--window-radius)] bg-background">
      <div className="flex max-w-xs flex-col items-center gap-3 px-6 text-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-1">
          <span className="text-body font-medium text-foreground">{TITLE}</span>
          <span className="text-caption text-muted-foreground">{HINT}</span>
        </div>
      </div>
    </div>
  );
}
