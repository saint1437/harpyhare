import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOfficialPresets } from "@/hooks/useOfficialPresets";
import type { PromptPreset } from "@/lib/presets";
import { SettingGroup } from "../fields";

const PRESET_TEXT_ROWS = 6;
const UNNAMED_PRESET_LABEL = "Без имени";

export type PresetsUpdate = (presets: PromptPreset[]) => PromptPreset[];

function lengthLabel(text: string): string {
  return text.trim() === "" ? "пусто" : `${String(text.trim().length)} симв.`;
}

function PresetRow({
  preset,
  onEdit,
  onRemove,
}: {
  preset: PromptPreset;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-body">{preset.name.trim() || UNNAMED_PRESET_LABEL}</span>
        <span className="line-clamp-2 text-caption text-muted-foreground">
          {lengthLabel(preset.text)}
          {preset.text.trim() === "" ? "" : ` · ${preset.text.trim()}`}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <IconButton title="Изменить пресет" onClick={onEdit}>
          <Pencil />
        </IconButton>
        <IconButton title="Удалить пресет" onClick={onRemove}>
          <Trash2 />
        </IconButton>
      </div>
    </div>
  );
}

function PresetEditor({
  preset,
  onChange,
  onDone,
}: {
  preset: PromptPreset;
  onChange: (patch: Partial<PromptPreset>) => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 bg-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          aria-label="Имя пресета"
          placeholder="Имя — его видно в списке под чатом"
          value={preset.name}
          onChange={(e) => {
            onChange({ name: e.target.value });
          }}
        />
        <Button size="sm" onClick={onDone}>
          <Check />
          Готово
        </Button>
      </div>
      <Textarea
        rows={PRESET_TEXT_ROWS}
        aria-label="Текст пресета"
        placeholder="Текст, который встанет в начало системного промпта: роль, тон, формат ответа"
        value={preset.text}
        onChange={(e) => {
          onChange({ text: e.target.value });
        }}
        className="max-h-64 overflow-y-auto"
      />
    </div>
  );
}

export function PresetsSection({
  presets,
  onChange,
}: {
  presets: PromptPreset[];
  onChange: (update: PresetsUpdate) => void;
}) {
  const official = useOfficialPresets();
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateAt = (index: number, patch: Partial<PromptPreset>) => {
    onChange((ps) => ps.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };
  const removeAt = (index: number) => {
    onChange((ps) => ps.filter((_, i) => i !== index));
  };
  const add = () => {
    const id = crypto.randomUUID();
    onChange((ps) => [...ps, { id, name: "", text: "" }]);
    setEditingId(id);
  };

  return (
    <>
      <SettingGroup
        title="Свои пресеты"
        description="Препромпт подставляется в начало системного промпта чата и выбирается в тулбаре под полем ввода."
      >
        {presets.length === 0 && (
          <div className="flex flex-col items-start gap-2 px-4 py-5">
            <span className="text-body">Пока ни одного пресета</span>
            <span className="max-w-prose text-caption text-muted-foreground">
              Пресет — заготовка роли: «отвечай кратко и по делу», «ты интервьюер по Go», «переводи
              ответ на английский». В чате его можно переключить в любой момент.
            </span>
            <Button size="sm" onClick={add}>
              <Plus />
              Создать пресет
            </Button>
          </div>
        )}
        {presets.map((preset, index) =>
          editingId === preset.id ? (
            <PresetEditor
              key={preset.id}
              preset={preset}
              onChange={(patch) => {
                updateAt(index, patch);
              }}
              onDone={() => {
                setEditingId(null);
              }}
            />
          ) : (
            <PresetRow
              key={preset.id}
              preset={preset}
              onEdit={() => {
                setEditingId(preset.id);
              }}
              onRemove={() => {
                removeAt(index);
              }}
            />
          ),
        )}
        {presets.length > 0 && (
          <div className="px-4 py-2.5">
            <Button variant="ghost" size="sm" onClick={add}>
              <Plus />
              Добавить пресет
            </Button>
          </div>
        )}
      </SettingGroup>

      <SettingGroup
        title="Встроенные"
        description="Приходят вместе с приложением и обновляются сами — их видно в том же списке в чате."
      >
        {official.map((preset) => (
          <div key={preset.id} className="flex min-w-0 flex-col gap-0.5 px-4 py-2.5">
            <span className="truncate text-body">{preset.name}</span>
            <span className="line-clamp-2 text-caption text-muted-foreground">{preset.text}</span>
          </div>
        ))}
      </SettingGroup>
    </>
  );
}
