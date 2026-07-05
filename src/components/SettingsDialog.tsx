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
  /** Версия текущей сборки ("" вне Tauri — строка скрывается). */
  appVersion: string;
  /** Ручная проверка обновлений; при найденной версии App сам откроет UpdateDialog. */
  onCheckUpdates: () => Promise<UpdateInfo | null>;
  onClose: () => void;
  onSave: (next: Settings) => void;
}

type CheckState = "idle" | "checking" | "latest" | "error";

/** Языки распознавания Whisper (ISO 639-1); "auto" — поле language не отправляется. */
const STT_LANGUAGES = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "uk", label: "Українська" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "auto", label: "Автоопределение" },
];

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
        // найдено — App закрывает настройки и открывает диалог обновления
        setCheckState(found ? "idle" : "latest");
      })
      .catch(() => {
        setCheckState("error");
      });
  };

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
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

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // откат живых превью несохранённых значений
      applyOpacity(document.documentElement, settings.window_opacity);
      applyChatFontSize(document.documentElement, settings.chat_font_size);
      onClose();
    }
  };

  const save = () => {
    onSave({
      ...draft,
      hotkey: draft.hotkey.trim() || "V",
      toggle_hotkey: draft.toggle_hotkey.trim() || "Cmd+Shift+H",
      prompt_presets: draft.prompt_presets.filter(
        (p) => p.name.trim() !== "" || p.text.trim() !== "",
      ),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-[400px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3.5 py-1">
          <Field label="Ключ Anthropic">
            <Input
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={draft.anthropic_api_key}
              onChange={(e) => {
                set("anthropic_api_key", e.target.value);
              }}
            />
          </Field>
          <Field label="Ключ Groq">
            <Input
              type="password"
              autoComplete="off"
              placeholder="gsk_…"
              value={draft.groq_api_key}
              onChange={(e) => {
                set("groq_api_key", e.target.value);
              }}
            />
          </Field>
          <Field label="Язык распознавания">
            <Select
              value={draft.stt_language === "" ? "auto" : draft.stt_language}
              disabled={draft.stt_translate}
              onValueChange={(v) => {
                set("stt_language", v === "auto" ? "" : v);
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
          <label className="flex items-center gap-2.5 text-[12.5px]">
            <Switch
              checked={draft.stt_translate}
              onCheckedChange={(v) => {
                set("stt_translate", v);
              }}
            />
            Переводить речь на английский (язык исходника — любой)
          </label>
          <Field label="Пресеты препромпта">
            <div className="grid gap-2">
              {draft.prompt_presets.map((p, i) => (
                <div key={p.id} className="grid gap-1.5 rounded-md bg-white/5 p-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Имя"
                      value={p.name}
                      onChange={(e) => {
                        updatePreset(i, { name: e.target.value });
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        removePreset(i);
                      }}
                    >
                      Удалить
                    </Button>
                  </div>
                  <Textarea
                    rows={3}
                    placeholder="Текст препромпта"
                    value={p.text}
                    onChange={(e) => {
                      updatePreset(i, { text: e.target.value });
                    }}
                    className="field-sizing-fixed max-h-32 overflow-y-auto"
                  />
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addPreset}>
                + Добавить пресет
              </Button>
            </div>
          </Field>
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
          <label className="flex items-center gap-2.5 text-[12.5px]">
            <Switch
              checked={draft.auto_send}
              onCheckedChange={(v) => {
                set("auto_send", v);
              }}
            />
            Отправлять сразу после распознавания
          </label>
          <label className="flex items-center gap-2.5 text-[12.5px]">
            <Switch
              checked={draft.auto_preview_html}
              onCheckedChange={(v) => {
                set("auto_preview_html", v);
              }}
            />
            Автопревью HTML из ответа
          </label>
          <label className="flex items-center gap-2.5 text-[12.5px]">
            <Switch
              checked={draft.fast_mode}
              onCheckedChange={(v) => {
                set("fast_mode", v);
              }}
            />
            Fast mode (Opus 4.8) — до 2.5x быстрее, дороже
          </label>
          <label className="flex items-center gap-2.5 text-[12.5px]">
            <Switch
              checked={draft.screen_share_visible}
              onCheckedChange={(v) => {
                set("screen_share_visible", v);
              }}
            />
            Показывать окно при демонстрации экрана
          </label>
          <Field label={`Размер шрифта чата — ${draft.chat_font_size}px`}>
            <Slider
              min={11}
              max={18}
              step={0.5}
              value={[draft.chat_font_size]}
              onValueChange={([v]) => {
                if (v === undefined) return;
                set("chat_font_size", v);
                applyChatFontSize(document.documentElement, v);
              }}
            />
          </Field>
          <Field label={`Прозрачность окна — ${Math.round(draft.window_opacity * 100)}%`}>
            <Slider
              min={0.2}
              max={1}
              step={0.05}
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
              min={1}
              max={200}
              value={draft.move_step}
              onChange={(e) => {
                set("move_step", Number(e.target.value));
              }}
            />
          </Field>
          {appVersion !== "" && (
            <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-3">
              <span className="font-mono text-[11.5px] text-muted-foreground">
                itech {appVersion}
                {checkState === "latest" && " — у вас последняя версия"}
                {checkState === "error" && (
                  <span className="text-destructive"> — не удалось проверить</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={checkState === "checking"}
                onClick={checkUpdates}
              >
                {checkState === "checking" ? "Проверяю…" : "Проверить обновления"}
              </Button>
            </div>
          )}
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[11.5px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
