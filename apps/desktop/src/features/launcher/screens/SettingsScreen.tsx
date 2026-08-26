import type { ReactNode } from "react";
import { ApiKeysSection } from "@/features/settings/ApiKeysSection";
import type { SecretsApi, SectionProps } from "@/features/settings/contract";
import type { SettingsTabId } from "@/features/settings/settings-tabs";
import { SettingsGroupsForTab } from "@/features/settings/SettingsRows";
import { useDict } from "@/hooks/useDict";
import { ScreenShell } from "../ScreenShell";
import { HotkeysSection } from "../sections/HotkeysSection";
import { QuickActionsSection } from "../sections/QuickActionsSection";
import { WindowSection } from "../sections/WindowSection";
import { SettingsTabsRail } from "../SettingsTabsRail";
import { panelProps } from "../useRovingTabs";

type SettingsScreenProps = SectionProps & {
  tab: SettingsTabId;
  secrets: SecretsApi;
  onReplayOnboarding: () => void;
  onTabChange: (tab: SettingsTabId) => void;
};

export function SettingsScreen({
  draft,
  set,
  tab,
  secrets,
  onReplayOnboarding,
  onTabChange,
}: SettingsScreenProps) {
  const tabs = useDict().settings.tabs;
  const sections: Record<SettingsTabId, ReactNode> = {
    access: <ApiKeysSection secrets={secrets} onReplayOnboarding={onReplayOnboarding} />,
    speech: <SettingsGroupsForTab tab="speech" draft={draft} set={set} />,
    hotkeys: <HotkeysSection draft={draft} set={set} />,
    window: <WindowSection draft={draft} set={set} />,
    "quick-actions": <QuickActionsSection draft={draft} set={set} />,
    behavior: <SettingsGroupsForTab tab="behavior" draft={draft} set={set} />,
    appearance: <SettingsGroupsForTab tab="appearance" draft={draft} set={set} />,
  };

  return (
    <ScreenShell screen="settings">
      <div className="flex min-w-0 gap-3 min-[900px]:gap-4">
        <SettingsTabsRail active={tab} onSelect={onTabChange} />
        <div
          key={tab}
          {...panelProps(tab)}
          className="flex min-w-0 flex-1 animate-in flex-col gap-3 duration-150 fade-in-0 outline-none slide-in-from-bottom-1 motion-reduce:animate-none"
        >
          <p className="text-caption text-fg-subtle">{tabs[tab].description}</p>
          {sections[tab]}
        </div>
      </div>
    </ScreenShell>
  );
}
