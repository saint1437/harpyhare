import { useEffect, useState } from "react";
import type { ReactNode } from "react";
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
import { MODELS, type Settings } from "@/ipc/types";
import { applyOpacity } from "@/lib/window-controls";

export interface SettingsDialogProps {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (next: Settings) => void;
}

export function SettingsDialog({ open, settings, onClose, onSave }: SettingsDialogProps) {
  const [draft, setDraft] = useState<Settings>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      applyOpacity(document.documentElement, settings.window_opacity);
      onClose();
    }
  };

  const save = () => {
    onSave({
      ...draft,
      hotkey: draft.hotkey.trim().toUpperCase() || "V",
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
          <Field label="Модель">
            <Select
              value={draft.model}
              onValueChange={(v) => {
                set("model", v);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Системный промпт">
            <Textarea
              rows={3}
              value={draft.system_prompt}
              onChange={(e) => {
                set("system_prompt", e.target.value);
              }}
            />
          </Field>
          <Field label="Push-to-talk клавиша">
            <Input
              value={draft.hotkey}
              maxLength={20}
              placeholder="V"
              onChange={(e) => {
                set("hotkey", e.target.value);
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
