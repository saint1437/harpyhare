import { Menu } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "@/components/IconButton";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
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
  vertical: boolean;
}

const HIDDEN_CLIP = "inset(0px 100% 0px 0px round 8px)";
const RAIL_EDGE_MARGIN_PX = 10;
const SPRING_X = { type: "spring", stiffness: 650, damping: 44, mass: 0.7 } as const;
const SPRING_CLIP = { type: "spring", stiffness: 720, damping: 52, mass: 0.7 } as const;
const COLLAPSE_SPRING = { type: "spring", stiffness: 460, damping: 42, mass: 0.9 } as const;
const INSTANT = { duration: 0 } as const;

export const DOCK_BUTTON_CLASS = "rounded-full hover:bg-transparent";

const EXPAND_LABEL = "Развернуть панель";
const COLLAPSE_LABEL = "Свернуть панель";

function DockButton({
  item,
  vertical,
  onHover,
  buttonRef,
}: {
  item: ToolbarDockItem;
  vertical: boolean;
  onHover?: () => void;
  buttonRef?: (el: HTMLSpanElement | null) => void;
}) {
  return (
    <span ref={buttonRef} className="relative inline-flex shrink-0" onMouseEnter={onHover}>
      {item.element ?? (
        <IconButton
          title={vertical ? item.label : ""}
          aria-label={item.label}
          className={cn(DOCK_BUTTON_CLASS, item.iconClass)}
          onClick={item.onClick}
        >
          {item.icon}
        </IconButton>
      )}
    </span>
  );
}

function TooltipRail({
  items,
  visible,
  x,
  clip,
  snap,
  segRef,
}: {
  items: ToolbarDockItem[];
  visible: boolean;
  x: number;
  clip: string;
  snap: boolean;
  segRef: (index: number) => (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      className="pointer-events-none absolute top-full left-0 z-30 mt-2"
      style={{ visibility: visible ? "visible" : "hidden" }}
    >
      <motion.div
        initial={false}
        animate={{ x, clipPath: clip }}
        transition={{ x: snap ? INSTANT : SPRING_X, clipPath: snap ? INSTANT : SPRING_CLIP }}
        style={{ willChange: "transform, clip-path" }}
        className="relative flex w-max rounded-lg bg-foreground text-background shadow-pop"
      >
        {items.map((item, i) => (
          <div key={item.id} ref={segRef(i)} className="inline-flex h-8 items-center px-3">
            <span className="flex items-center gap-1.5 text-caption font-medium whitespace-nowrap">
              {item.label}
              {item.shortcut !== undefined && (
                <kbd className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-sm border border-background/30 px-1 font-sans text-hint">
                  {item.shortcut}
                </kbd>
              )}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export function ToolbarDock({ items, vertical }: ToolbarDockProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<(HTMLDivElement | null)[]>([]);
  const btnRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const reducedMotion = usePrefersReducedMotion();
  const [collapsed, setCollapsed] = useState(vertical);
  const [stripWidth, setStripWidth] = useState(0);
  const [railVisible, setRailVisible] = useState(false);
  const [railPos, setRailPos] = useState({ x: 0, clip: HIDDEN_CLIP });
  const railWasVisible = useRef(false);
  const railSnap = useRef(true);

  const stripOpen = !vertical && !collapsed;
  const dropdownOpen = vertical && !collapsed;

  useEffect(() => {
    setCollapsed(vertical);
  }, [vertical]);

  useLayoutEffect(() => {
    setStripWidth(stripRef.current?.offsetWidth ?? 0);
  }, [items]);

  const reveal = useCallback((index: number) => {
    const seg = segRefs.current[index];
    const btn = btnRefs.current[index];
    const rail = seg?.parentElement;
    const wrapper = wrapperRef.current;
    if (!seg || !btn || !rail || !wrapper) return;
    const railWidth = rail.offsetWidth || 1;
    const leftPct = (seg.offsetLeft / railWidth) * 100;
    const rightPct = ((railWidth - seg.offsetLeft - seg.offsetWidth) / railWidth) * 100;
    const wrapperBox = wrapper.getBoundingClientRect();
    const btnBox = btn.getBoundingClientRect();
    const segCenter = seg.offsetLeft + seg.offsetWidth / 2;
    const btnCenter = btnBox.left - wrapperBox.left + btnBox.width / 2;
    const minX = RAIL_EDGE_MARGIN_PX - (wrapperBox.left + seg.offsetLeft);
    const maxX =
      window.innerWidth -
      RAIL_EDGE_MARGIN_PX -
      (wrapperBox.left + seg.offsetLeft + seg.offsetWidth);
    railSnap.current = !railWasVisible.current;
    railWasVisible.current = true;
    setRailVisible(true);
    setRailPos({
      x: Math.min(maxX, Math.max(minX, btnCenter - segCenter)),
      clip: `inset(0px ${String(rightPct)}% 0px ${String(leftPct)}% round 8px)`,
    });
  }, []);

  const hideRail = useCallback(() => {
    railWasVisible.current = false;
    setRailVisible(false);
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setCollapsed(true);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [dropdownOpen]);

  return (
    <div ref={wrapperRef} className="relative shrink-0" onMouseLeave={hideRail}>
      <div className="flex items-center rounded-full bg-background p-0.5 ring-1 ring-border ring-inset">
        <motion.div
          className="relative h-6 overflow-hidden"
          initial={false}
          animate={{ width: stripOpen ? stripWidth : 0 }}
          transition={reducedMotion ? INSTANT : COLLAPSE_SPRING}
        >
          <div ref={stripRef} className="absolute top-0 right-0 flex h-6 items-center gap-0.5">
            {items.map((item, i) => (
              <DockButton
                key={item.id}
                item={item}
                vertical={false}
                onHover={() => {
                  reveal(i);
                }}
                buttonRef={(el) => {
                  btnRefs.current[i] = el;
                }}
              />
            ))}
          </div>
        </motion.div>
        <IconButton
          title={collapsed ? EXPAND_LABEL : COLLAPSE_LABEL}
          aria-expanded={!collapsed}
          className={DOCK_BUTTON_CLASS}
          onClick={() => {
            hideRail();
            setCollapsed((c) => !c);
          }}
        >
          <Menu />
        </IconButton>
      </div>
      {dropdownOpen && (
        <div className="absolute top-full right-0 z-30 mt-1.5 flex flex-col items-center gap-0.5 rounded-2xl bg-background p-0.5 shadow-pop ring-1 ring-border ring-inset">
          {items.map((item) => (
            <DockButton key={item.id} item={item} vertical />
          ))}
        </div>
      )}
      <TooltipRail
        items={items}
        visible={railVisible && stripOpen}
        x={railPos.x}
        clip={railPos.clip}
        snap={railSnap.current || reducedMotion}
        segRef={(index) => (el) => {
          segRefs.current[index] = el;
        }}
      />
    </div>
  );
}
