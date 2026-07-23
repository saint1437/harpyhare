import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PromptPreset } from "@/lib/presets";

const PRESET_TEXT_ROWS = 3;

export type PresetsUpdate = (presets: PromptPreset[]) => PromptPreset[];

export function PresetsSection({
  presets,
  onChange,
}: {
  presets: PromptPreset[];
  onChange: (update: PresetsUpdate) => void;
}) {
  const updateAt = (index: number, patch: Partial<PromptPreset>) => {
    onChange((ps) => ps.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };
  const removeAt = (index: number) => {
    onChange((ps) => ps.filter((_, i) => i !== index));
  };
  const add = () => {
    onChange((ps) => [...ps, { id: crypto.randomUUID(), name: "", text: "" }]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((p, i) => (
          <PresetEditor
            key={p.id}
            preset={p}
            onChange={(patch) => {
              updateAt(i, patch);
            }}
            onRemove={() => {
              removeAt(i);
            }}
          />
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={add} className="self-start">
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
