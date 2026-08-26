import { useDict } from "@/hooks/useDict";
import { format } from "@/i18n";
import { cn } from "@/lib/utils";
import { RailButton } from "./RailButton";
import { screenCopy, screenGroup, SCREEN_GROUPS, type ScreenId } from "./screens";
import { useRovingTabs } from "./useRovingTabs";

export interface SidebarNotice {
  screen: ScreenId;
  label: string;
  kind: "blocker" | "info";
}

export function Sidebar({
  active,
  notices,
  onSelect,
}: {
  active: ScreenId;
  notices: SidebarNotice[];
  onSelect: (id: ScreenId) => void;
}) {
  const dict = useDict();
  // Порядок обхода стрелками = порядок на экране, а он зависит от платформы.
  const ids = SCREEN_GROUPS.flatMap((group) => screenGroup(group).map((screen) => screen.id));
  const { onKeyDown, tabProps } = useRovingTabs(ids, active, onSelect);

  /** An icon-only item cannot be asked what its dot means, so the reason goes into `title`. */
  const itemTitle = (label: string, notice: SidebarNotice | undefined): string =>
    notice === undefined
      ? label
      : format(dict.launcher.shell.sidebarNoticeTitle, { screen: label, notice: notice.label });

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
      className="no-scrollbar flex w-10 shrink-0 flex-col gap-4 overflow-y-auto min-[900px]:w-40"
    >
      {SCREEN_GROUPS.map((group) => (
        <div key={group} className={cn("flex flex-col gap-0.5", group === "system" && "mt-auto")}>
          {screenGroup(group).map((screen) => {
            const notice = notices.find((n) => n.screen === screen.id);
            const label = screenCopy(screen.id, dict).label;
            return (
              <RailButton
                key={screen.id}
                id={screen.id}
                label={label}
                title={itemTitle(label, notice)}
                icon={screen.icon}
                active={active === screen.id}
                tabProps={tabProps(screen.id)}
                className="py-2"
                onSelect={onSelect}
              >
                {notice !== undefined && (
                  <span
                    className={cn(
                      "absolute top-1 right-1 size-1.5 rounded-full",
                      notice.kind === "blocker" ? "bg-danger" : "bg-accent-mark",
                    )}
                    aria-hidden
                  />
                )}
              </RailButton>
            );
          })}
        </div>
      ))}
    </div>
  );
}
