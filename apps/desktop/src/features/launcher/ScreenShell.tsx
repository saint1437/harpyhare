import type { ReactNode } from "react";
import { screenMeta, type ScreenId } from "./screens";

export function ScreenShell({
  screen,
  actions,
  children,
}: {
  screen: ScreenId;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const meta = screenMeta(screen);
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-title font-medium text-foreground">{meta.label}</h2>
          <p className="mt-0.5 text-caption text-muted-foreground">{meta.description}</p>
        </div>
        {actions !== undefined && (
          <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
        )}
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1.5">
        <div className="flex flex-col gap-4 pb-1">{children}</div>
      </div>
    </section>
  );
}
