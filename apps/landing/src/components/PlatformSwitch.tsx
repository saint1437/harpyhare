import type { PlatformSelection } from "@/hooks/usePlatformSelection";
import { cn } from "@/lib/cn";
import { PLATFORM_LABELS, PLATFORMS } from "@/lib/platform";

interface PlatformSwitchProps extends PlatformSelection {
  className?: string;
}

export function PlatformSwitch({ platform, onSelectPlatform, className }: PlatformSwitchProps) {
  return (
    <div
      role="group"
      aria-label="Платформа"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface/60 p-1",
        className,
      )}
    >
      {PLATFORMS.map((option) => {
        const isSelected = option === platform;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isSelected}
            onClick={() => {
              onSelectPlatform(option);
            }}
            className={cn(
              "rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              isSelected ? "bg-bg-elevated text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {PLATFORM_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
