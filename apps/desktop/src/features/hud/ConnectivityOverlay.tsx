import { LoaderCircle } from "lucide-react";
import { useDict } from "@/hooks/useDict";

export function ConnectivityOverlay() {
  const copy = useDict().hud.connectivity;
  return (
    <div className="absolute inset-0 z-50 grid place-items-center rounded-[var(--window-radius)] bg-base">
      <div className="flex max-w-xs flex-col items-center gap-3 px-6 text-center">
        <LoaderCircle className="size-6 animate-spin text-fg-subtle" aria-hidden />
        <div className="flex flex-col gap-1">
          <span className="text-body font-medium text-fg">{copy.title}</span>
          <span className="text-caption text-fg-subtle">{copy.hint}</span>
        </div>
      </div>
    </div>
  );
}
