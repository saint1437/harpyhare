import {
  Download,
  Library,
  MessageSquareText,
  Play,
  Rocket,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { LauncherScreenId } from "@/i18n/demo-types";
import { cn } from "@/lib/cn";
import { useCopy } from "./copy";
import {
  ContextsScreen,
  PermissionsScreen,
  PresetsScreen,
  StartScreen,
  UpdatesScreen,
} from "./LauncherScreens";
import { SettingsScreen } from "./SettingsScreen";
import { AppButton, StateBadge } from "./ui";
import type { SettingValue } from "./useDemoRun";

const SCREEN_ICONS: Record<LauncherScreenId, LucideIcon> = {
  start: Rocket,
  contexts: Library,
  presets: MessageSquareText,
  settings: SlidersHorizontal,
  permissions: ShieldCheck,
  updates: Download,
};

/**
 * Three groups, and the third is pinned to the bottom with `mt-auto`. The
 * demo used to have two and no `start` screen at all — see `StartScreen`.
 */
const SCREEN_GROUPS: { id: string; screens: LauncherScreenId[]; bottom?: boolean }[] = [
  { id: "start", screens: ["start"] },
  { id: "content", screens: ["contexts", "presets"] },
  { id: "system", screens: ["settings", "permissions", "updates"], bottom: true },
];

/**
 * The macOS traffic lights. These three hexes are the only raw colours in the
 * demo and they stay raw on purpose: they are the operating system's, not the
 * product's, and putting them in the token layer would claim otherwise.
 */
const TRAFFIC_LIGHTS = ["bg-[#ff5f57]", "bg-[#febc2e]", "bg-[#28c840]"];

function LaunchBar({ launching, onLaunch }: { launching: boolean; onLaunch: () => void }) {
  const copy = useCopy().launcher;
  return (
    <header className="flex h-9 shrink-0 items-center gap-3">
      <h2 className="shrink-0 font-mono text-app-caption font-semibold tracking-wider text-app-muted uppercase select-none">
        {copy.wordmark}
      </h2>

      <div className="relative hidden max-w-96 min-w-0 flex-1 sm:block">
        <Search
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-app-subtle"
          aria-hidden
        />
        <input
          type="text"
          placeholder={copy.search.placeholder}
          aria-label={copy.search.placeholder}
          className="h-7 w-full min-w-0 rounded-md border border-app-border-strong bg-app-code py-1 pr-2.5 pl-7 text-app-body text-app-fg outline-none placeholder:text-app-subtle focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-app-focus focus-visible:outline-solid"
        />
      </div>

      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
        <div className="hidden max-w-80 min-w-0 flex-col items-end md:flex">
          <span className="inline-flex min-w-0 items-center gap-2 px-2">
            <StateBadge
              tone={launching ? "neutral" : "success"}
              label={launching ? copy.status.launching : copy.status.ready.line}
            />
            {!launching && (
              <span className="truncate text-app-caption text-app-subtle">
                {copy.status.ready.detail}
              </span>
            )}
          </span>
        </div>
        <AppButton size="compact" className="gap-1.5" disabled={launching} onClick={onLaunch}>
          <Play className="size-3" />
          {launching ? copy.launching : copy.launch}
        </AppButton>
      </div>
    </header>
  );
}

function Sidebar({
  active,
  onSelect,
}: {
  active: LauncherScreenId;
  onSelect: (id: LauncherScreenId) => void;
}) {
  const copy = useCopy().launcher;
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      className="app-no-scrollbar flex w-10 shrink-0 flex-col gap-4 overflow-y-auto min-[900px]:w-40"
    >
      {SCREEN_GROUPS.map((group) => (
        <div
          key={group.id}
          className={cn("flex flex-col gap-0.5", group.bottom === true && "mt-auto")}
        >
          {group.screens.map((id) => {
            const Icon = SCREEN_ICONS[id];
            const isActive = id === active;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                title={copy.screens[id].label}
                onClick={() => {
                  onSelect(id);
                }}
                className={cn(
                  "relative flex items-center justify-center gap-2 rounded-md px-0 py-2 text-app-body transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid min-[900px]:justify-start min-[900px]:px-2",
                  isActive
                    ? "bg-app-surface-active text-app-fg"
                    : "text-app-subtle hover:bg-app-card hover:text-app-fg active:bg-app-surface-active",
                )}
              >
                {isActive && (
                  <span
                    className="absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full bg-app-primary-mark"
                    aria-hidden
                  />
                )}
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="hidden truncate min-[900px]:inline">{copy.screens[id].label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ScreenShell({ screen, children }: { screen: LauncherScreenId; children: ReactNode }) {
  const meta = useCopy().launcher.screens[screen];
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
      <header className="flex min-h-7 items-center gap-2.5">
        <h3 className="shrink-0 text-app-title font-semibold tracking-tight text-app-fg">
          {meta.label}
        </h3>
        <p
          title={meta.description}
          className="hidden min-w-0 flex-1 truncate text-app-caption text-app-subtle sm:block"
        >
          {meta.description}
        </p>
      </header>
      <div className="app-scroll min-h-0 min-w-0 flex-1 overflow-y-auto pr-1.5">
        <div className="flex flex-col gap-4 pb-1">{children}</div>
      </div>
    </section>
  );
}

export function LauncherWindow({
  launching,
  recordCombo,
  settings,
  onLaunch,
  onSetting,
}: {
  launching: boolean;
  recordCombo: string;
  settings: Record<string, SettingValue>;
  onLaunch: () => void;
  onSetting: (id: string, value: SettingValue) => void;
}) {
  const [screen, setScreen] = useState<LauncherScreenId>("start");

  return (
    <div className="app-launcher flex h-full flex-col bg-app-bg text-app-fg">
      <div className="flex h-7 shrink-0 items-center gap-2 px-4">
        {TRAFFIC_LIGHTS.map((colour) => (
          <span key={colour} className={cn("size-3 rounded-full", colour)} aria-hidden />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-4 pt-0 pb-4 sm:px-5">
        <LaunchBar launching={launching} onLaunch={onLaunch} />
        <div className="flex min-h-0 min-w-0 flex-1 gap-3 md:gap-4">
          <Sidebar active={screen} onSelect={setScreen} />
          <ScreenShell screen={screen}>
            {screen === "start" && <StartScreen recordCombo={recordCombo} />}
            {screen === "contexts" && <ContextsScreen />}
            {screen === "presets" && <PresetsScreen />}
            {screen === "settings" && <SettingsScreen settings={settings} onSetting={onSetting} />}
            {screen === "permissions" && <PermissionsScreen />}
            {screen === "updates" && <UpdatesScreen />}
          </ScreenShell>
        </div>
      </div>
    </div>
  );
}
