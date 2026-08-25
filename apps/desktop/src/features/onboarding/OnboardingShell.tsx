import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Onboarding lives inside the launcher window and cannot make it smaller: the app
 * has no way to resize its own launcher (`set_window_size` is wired to the HUD
 * only, and no window-setter capability is granted). So the flow is a centred
 * column that has to read at 1000×720 and still hold together at the 520×480
 * minimum, rather than a dialog sized to its content.
 */
export function OnboardingShell({
  step,
  total,
  heading,
  children,
  primary,
  secondary,
}: {
  step: number;
  total: number;
  heading: string;
  children: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-1 justify-center overflow-y-auto">
      <div className="flex w-full max-w-xl flex-col gap-6 py-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-caption text-fg-subtle tabular-nums">
              Шаг {step} из {total}
            </span>
          </div>
          <div className="flex gap-1" role="presentation">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={cn("h-0.5 flex-1 rounded-full", i < step ? "bg-accent-mark" : "bg-line")}
              />
            ))}
          </div>
          <h2 className="text-display font-semibold tracking-tight text-fg">{heading}</h2>
        </header>

        <div className="flex min-w-0 flex-col gap-4">{children}</div>

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex min-w-0 items-center gap-2">{secondary}</div>
          <div className="flex shrink-0 items-center gap-2">{primary}</div>
        </footer>
      </div>
    </section>
  );
}
