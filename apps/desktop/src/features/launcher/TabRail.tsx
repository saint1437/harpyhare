import { cn } from "@/lib/utils";
import type { TabId } from "./tabs";
import { LAUNCHER_TABS } from "./tabs";

export function TabRail({ active, onSelect }: { active: TabId; onSelect: (id: TabId) => void }) {
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      className="no-scrollbar flex w-12 shrink-0 flex-col gap-0.5 overflow-y-auto border-r pr-2 md:w-48 md:pr-3"
    >
      {LAUNCHER_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          title={t.label}
          onClick={() => {
            onSelect(t.id);
          }}
          className={cn(
            "relative flex items-center justify-center gap-2.5 rounded-md px-0 py-2.5 text-left text-body whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:justify-start md:px-3",
            active === t.id
              ? "bg-surface-active text-foreground"
              : "text-muted-foreground hover:bg-surface hover:text-foreground",
          )}
        >
          {active === t.id && (
            <span
              className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
              aria-hidden
            />
          )}
          <t.icon className="size-4 shrink-0" aria-hidden />
          <span className="hidden truncate md:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
