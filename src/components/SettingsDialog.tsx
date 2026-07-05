import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { HotkeyCapture } from "@/components/HotkeyCapture";
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
import type { UpdateInfo } from "@/ipc/types";
import type { Settings } from "@/ipc/types";
import type { PromptPreset } from "@/lib/presets";
import { applyChatFontSize, applyOpacity } from "@/lib/window-controls";

export interface SettingsDialogProps {
  open: boolean;
  settings: Settings;
  appVersion: string;
  onCheckUpdates: () => Promise<UpdateInfo | null>;
  onClose: () => void;
  onSave: (next: Settings) => void;
}

type CheckState = "idle" | "checking" | "latest" | "error";

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

const CHAT_FONT_SIZE_MIN = 11;
const CHAT_FONT_SIZE_MAX = 18;
const CHAT_FONT_SIZE_STEP = 0.5;

const WINDOW_OPACITY_MIN = 0.2;
const WINDOW_OPACITY_MAX = 1;
const WINDOW_OPACITY_STEP = 0.05;

const MOVE_STEP_MIN_PX = 1;
const MOVE_STEP_MAX_PX = 200;

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
  onCheckUpdates,
  onClose,
  onSave,
}: SettingsDialogProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [checkState, setCheckState] = useState<CheckState>("idle");

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setCheckState("idle");
    }
  }, [open, settings]);

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
      prompt_presets: draft.prompt_presets.filter(isPresetFilled),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-[400px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3.5 py-1">
          <ApiKeysSection draft={draft} set={set} />
          <SttSection draft={draft} set={set} />
          <PresetsSection
            presets={draft.prompt_presets}
            onUpdate={updatePreset}
            onAdd={addPreset}
            onRemove={removePreset}
          />
          <HotkeysSection draft={draft} set={set} />
          <SwitchesSection draft={draft} set={set} />
          <SlidersSection draft={draft} set={set} />
          <VersionRow appVersion={appVersion} checkState={checkState} onCheck={checkUpdates} />
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              handleOpenChange(false);
            }}
          >
            Отмена
          </Button>
          <Button onClick={save}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApiKeysSection({ draft, set }: SectionProps) {
  return (
    <>
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
    </>
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

function SttSection({ draft, set }: SectionProps) {
  return (
    <>
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
    <Field label="Пресеты препромпта">
      <div className="grid gap-2">
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
        <Button variant="ghost" size="sm" onClick={onAdd}>
          + Добавить пресет
        </Button>
      </div>
    </Field>
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
    <div className="grid gap-1.5 rounded-md bg-white/5 p-2">
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
        className="field-sizing-fixed max-h-32 overflow-y-auto"
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
    </>
  );
}

function SlidersSection({ draft, set }: SectionProps) {
  return (
    <>
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
    </>
  );
}

function VersionRow({
  appVersion,
  checkState,
  onCheck,
}: {
  appVersion: string;
  checkState: CheckState;
  onCheck: () => void;
}) {
  if (appVersion === "") return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-3">
      <span className="font-mono text-[11.5px] text-muted-foreground">
        itech {appVersion}
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
    <label className="flex items-center gap-2.5 text-[12.5px]">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      {children}
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[11.5px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
