import { SETTINGS_TABS, type SettingsTabId } from "@/features/settings/settings-tabs";
import { useDict } from "@/hooks/useDict";
import { RailButton } from "./RailButton";
import { useRovingTabs } from "./useRovingTabs";

const TAB_IDS = SETTINGS_TABS.map((tab) => tab.id);

export function SettingsTabsRail({
  active,
  onSelect,
}: {
  active: SettingsTabId;
  onSelect: (id: SettingsTabId) => void;
}) {
  const tabs = useDict().settings.tabs;
  const { onKeyDown, tabProps } = useRovingTabs(TAB_IDS, active, onSelect);
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
      className="sticky top-0 flex w-9 shrink-0 flex-col gap-0.5 self-start min-[900px]:w-30"
    >
      {SETTINGS_TABS.map((tab) => (
        <RailButton
          key={tab.id}
          id={tab.id}
          label={tabs[tab.id].label}
          title={tabs[tab.id].label}
          icon={tab.icon}
          active={active === tab.id}
          tabProps={tabProps(tab.id)}
          className="py-1.5 text-left whitespace-nowrap"
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
