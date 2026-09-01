import { Check, Copy, CopyPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOfficialPresets } from "@/hooks/useOfficialPresets";
import type { PromptPreset } from "@/lib/presets";
import { cn } from "@/lib/utils";
import { SettingGroup } from "../fields";

/**
 * The only place the syntax is taught, so it names the payoff rather than the
 * mechanism: a user who does not know why terms help will not write them.
 */
const KEYWORDS_HINT =
  "Строка [keywords]: [golang, gRPC, Kubernetes] подсказывает распознаванию речи термины этой темы — их перестанет коверкать. В сам промпт она не попадает.";

const PRESET_TEXT_ROWS = 6;
const UNNAMED_PRESET_LABEL = "Без имени";
const PRESET_COPY_SUFFIX = " (копия)";
const REVEAL_ON_HOVER_CLASS =
  "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100";

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
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 transition-colors hover:bg-surface/50">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-body">{preset.name.trim() || UNNAMED_PRESET_LABEL}</span>
        <span className="line-clamp-1 text-caption text-muted-foreground">
          {lengthLabel(preset.text)}
          {preset.text.trim() === "" ? "" : ` · ${preset.text.trim()}`}
        </span>
      </div>
      <div className={cn("flex shrink-0 items-center gap-1", REVEAL_ON_HOVER_CLASS)}>
        <IconButton title="Изменить пресет" onClick={onEdit}>
          <Pencil />
        </IconButton>
        <IconButton title="Удалить пресет" className="hover:text-destructive" onClick={onRemove}>
          <Trash2 />
        </IconButton>
      </div>
    </div>
  );
}

function OfficialPresetRow({
  preset,
  expanded,
  onToggle,
  onCopyToOwn,
}: {
  preset: PromptPreset;
  expanded: boolean;
  onToggle: () => void;
  onCopyToOwn: () => void;
}) {
  return (
    <div className="group flex flex-col gap-1.5 px-3 py-2 transition-colors hover:bg-surface/50">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <button
          type="button"
          aria-expanded={expanded}
          title={expanded ? "Свернуть текст" : "Показать полный текст"}
          onClick={onToggle}
          className="flex min-w-0 flex-col gap-0.5 text-left"
        >
          <span className="truncate text-body">{preset.name}</span>
          {!expanded && (
            <span className="line-clamp-1 text-caption text-muted-foreground">{preset.text}</span>
          )}
        </button>
        <div className={cn("flex shrink-0 items-center gap-1", !expanded && REVEAL_ON_HOVER_CLASS)}>
          <IconButton
            title="Копировать текст"
            onClick={() => {
              void navigator.clipboard.writeText(preset.text);
            }}
          >
            <Copy />
          </IconButton>
          <IconButton title="Скопировать в свои" onClick={onCopyToOwn}>
            <CopyPlus />
          </IconButton>
        </div>
      </div>
      {expanded && (
        <div className="max-h-64 overflow-y-auto text-caption whitespace-pre-wrap text-muted-foreground">
          {preset.text}
        </div>
      )}
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
    <div className="flex flex-col gap-2 bg-surface px-3 py-2.5">
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
        <Button onClick={onDone}>
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
      <p className="text-hint text-muted-foreground">{KEYWORDS_HINT}</p>
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
  const [expandedOfficialId, setExpandedOfficialId] = useState<string | null>(null);

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
  const copyToOwn = (preset: PromptPreset) => {
    const id = crypto.randomUUID();
    onChange((ps) => [
      ...ps,
      { id, name: `${preset.name}${PRESET_COPY_SUFFIX}`, text: preset.text },
    ]);
    setEditingId(id);
  };

  return (
    <>
      <SettingGroup
        title="Свои пресеты"
        description="Препромпт подставляется в начало системного промпта чата и выбирается в тулбаре под полем ввода."
      >
        {presets.length === 0 && (
          <div className="flex flex-col items-start gap-2 px-3 py-4">
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
          <div className="px-3 py-2">
            <Button variant="ghost" size="sm" onClick={add}>
              <Plus />
              Добавить пресет
            </Button>
          </div>
        )}
      </SettingGroup>

      <SettingGroup
        title="Встроенные"
        description="Приходят вместе с приложением и обновляются сами — их видно в том же списке в чате. Изменить встроенный нельзя: скопируйте его в свои пресеты и правьте копию."
      >
        {official.map((preset) => (
          <OfficialPresetRow
            key={preset.id}
            preset={preset}
            expanded={expandedOfficialId === preset.id}
            onToggle={() => {
              setExpandedOfficialId((current) => (current === preset.id ? null : preset.id));
            }}
            onCopyToOwn={() => {
              copyToOwn(preset);
            }}
          />
        ))}
      </SettingGroup>
    </>
  );
}
