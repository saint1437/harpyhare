import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AccessCodeForm } from "@/components/AccessCodeForm";
import { ContextLibraryPanel } from "@/components/ContextLibraryPanel";
import { HotkeyCapture } from "@/components/HotkeyCapture";
import { LabeledDivider } from "@/components/LabeledDivider";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ContextLibraryApi } from "@/hooks/useContextLibrary";
import { listAudioOutputDevices } from "@/ipc/commands";
import type { AudioOutputDevice, UpdateInfo } from "@/ipc/types";
import type { Settings } from "@/ipc/types";
import { BRAND_NAME } from "@/lib/brand";
import type { PromptPreset } from "@/lib/presets";
import { queryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import {
  applyChatFontSize,
  applyOpacity,
  applyTheme,
  THEME_BLACK,
  THEME_GRAY,
} from "@/lib/window-controls";

export interface SettingsDialogProps {
  open: boolean;
  settings: Settings;
  appVersion: string;
  contextLibrary: ContextLibraryApi;
  onCheckUpdates: () => Promise<UpdateInfo | null>;
  onRedeem: (code: string) => Promise<string | null>;
  onClose: () => void;
  onSave: (next: Settings) => void;
}

type CheckState = "idle" | "checking" | "latest" | "error";

type TabId = "main" | "contexts" | "hotkeys" | "behavior" | "appearance" | "presets";

const SETTINGS_TABS: { id: TabId; label: string }[] = [
  { id: "main", label: "Основное" },
  { id: "contexts", label: "Контексты" },
  { id: "hotkeys", label: "Горячие клавиши" },
  { id: "behavior", label: "Поведение" },
  { id: "appearance", label: "Вид" },
  { id: "presets", label: "Пресеты" },
];

type SetSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

interface SectionProps {
  draft: Settings;
  set: SetSetting;
}

const STT_LANGUAGE_AUTO = "auto";

const STT_LANGUAGES = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "uk", label: "Українська" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: STT_LANGUAGE_AUTO, label: "Автоопределение" },
];

const FALLBACK_PTT_HOTKEY = "V";
const FALLBACK_TOGGLE_HOTKEY = "Cmd+Shift+H";
const FALLBACK_TELEPROMPTER_HOTKEY = "F10";

const CHAT_FONT_SIZE_MIN = 11;
const CHAT_FONT_SIZE_MAX = 18;
const CHAT_FONT_SIZE_STEP = 0.5;

const WINDOW_OPACITY_MIN = 0.2;
const WINDOW_OPACITY_MAX = 1;
const WINDOW_OPACITY_STEP = 0.05;

const MOVE_STEP_MIN_PX = 1;
const MOVE_STEP_MAX_PX = 200;
const RESIZE_STEP_MIN_PX = 1;
const RESIZE_STEP_MAX_PX = 200;
const SCROLL_STEP_MIN_PX = 10;
const SCROLL_STEP_MAX_PX = 1000;

const PRESET_TEXT_ROWS = 3;

const PERCENT_SCALE = 100;

function isPresetFilled(preset: PromptPreset): boolean {
  return preset.name.trim() !== "" || preset.text.trim() !== "";
}

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * PERCENT_SCALE)}%`;
}

export function SettingsDialog({
  open,
  settings,
  appVersion,
  contextLibrary,
  onCheckUpdates,
  onRedeem,
  onClose,
  onSave,
}: SettingsDialogProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [tab, setTab] = useState<TabId>("main");

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (open) {
      setDraft(settingsRef.current);
      setCheckState("idle");
      setTab("main");
    }
  }, [open]);

  useEffect(() => {
    setDraft((d) => ({ ...d, access_token: settings.access_token }));
  }, [settings.access_token]);

  const checkUpdates = () => {
    setCheckState("checking");
    onCheckUpdates()
      .then((found) => {
        setCheckState(found ? "idle" : "latest");
      })
      .catch(() => {
        setCheckState("error");
      });
  };

  const set: SetSetting = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const updatePreset = (index: number, patch: Partial<PromptPreset>) => {
    setDraft((d) => ({
      ...d,
      prompt_presets: d.prompt_presets.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  };
  const addPreset = () => {
    setDraft((d) => ({
      ...d,
      prompt_presets: [...d.prompt_presets, { id: crypto.randomUUID(), name: "", text: "" }],
    }));
  };
  const removePreset = (index: number) => {
    setDraft((d) => ({
      ...d,
      prompt_presets: d.prompt_presets.filter((_, i) => i !== index),
    }));
  };

  const revertUnsavedLivePreviews = () => {
    applyOpacity(document.documentElement, settings.window_opacity);
    applyChatFontSize(document.documentElement, settings.chat_font_size);
    applyTheme(document.documentElement, settings.theme);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      revertUnsavedLivePreviews();
      onClose();
    }
  };

  const save = () => {
    onSave({
      ...draft,
      hotkey: draft.hotkey.trim() || FALLBACK_PTT_HOTKEY,
      toggle_hotkey: draft.toggle_hotkey.trim() || FALLBACK_TOGGLE_HOTKEY,
      teleprompter_hotkey: draft.teleprompter_hotkey.trim() || FALLBACK_TELEPROMPTER_HOTKEY,
      prompt_presets: draft.prompt_presets.filter(isPresetFilled),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex h-[92vh] w-[95vw] max-w-[95vw] flex-col gap-4 rounded-[22px] p-4 sm:max-w-[95vw] sm:p-6"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
        </DialogHeader>

        <TabBar active={tab} onSelect={setTab} />

        <div className="min-h-0 flex-1 overflow-y-auto py-1 pr-1.5">
          <TabContent
            tab={tab}
            draft={draft}
            set={set}
            contextLibrary={contextLibrary}
            onRedeem={onRedeem}
            onUpdatePreset={updatePreset}
            onAddPreset={addPreset}
            onRemovePreset={removePreset}
          />
        </div>

        <DialogFooter className="items-center border-t pt-3 sm:justify-between">
          <VersionRow
            name={BRAND_NAME}
            appVersion={appVersion}
            checkState={checkState}
            onCheck={checkUpdates}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                handleOpenChange(false);
              }}
            >
              Отмена
            </Button>
            <Button onClick={save}>Сохранить</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TabBar({ active, onSelect }: { active: TabId; onSelect: (id: TabId) => void }) {
  return (
    <div role="tablist" className="no-scrollbar flex gap-1 overflow-x-auto border-b">
      {SETTINGS_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => {
            onSelect(t.id);
          }}
          className={cn(
            "relative shrink-0 px-3 py-1.5 text-body whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            active === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {active === t.id && (
            <span
              className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
              aria-hidden
            />
          )}
        </button>
      ))}
    </div>
  );
}

function TabContent({
  tab,
  draft,
  set,
  contextLibrary,
  onRedeem,
  onUpdatePreset,
  onAddPreset,
  onRemovePreset,
}: {
  tab: TabId;
  draft: Settings;
  set: SetSetting;
  contextLibrary: ContextLibraryApi;
  onRedeem: (code: string) => Promise<string | null>;
  onUpdatePreset: (index: number, patch: Partial<PromptPreset>) => void;
  onAddPreset: () => void;
  onRemovePreset: (index: number) => void;
}) {
  switch (tab) {
    case "main":
      return (
        <div className="grid grid-cols-1 gap-y-5 sm:grid-cols-2 sm:gap-x-10">
          <SectionGroup title="Доступ">
            <ApiKeysSection draft={draft} set={set} onRedeem={onRedeem} />
          </SectionGroup>
          <SectionGroup title="Распознавание речи">
            <SttSection draft={draft} set={set} />
          </SectionGroup>
        </div>
      );
    case "contexts":
      return <ContextLibraryPanel api={contextLibrary} />;
    case "hotkeys":
      return (
        <div className="grid grid-cols-1 gap-y-5 md:grid-cols-3 md:gap-x-10">
          <HotkeysSection draft={draft} set={set} />
        </div>
      );
    case "behavior":
      return (
        <div className="grid grid-cols-1 gap-y-3.5 sm:grid-cols-2 sm:gap-x-10">
          <SwitchesSection draft={draft} set={set} />
        </div>
      );
    case "appearance":
      return (
        <div className="grid grid-cols-1 gap-y-5 md:grid-cols-3 md:gap-x-10">
          <SlidersSection draft={draft} set={set} />
        </div>
      );
    case "presets":
      return (
        <PresetsSection
          presets={draft.prompt_presets}
          onUpdate={onUpdatePreset}
          onAdd={onAddPreset}
          onRemove={onRemovePreset}
        />
      );
  }
}

function ApiKeysSection({
  draft,
  set,
  onRedeem,
}: SectionProps & { onRedeem: (code: string) => Promise<string | null> }) {
  if (draft.access_token.trim() !== "") {
    return (
      <ActiveAccessCode
        onUnlink={() => {
          set("access_token", "");
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Field label="Код доступа">
        <AccessCodeForm onRedeem={onRedeem} />
      </Field>
      <LabeledDivider label="или свои ключи" />
      <ApiKeyField
        label="Ключ Anthropic"
        placeholder="sk-ant-…"
        value={draft.anthropic_api_key}
        onChange={(v) => {
          set("anthropic_api_key", v);
        }}
      />
      <ApiKeyField
        label="Ключ Groq"
        placeholder="gsk_…"
        value={draft.groq_api_key}
        onChange={(v) => {
          set("groq_api_key", v);
        }}
      />
    </div>
  );
}

function ActiveAccessCode({ onUnlink }: { onUnlink: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface px-3 py-2.5">
      <span className="text-body">Доступ по коду активен</span>
      <span className="text-caption text-muted-foreground">
        Запросы идут через бесплатный доступ, свои ключи не используются. Отвяжи код, чтобы
        вернуться к собственным ключам — изменение вступит в силу после «Сохранить».
      </span>
      <Button variant="ghost" size="sm" className="self-start" onClick={onUnlink}>
        Отвязать код
      </Button>
    </div>
  );
}

function ApiKeyField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="password"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </Field>
  );
}

const CAPTURE_DEVICE_SYSTEM_DEFAULT = "system-default";
const CAPTURE_DEVICE_MISSING_LABEL = "Недоступное устройство";

const AUDIO_DEVICES_STALE_MS = 30 * 1000;

function useAudioOutputDevices(): AudioOutputDevice[] {
  const { data } = useQuery({
    queryKey: queryKeys.audioDevices,
    queryFn: listAudioOutputDevices,
    staleTime: AUDIO_DEVICES_STALE_MS,
  });
  return data ?? [];
}

function withSavedDevice(devices: AudioOutputDevice[], savedUid: string): AudioOutputDevice[] {
  if (savedUid === "" || devices.some((d) => d.uid === savedUid)) return devices;
  return [...devices, { uid: savedUid, name: CAPTURE_DEVICE_MISSING_LABEL }];
}

function CaptureDeviceField({ draft, set }: SectionProps) {
  const devices = withSavedDevice(useAudioOutputDevices(), draft.capture_device_uid);
  return (
    <Field label="Устройство захвата звука">
      <Select
        value={
          draft.capture_device_uid === "" ? CAPTURE_DEVICE_SYSTEM_DEFAULT : draft.capture_device_uid
        }
        onValueChange={(v) => {
          set("capture_device_uid", v === CAPTURE_DEVICE_SYSTEM_DEFAULT ? "" : v);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={CAPTURE_DEVICE_SYSTEM_DEFAULT}>
            Системный вывод (следует за настройками macOS)
          </SelectItem>
          {devices.map((d) => (
            <SelectItem key={d.uid} value={d.uid}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function SttSection({ draft, set }: SectionProps) {
  return (
    <>
      <CaptureDeviceField draft={draft} set={set} />
      <Field label="Язык распознавания">
        <Select
          value={draft.stt_language === "" ? STT_LANGUAGE_AUTO : draft.stt_language}
          disabled={draft.stt_translate}
          onValueChange={(v) => {
            set("stt_language", v === STT_LANGUAGE_AUTO ? "" : v);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {STT_LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <SwitchRow
        checked={draft.stt_translate}
        onCheckedChange={(v) => {
          set("stt_translate", v);
        }}
      >
        Переводить речь на английский (язык исходника — любой)
      </SwitchRow>
    </>
  );
}

function PresetsSection({
  presets,
  onUpdate,
  onAdd,
  onRemove,
}: {
  presets: PromptPreset[];
  onUpdate: (index: number, patch: Partial<PromptPreset>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((p, i) => (
          <PresetEditor
            key={p.id}
            preset={p}
            onChange={(patch) => {
              onUpdate(i, patch);
            }}
            onRemove={() => {
              onRemove(i);
            }}
          />
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onAdd} className="self-start">
        + Добавить пресет
      </Button>
    </div>
  );
}

function PresetEditor({
  preset,
  onChange,
  onRemove,
}: {
  preset: PromptPreset;
  onChange: (patch: Partial<PromptPreset>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-xl bg-card/60 p-3 ring-1 ring-border ring-inset">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Имя"
          value={preset.name}
          onChange={(e) => {
            onChange({ name: e.target.value });
          }}
        />
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Удалить
        </Button>
      </div>
      <Textarea
        rows={PRESET_TEXT_ROWS}
        placeholder="Текст препромпта"
        value={preset.text}
        onChange={(e) => {
          onChange({ text: e.target.value });
        }}
        className="max-h-32 overflow-y-auto"
      />
    </div>
  );
}

function HotkeysSection({ draft, set }: SectionProps) {
  return (
    <>
      <Field label="Push-to-talk клавиша">
        <HotkeyCapture
          value={draft.hotkey}
          onChange={(hk) => {
            set("hotkey", hk);
          }}
        />
      </Field>
      <Field label="Скрыть/показать окно">
        <HotkeyCapture
          value={draft.toggle_hotkey}
          onChange={(hk) => {
            set("toggle_hotkey", hk);
          }}
        />
      </Field>
      <Field label="Суфлёр">
        <HotkeyCapture
          value={draft.teleprompter_hotkey}
          onChange={(hk) => {
            set("teleprompter_hotkey", hk);
          }}
        />
      </Field>
    </>
  );
}

function SwitchesSection({ draft, set }: SectionProps) {
  return (
    <>
      <SwitchRow
        checked={draft.auto_send}
        onCheckedChange={(v) => {
          set("auto_send", v);
        }}
      >
        Отправлять сразу после распознавания
      </SwitchRow>
      <SwitchRow
        checked={draft.auto_preview_html}
        onCheckedChange={(v) => {
          set("auto_preview_html", v);
        }}
      >
        Автопревью HTML из ответа
      </SwitchRow>
      <SwitchRow
        checked={draft.fast_mode}
        onCheckedChange={(v) => {
          set("fast_mode", v);
        }}
      >
        Fast mode (Opus 4.8) — до 2.5x быстрее, дороже
      </SwitchRow>
      <SwitchRow
        checked={draft.screen_share_visible}
        onCheckedChange={(v) => {
          set("screen_share_visible", v);
        }}
      >
        Показывать окно при демонстрации экрана
      </SwitchRow>
      <SwitchRow
        checked={draft.teleprompter_resume}
        onCheckedChange={(v) => {
          set("teleprompter_resume", v);
        }}
      >
        Суфлёр продолжает с места остановки
      </SwitchRow>
    </>
  );
}

function SlidersSection({ draft, set }: SectionProps) {
  return (
    <>
      <Field label="Тема">
        <Select
          value={draft.theme === THEME_BLACK ? THEME_BLACK : THEME_GRAY}
          onValueChange={(v) => {
            set("theme", v);
            applyTheme(document.documentElement, v);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={THEME_GRAY}>Серая (светлее)</SelectItem>
            <SelectItem value={THEME_BLACK}>Чёрная (темнее)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label={`Размер шрифта чата — ${draft.chat_font_size}px`}>
        <Slider
          min={CHAT_FONT_SIZE_MIN}
          max={CHAT_FONT_SIZE_MAX}
          step={CHAT_FONT_SIZE_STEP}
          value={[draft.chat_font_size]}
          onValueChange={([v]) => {
            if (v === undefined) return;
            set("chat_font_size", v);
            applyChatFontSize(document.documentElement, v);
          }}
        />
      </Field>
      <Field label={`Прозрачность окна — ${formatPercent(draft.window_opacity)}`}>
        <Slider
          min={WINDOW_OPACITY_MIN}
          max={WINDOW_OPACITY_MAX}
          step={WINDOW_OPACITY_STEP}
          value={[draft.window_opacity]}
          onValueChange={([v]) => {
            if (v === undefined) return;
            set("window_opacity", v);
            applyOpacity(document.documentElement, v);
          }}
        />
      </Field>
      <Field label="Шаг перемещения (⌘+стрелки), px">
        <Input
          type="number"
          min={MOVE_STEP_MIN_PX}
          max={MOVE_STEP_MAX_PX}
          value={draft.move_step}
          onChange={(e) => {
            set("move_step", Number(e.target.value));
          }}
        />
      </Field>
      <Field label="Шаг изменения размера (⌘⇧+стрелки), px">
        <Input
          type="number"
          min={RESIZE_STEP_MIN_PX}
          max={RESIZE_STEP_MAX_PX}
          value={draft.resize_step}
          onChange={(e) => {
            set("resize_step", Number(e.target.value));
          }}
        />
      </Field>
      <Field label="Шаг скролла чата (⌥+стрелки), px">
        <Input
          type="number"
          min={SCROLL_STEP_MIN_PX}
          max={SCROLL_STEP_MAX_PX}
          value={draft.scroll_step}
          onChange={(e) => {
            set("scroll_step", Number(e.target.value));
          }}
        />
      </Field>
    </>
  );
}

function VersionRow({
  name,
  appVersion,
  checkState,
  onCheck,
}: {
  name: string;
  appVersion: string;
  checkState: CheckState;
  onCheck: () => void;
}) {
  if (appVersion === "") return <span />;
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-caption text-muted-foreground">
        {name} {appVersion}
        {checkState === "latest" && " — у вас последняя версия"}
        {checkState === "error" && (
          <span className="text-destructive"> — не удалось проверить</span>
        )}
      </span>
      <Button variant="ghost" size="sm" disabled={checkState === "checking"} onClick={onCheck}>
        {checkState === "checking" ? "Проверяю…" : "Проверить обновления"}
      </Button>
    </div>
  );
}

function SwitchRow({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2.5 text-body">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      {children}
    </label>
  );
}

function SectionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{title}</SectionLabel>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
