import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SettingGroup } from "@/features/settings/fields";
import { useDict } from "@/hooks/useDict";
import { useOfficialPresets } from "@/hooks/useOfficialPresets";
import { format } from "@/i18n";
import type { Dictionary } from "@/i18n/types";
import type { PromptPreset } from "@/lib/presets";

const PRESET_TEXT_ROWS = 6;

export type PresetsUpdate = (presets: PromptPreset[]) => PromptPreset[];

function lengthLabel(text: string, dict: Dictionary): string {
  const copy = dict.launcher.presets;
  const trimmed = text.trim();
  return trimmed === "" ? copy.lengthEmpty : format(copy.length, { count: String(trimmed.length) });
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
  const dict = useDict();
  const copy = dict.launcher.presets;
  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 transition-colors hover:bg-surface/50">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-body">{preset.name.trim() || copy.unnamed}</span>
        <span className="line-clamp-1 text-caption text-fg-subtle">
          {lengthLabel(preset.text, dict)}
          {preset.text.trim() === "" ? "" : ` · ${preset.text.trim()}`}
        </span>
      </div>
      <div className="pointer-events-none flex shrink-0 items-center gap-1 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
        <IconButton title={copy.edit} onClick={onEdit}>
          <Pencil />
        </IconButton>
        <IconButton title={copy.remove} className="hover:text-danger" onClick={onRemove}>
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
  const dict = useDict();
  const copy = dict.launcher.presets;
  return (
    <div className="flex flex-col gap-2 bg-surface px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          aria-label={copy.nameLabel}
          placeholder={copy.namePlaceholder}
          value={preset.name}
          onChange={(e) => {
            onChange({ name: e.target.value });
          }}
        />
        <Button onClick={onDone}>
          <Check />
          {dict.common.actions.done}
        </Button>
      </div>
      <Textarea
        rows={PRESET_TEXT_ROWS}
        aria-label={copy.textLabel}
        placeholder={copy.textPlaceholder}
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
  const copy = useDict().launcher.presets;
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
      <SettingGroup title={copy.ownTitle} description={copy.ownDescription}>
        {presets.length === 0 && (
          <div className="flex flex-col items-start gap-2 px-3 py-4">
            <span className="text-body">{copy.emptyTitle}</span>
            <span className="max-w-prose text-caption text-fg-subtle">{copy.emptyHint}</span>
            <Button size="sm" onClick={add}>
              <Plus />
              {copy.create}
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
              {copy.add}
            </Button>
          </div>
        )}
      </SettingGroup>

      <SettingGroup title={copy.builtInTitle} description={copy.builtInDescription}>
        {official.map((preset) => (
          <div key={preset.id} className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
            <span className="truncate text-body">{preset.name}</span>
            <span className="line-clamp-1 text-caption text-fg-subtle">{preset.text}</span>
          </div>
        ))}
      </SettingGroup>
    </>
  );
}
