import type { ComponentProps, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type TooltipSide = ComponentProps<typeof TooltipContent>["side"];

const SIDE_OFFSET_PX = 4;

export function ShortcutTooltip({
  label,
  shortcut,
  side,
  children,
}: {
  label: string;
  shortcut?: string;
  side?: TooltipSide;
  children: ReactNode;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} sideOffset={SIDE_OFFSET_PX}>
          <span className="flex items-center gap-1.5">
            {label}
            {shortcut !== undefined && shortcut !== "" && (
              <kbd className="shrink-0 rounded-sm bg-background/20 px-1 font-sans text-hint whitespace-nowrap">
                {shortcut}
              </kbd>
            )}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
