import { cn } from "@/lib/utils";
import { screenGroup, SCREEN_GROUPS, type ScreenId } from "./screens";
import { useRovingTabs } from "./useRovingTabs";

export interface SidebarNotice {
  screen: ScreenId;
  label: string;
  kind: "blocker" | "info";
}

interface SidebarProps {
  active: ScreenId;
  notices: SidebarNotice[];
  onSelect: (id: ScreenId) => void;
}

function itemTitle(label: string, notice: SidebarNotice | undefined): string {
  return notice === undefined ? label : `${label} — ${notice.label}`;
}

function SidebarItem({
  id,
  label,
  icon: Icon,
  active,
  notice,
  tabProps,
  onSelect,
}: {
  id: ScreenId;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  active: boolean;
  notice: SidebarNotice | undefined;
  tabProps: Record<string, unknown>;
  onSelect: (id: ScreenId) => void;
}) {
  return (
    <button
      type="button"
      {...tabProps}
      title={itemTitle(label, notice)}
      onClick={() => {
        onSelect(id);
      }}
      className={cn(
        "group relative flex items-center justify-center gap-2 rounded-md px-0 py-2 text-body transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid min-[900px]:justify-start min-[900px]:px-2",
        active
          ? "bg-surface-active text-fg"
          : "text-fg-subtle hover:bg-surface hover:text-fg active:bg-surface-active",
      )}
    >
      {active && (
        <span
          className="absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent-mark"
          aria-hidden
        />
      )}
      <Icon className="size-4 shrink-0" />
      <span className="hidden truncate min-[900px]:inline">{label}</span>
      {notice !== undefined && (
        <span
          className={cn(
            "absolute top-1 right-1 size-1.5 rounded-full",
            notice.kind === "blocker" ? "bg-danger" : "bg-accent-mark",
          )}
          aria-hidden
        />
      )}
    </button>
  );
}

export function Sidebar({ active, notices, onSelect }: SidebarProps) {
  // Порядок обхода стрелками = порядок на экране, а он зависит от платформы.
  const ids = SCREEN_GROUPS.flatMap((group) => screenGroup(group).map((screen) => screen.id));
  const { onKeyDown, tabProps } = useRovingTabs(ids, active, onSelect);
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
      // Иконки без подписей были выбраны, когда две текстовые колонки съедали
      // треть окна; порог 900px — тот же, на котором подписи получает вложенный
      // рельс настроек, и при нём обе колонки помещаются.
      className="no-scrollbar flex w-10 shrink-0 flex-col gap-4 overflow-y-auto min-[900px]:w-40"
    >
      {SCREEN_GROUPS.map((group) => (
        <div key={group} className={cn("flex flex-col gap-0.5", group === "system" && "mt-auto")}>
          {screenGroup(group).map((screen) => (
            <SidebarItem
              key={screen.id}
              id={screen.id}
              label={screen.label}
              icon={screen.icon}
              active={active === screen.id}
              notice={notices.find((n) => n.screen === screen.id)}
              tabProps={tabProps(screen.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
