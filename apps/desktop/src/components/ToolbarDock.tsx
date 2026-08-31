import { Menu } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "@/components/IconButton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ToolbarDockItem {
  id: string;
  label: string;
  icon?: ReactNode;
  element?: ReactNode;
  shortcut?: string;
  iconClass?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export interface ToolbarDockProps {
  items: ToolbarDockItem[];
}

export const DOCK_BUTTON_CLASS = "rounded-full hover:bg-transparent";

const OPEN_LABEL = "Панель действий";
const CLOSE_LABEL = "Закрыть панель";
const ESCAPE_KEY = "Escape";
const PORTALLED_LAYER_SELECTOR =
  "[data-radix-popper-content-wrapper], [data-slot='popover-content']";

function insidePortalledLayer(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(PORTALLED_LAYER_SELECTOR) !== null;
}

function DockTooltip({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="left" sideOffset={4}>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {label}
          {shortcut !== undefined && (
            <kbd className="rounded-sm bg-background/20 px-1 font-sans text-hint">{shortcut}</kbd>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

export function ToolbarDock({ items }: ToolbarDockProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (insidePortalledLayer(e.target)) return;
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ESCAPE_KEY) return;
      if (document.querySelector(PORTALLED_LAYER_SELECTOR) !== null) return;
      closeAndRestoreFocus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeAndRestoreFocus]);

  return (
    <TooltipProvider>
      <div ref={wrapperRef} className="relative shrink-0">
        <span
          data-no-drag
          className="flex items-center rounded-full bg-background p-0.5 ring-1 ring-border ring-inset"
        >
          <DockTooltip label={open ? CLOSE_LABEL : OPEN_LABEL}>
            <IconButton
              ref={toggleRef}
              title=""
              aria-label={open ? CLOSE_LABEL : OPEN_LABEL}
              aria-expanded={open}
              className={DOCK_BUTTON_CLASS}
              onClick={() => {
                setOpen((o) => !o);
              }}
            >
              <Menu />
            </IconButton>
          </DockTooltip>
        </span>
        {open && (
          <div
            data-no-drag
            className="absolute top-full right-0 z-30 mt-1.5 flex origin-top animate-in flex-col items-center gap-0.5 rounded-xl bg-background p-0.5 shadow-pop ring-1 ring-border duration-200 fade-in-0 zoom-in-95 [animation-timing-function:cubic-bezier(0.34,1.56,0.64,1)] ring-inset slide-in-from-top-1 motion-reduce:animate-none"
          >
            {items.map((item) => (
              <DockTooltip key={item.id} label={item.label} shortcut={item.shortcut}>
                <span className="relative inline-flex shrink-0">
                  {item.element ?? (
                    <IconButton
                      title=""
                      aria-label={item.label}
                      className={cn(DOCK_BUTTON_CLASS, item.iconClass)}
                      disabled={item.disabled}
                      onClick={() => {
                        item.onClick?.();
                        setOpen(false);
                      }}
                    >
                      {item.icon}
                    </IconButton>
                  )}
                </span>
              </DockTooltip>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
