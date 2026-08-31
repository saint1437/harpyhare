import { Menu } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "@/components/IconButton";
import { cn } from "@/lib/utils";

export interface ToolbarDockItem {
  id: string;
  label: string;
  icon?: ReactNode;
  element?: ReactNode;
  shortcut?: string;
  iconClass?: string;
  onClick?: () => void;
}

export interface ToolbarDockProps {
  items: ToolbarDockItem[];
}

export const DOCK_BUTTON_CLASS = "rounded-full hover:bg-transparent";

const OPEN_LABEL = "Панель действий";

export function ToolbarDock({ items }: ToolbarDockProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <span className="flex items-center rounded-full bg-background p-0.5 ring-1 ring-border ring-inset">
        <IconButton
          title={OPEN_LABEL}
          aria-expanded={open}
          className={DOCK_BUTTON_CLASS}
          onClick={() => {
            setOpen((o) => !o);
          }}
        >
          <Menu />
        </IconButton>
      </span>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-1.5 flex flex-col items-center gap-0.5 rounded-2xl bg-background p-0.5 shadow-pop ring-1 ring-border ring-inset">
          {items.map((item) => (
            <span key={item.id} className="relative inline-flex shrink-0">
              {item.element ?? (
                <IconButton
                  title={
                    item.shortcut === undefined ? item.label : `${item.label} — ${item.shortcut}`
                  }
                  aria-label={item.label}
                  className={cn(DOCK_BUTTON_CLASS, item.iconClass)}
                  onClick={() => {
                    item.onClick?.();
                    setOpen(false);
                  }}
                >
                  {item.icon}
                </IconButton>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
