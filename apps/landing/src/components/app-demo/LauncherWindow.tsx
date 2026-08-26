import {
  Download,
  Library,
  MessageSquareText,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { LauncherCopy } from "@/i18n/demo-types";
import { cn } from "@/lib/cn";
import { ContextsScreen, PresetsScreen } from "./ContentScreens";
import { useCopy } from "./copy";
import { SettingsScreen } from "./SettingsScreen";
import { PermissionsScreen, UpdatesScreen } from "./SystemScreens";
import type { AppTheme } from "./types";
import { AppEqBars, AppPrimaryButton } from "./ui";

type ScreenId = keyof LauncherCopy["screens"];

const SCREEN_ICONS: Record<ScreenId, LucideIcon> = {
  contexts: Library,
  presets: MessageSquareText,
  settings: SlidersHorizontal,
  permissions: ShieldCheck,
  updates: Download,
};

const SCREEN_GROUPS: Record<"content" | "system", ScreenId[]> = {
  content: ["contexts", "presets"],
  system: ["settings", "permissions", "updates"],
};

const TRAFFIC_LIGHTS = ["bg-[#ff5f57]", "bg-[#febc2e]", "bg-[#28c840]"];

function TitleStrip() {
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 px-4">
      {TRAFFIC_LIGHTS.map((color) => (
        <span key={color} className={cn("size-3 rounded-full", color)} aria-hidden />
      ))}
    </div>
  );
}

function LaunchBar({ launching, onLaunch }: { launching: boolean; onLaunch: () => void }) {
  const copy = useCopy().launcher;
  return (
    <header className="flex h-8 shrink-0 items-center gap-2.5">
      <AppEqBars animated={launching} barClass="bg-app-primary-mark" />
      <h2 className="font-mono text-app-caption font-semibold tracking-[0.16em] text-app-fg/80 uppercase">
        harpyhare
      </h2>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <span className="inline-flex min-w-0 items-center gap-2 px-2 text-app-caption text-app-muted">
          <span className="size-1.5 shrink-0 rounded-full bg-app-primary-mark" aria-hidden />
          <span className="truncate">{launching ? copy.statusLaunching : copy.statusReady}</span>
        </span>
        <AppPrimaryButton onClick={onLaunch} disabled={launching}>
          <Play />
          {launching ? copy.launching : copy.launch}
        </AppPrimaryButton>
      </div>
    </header>
  );
}

function Sidebar({ active, onSelect }: { active: ScreenId; onSelect: (id: ScreenId) => void }) {
  const copy = useCopy().launcher;
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      className="app-no-scrollbar flex w-11 shrink-0 flex-col gap-4 overflow-y-auto md:w-52"
    >
      {(["content", "system"] as const).map((group) => (
        <div key={group} className={cn("flex flex-col gap-0.5", group === "system" && "mt-auto")}>
          {SCREEN_GROUPS[group].map((id) => {
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
                  "flex items-center justify-center gap-2.5 rounded-lg px-0 py-2 text-left text-app-body whitespace-nowrap transition-colors md:justify-start md:px-2.5",
                  isActive
                    ? "bg-app-surface-active text-app-fg"
                    : "text-app-muted hover:bg-app-surface hover:text-app-fg",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="hidden truncate md:inline">{copy.screens[id].label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ScreenShell({ screen, children }: { screen: ScreenId; children: ReactNode }) {
  const meta = useCopy().launcher.screens[screen];
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <header className="min-w-0">
        <h3 className="text-app-title font-medium text-app-fg">{meta.label}</h3>
        <p className="mt-0.5 text-app-caption text-app-muted">{meta.description}</p>
      </header>
      <div className="app-scroll min-h-0 min-w-0 flex-1 overflow-y-auto pr-1.5">
        <div className="flex flex-col gap-4 pb-1">{children}</div>
      </div>
    </section>
  );
}

function ScreenContent({
  id,
  theme,
  onThemeChange,
}: {
  id: ScreenId;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}) {
  if (id === "contexts") return <ContextsScreen />;
  if (id === "presets") return <PresetsScreen />;
  if (id === "permissions") return <PermissionsScreen />;
  if (id === "updates") return <UpdatesScreen />;
  return <SettingsScreen theme={theme} onThemeChange={onThemeChange} />;
}

export function LauncherWindow({
  launching,
  theme,
  onLaunch,
  onThemeChange,
}: {
  launching: boolean;
  theme: AppTheme;
  onLaunch: () => void;
  onThemeChange: (theme: AppTheme) => void;
}) {
  const [screen, setScreen] = useState<ScreenId>("settings");

  return (
    <div className="app-launcher flex h-full flex-col bg-app-bg text-app-fg">
      <TitleStrip />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-1 pb-4 sm:px-5">
        <LaunchBar launching={launching} onLaunch={onLaunch} />
        <div className="flex min-h-0 min-w-0 flex-1 gap-4 md:gap-6">
          <Sidebar active={screen} onSelect={setScreen} />
          <ScreenShell screen={screen}>
            <ScreenContent id={screen} theme={theme} onThemeChange={onThemeChange} />
          </ScreenShell>
        </div>
      </div>
    </div>
  );
}
