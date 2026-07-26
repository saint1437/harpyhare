import {
  Download,
  Library,
  MessageSquareText,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ContextsScreen, IdentityScreen, PresetsScreen } from "./ContentScreens";
import type { AppTheme } from "./demo-data";
import { SettingsScreen } from "./SettingsScreen";
import { PermissionsScreen, UpdatesScreen } from "./SystemScreens";
import { AppEqBars, AppPrimaryButton } from "./ui";

type ScreenId = "contexts" | "presets" | "identity" | "settings" | "permissions" | "updates";

interface ScreenMeta {
  id: ScreenId;
  label: string;
  description: string;
  icon: LucideIcon;
  group: "content" | "system";
}

const SCREENS: ScreenMeta[] = [
  {
    id: "contexts",
    label: "Контексты",
    description: "Справочные материалы, которые можно подмешать в системный промпт чата.",
    icon: Library,
    group: "content",
  },
  {
    id: "presets",
    label: "Пресеты",
    description: "Препромпты: текст, который встаёт в начало системного промпта.",
    icon: MessageSquareText,
    group: "content",
  },
  {
    id: "identity",
    label: "Маскировка",
    description: "Имя и иконка, под которыми приложение видно в системе.",
    icon: VenetianMask,
    group: "content",
  },
  {
    id: "settings",
    label: "Настройки",
    description: "Доступ к API, распознавание речи, клавиши, поведение и вид.",
    icon: SlidersHorizontal,
    group: "system",
  },
  {
    id: "permissions",
    label: "Доступы",
    description: "Системные разрешения, без которых часть приложения не работает.",
    icon: ShieldCheck,
    group: "system",
  },
  {
    id: "updates",
    label: "Обновления",
    description: "Версия приложения и установка новой.",
    icon: Download,
    group: "system",
  },
];

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
  return (
    <header className="flex h-8 shrink-0 items-center gap-2.5">
      <AppEqBars animated={launching} barClass="bg-app-primary" />
      <h2 className="font-mono text-app-caption font-semibold tracking-[0.16em] text-app-fg/80 uppercase">
        harpyhare
      </h2>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <span className="inline-flex min-w-0 items-center gap-2 px-2 text-app-caption text-app-muted">
          <span className="size-1.5 shrink-0 rounded-full bg-app-primary" aria-hidden />
          <span className="truncate">
            {launching ? "Запускаю основное окно…" : "Всё готово к запуску"}
          </span>
        </span>
        <AppPrimaryButton onClick={onLaunch} disabled={launching}>
          <Play />
          {launching ? "Запускаю…" : "Запустить"}
        </AppPrimaryButton>
      </div>
    </header>
  );
}

function Sidebar({ active, onSelect }: { active: ScreenId; onSelect: (id: ScreenId) => void }) {
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      className="app-no-scrollbar flex w-11 shrink-0 flex-col gap-4 overflow-y-auto md:w-52"
    >
      {(["content", "system"] as const).map((group) => (
        <div key={group} className={cn("flex flex-col gap-0.5", group === "system" && "mt-auto")}>
          {SCREENS.filter((screen) => screen.group === group).map((screen) => {
            const Icon = screen.icon;
            const isActive = screen.id === active;
            return (
              <button
                key={screen.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                title={screen.label}
                onClick={() => {
                  onSelect(screen.id);
                }}
                className={cn(
                  "flex items-center justify-center gap-2.5 rounded-lg px-0 py-2 text-left text-app-body whitespace-nowrap transition-colors md:justify-start md:px-2.5",
                  isActive
                    ? "bg-app-surface-active text-app-fg"
                    : "text-app-muted hover:bg-app-surface hover:text-app-fg",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="hidden truncate md:inline">{screen.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ScreenShell({ screen, children }: { screen: ScreenMeta; children: ReactNode }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <header className="min-w-0">
        <h3 className="text-app-title font-medium text-app-fg">{screen.label}</h3>
        <p className="mt-0.5 text-app-caption text-app-muted">{screen.description}</p>
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
  if (id === "identity") return <IdentityScreen />;
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
  const meta = SCREENS.find((item) => item.id === screen) ?? SCREENS[0];

  return (
    <div className="app-launcher flex h-full flex-col bg-app-bg text-app-fg">
      <TitleStrip />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-1 pb-4 sm:px-5">
        <LaunchBar launching={launching} onLaunch={onLaunch} />
        <div className="flex min-h-0 min-w-0 flex-1 gap-4 md:gap-6">
          <Sidebar active={screen} onSelect={setScreen} />
          {meta && (
            <ScreenShell screen={meta}>
              <ScreenContent id={screen} theme={theme} onThemeChange={onThemeChange} />
            </ScreenShell>
          )}
        </div>
      </div>
    </div>
  );
}
