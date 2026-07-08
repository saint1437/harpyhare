import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { extractImageItems } from "@/lib/composer";
import type { Attachment } from "@/lib/composer";
import { modelLabel, selectableModels, thinkingLocked, type ModelInfo } from "@/lib/models";
import { AttachmentChip } from "./AttachmentChip";

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  attachments: Attachment[];
  onRemoveAttachment: (index: number) => void;
  onPaste: (items: DataTransferItemList) => void;
  onSend: () => void;
  onStop: () => void;
  onClear: () => void;
  onRetry: () => void;
  hotkey: string;
  streaming: boolean;
  showRetry: boolean;
  presets: { id: string; name: string }[];
  presetId: string;
  onPresetChange: (id: string) => void;
  thinkingEnabled: boolean;
  onThinkingChange: (enabled: boolean) => void;
  model: string;
  onModelChange: (model: string) => void;
  webSearch: boolean;
  onWebSearchChange: (enabled: boolean) => void;
  context: string;
  onContextChange: (context: string) => void;
  models: ModelInfo[];
}

const CONTROL_WIDTH_CLASS = "w-[120px]";
const SELECT_TRIGGER_CLASS = `h-8 ${CONTROL_WIDTH_CLASS} text-[12px]`;
const SELECT_CONTENT_POSITION = "popper";
const TOGGLE_ON = "on";
const TOGGLE_OFF = "off";
const NO_PRESET_VALUE = "none";

function pasteHasImages(items: DataTransferItemList) {
  return extractImageItems(items).length > 0;
}

type PromptFieldProps = Pick<
  ComposerProps,
  "value" | "onChange" | "attachments" | "onRemoveAttachment" | "onPaste" | "onSend" | "hotkey"
>;

function PromptField(props: PromptFieldProps) {
  return (
    <div className="rounded-xl bg-card/60 ring-1 ring-border transition-[box-shadow] ring-inset focus-within:ring-primary/50">
      <Textarea
        value={props.value}
        onChange={(e) => {
          props.onChange(e.target.value);
        }}
        onPaste={(e) => {
          const items = e.clipboardData.items;
          if (pasteHasImages(items)) e.preventDefault();
          props.onPaste(items);
        }}
        onKeyDown={(e) => {
          const sendShortcutPressed =
            e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing;
          if (sendShortcutPressed) {
            e.preventDefault();
            props.onSend();
          }
        }}
        spellCheck={false}
        placeholder={`Зажми ${props.hotkey} у видео — расшифровка появится здесь. Текст можно править, ⌘V вставляет скриншот.`}
        className="max-h-44 min-h-24 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <AttachmentList attachments={props.attachments} onRemove={props.onRemoveAttachment} />
    </div>
  );
}

interface AttachmentListProps {
  attachments: Attachment[];
  onRemove: (index: number) => void;
}

function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pb-3">
      {attachments.map((att, i) => (
        <AttachmentChip
          key={att.preview}
          attachment={att}
          onRemove={() => {
            onRemove(i);
          }}
        />
      ))}
    </div>
  );
}

interface ToggleSelectProps {
  value: boolean;
  onChange: (enabled: boolean) => void;
  onLabel: string;
  offLabel: string;
  disabled?: boolean;
}

function ToggleSelect(props: ToggleSelectProps) {
  return (
    <Select
      value={props.value ? TOGGLE_ON : TOGGLE_OFF}
      disabled={props.disabled}
      onValueChange={(v) => {
        props.onChange(v === TOGGLE_ON);
      }}
    >
      <SelectTrigger className={SELECT_TRIGGER_CLASS}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position={SELECT_CONTENT_POSITION}>
        <SelectItem value={TOGGLE_ON}>{props.onLabel}</SelectItem>
        <SelectItem value={TOGGLE_OFF}>{props.offLabel}</SelectItem>
      </SelectContent>
    </Select>
  );
}

interface ModelSelectProps {
  value: string;
  models: ModelInfo[];
  onChange: (model: string) => void;
}

function ModelSelect(props: ModelSelectProps) {
  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger className={SELECT_TRIGGER_CLASS}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position={SELECT_CONTENT_POSITION}>
        {props.models.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {modelLabel(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface PresetSelectProps {
  presets: { id: string; name: string }[];
  presetId: string;
  onChange: (id: string) => void;
}

function PresetSelect({ presets, presetId, onChange }: PresetSelectProps) {
  const selectedValue =
    presetId !== "" && presets.some((p) => p.id === presetId) ? presetId : NO_PRESET_VALUE;
  return (
    <Select
      value={selectedValue}
      onValueChange={(v) => {
        onChange(v === NO_PRESET_VALUE ? "" : v);
      }}
    >
      <SelectTrigger className={SELECT_TRIGGER_CLASS}>
        <SelectValue placeholder="Препромпт" />
      </SelectTrigger>
      <SelectContent position={SELECT_CONTENT_POSITION}>
        <SelectItem value={NO_PRESET_VALUE}>Без препромпта</SelectItem>
        {presets.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name || "Без имени"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type ComposerControlsProps = Pick<
  ComposerProps,
  | "onClear"
  | "showRetry"
  | "onRetry"
  | "webSearch"
  | "onWebSearchChange"
  | "model"
  | "onModelChange"
  | "thinkingEnabled"
  | "onThinkingChange"
  | "presets"
  | "presetId"
  | "onPresetChange"
  | "streaming"
  | "onStop"
  | "onSend"
> & {
  hasContext: boolean;
  onOpenContext: () => void;
  modelOptions: ModelInfo[];
  thinkingDisabled: boolean;
};

function ComposerControls(props: ComposerControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" className={CONTROL_WIDTH_CLASS} onClick={props.onClear}>
        Очистить
      </Button>
      <Button variant="ghost" size="sm" className="min-w-[96px]" onClick={props.onOpenContext}>
        {props.hasContext ? "Контекст •" : "Контекст"}
      </Button>
      <div className="flex-1" />
      {props.showRetry && (
        <Button variant="ghost" size="sm" className={CONTROL_WIDTH_CLASS} onClick={props.onRetry}>
          Повторить
        </Button>
      )}
      <ToggleSelect
        value={props.webSearch}
        onChange={props.onWebSearchChange}
        onLabel="Веб-поиск"
        offLabel="Без поиска"
      />
      <ModelSelect models={props.modelOptions} value={props.model} onChange={props.onModelChange} />
      <ToggleSelect
        value={props.thinkingEnabled}
        disabled={props.thinkingDisabled}
        onChange={props.onThinkingChange}
        onLabel="Thinking"
        offLabel="Без thinking"
      />
      <PresetSelect
        presets={props.presets}
        presetId={props.presetId}
        onChange={props.onPresetChange}
      />
      {props.streaming && (
        <Button
          variant="destructive"
          size="sm"
          className={CONTROL_WIDTH_CLASS}
          onClick={props.onStop}
        >
          Стоп
        </Button>
      )}
      <Button
        size="sm"
        className={CONTROL_WIDTH_CLASS}
        onClick={props.onSend}
        disabled={props.streaming}
      >
        Отправить
      </Button>
    </div>
  );
}

interface ChatContextDialogProps {
  open: boolean;
  draft: string;
  onDraftChange: (draft: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

function ChatContextDialog(props: ChatContextDialogProps) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Контекст чата</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-muted-foreground">
          Постоянный справочный текст этого чата (вакансия, резюме, конспект…) — уходит в системный
          промпт каждого запроса и сохраняется на диск.
        </p>
        <Textarea
          rows={10}
          value={props.draft}
          onChange={(e) => {
            props.onDraftChange(e.target.value);
          }}
          placeholder="Вставь сюда справочные материалы"
          className="field-sizing-fixed max-h-64 overflow-y-auto"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={props.onCancel}>
            Отмена
          </Button>
          <Button onClick={props.onSave}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Composer(props: ComposerProps) {
  const modelOptions = selectableModels(props.models, props.model);
  const thinkingDisabled = thinkingLocked(modelOptions, props.model);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextDraft, setContextDraft] = useState("");
  const openContextDialog = () => {
    setContextDraft(props.context);
    setContextOpen(true);
  };
  const closeContextDialog = () => {
    setContextOpen(false);
  };
  const saveContext = () => {
    props.onContextChange(contextDraft);
    setContextOpen(false);
  };
  return (
    <section className="flex flex-col gap-2.5">
      <PromptField
        value={props.value}
        onChange={props.onChange}
        attachments={props.attachments}
        onRemoveAttachment={props.onRemoveAttachment}
        onPaste={props.onPaste}
        onSend={props.onSend}
        hotkey={props.hotkey}
      />
      <ComposerControls
        onClear={props.onClear}
        hasContext={props.context.trim() !== ""}
        onOpenContext={openContextDialog}
        showRetry={props.showRetry}
        onRetry={props.onRetry}
        webSearch={props.webSearch}
        onWebSearchChange={props.onWebSearchChange}
        model={props.model}
        modelOptions={modelOptions}
        onModelChange={props.onModelChange}
        thinkingEnabled={props.thinkingEnabled}
        thinkingDisabled={thinkingDisabled}
        onThinkingChange={props.onThinkingChange}
        presets={props.presets}
        presetId={props.presetId}
        onPresetChange={props.onPresetChange}
        streaming={props.streaming}
        onStop={props.onStop}
        onSend={props.onSend}
      />
      <ChatContextDialog
        open={contextOpen}
        draft={contextDraft}
        onDraftChange={setContextDraft}
        onCancel={closeContextDialog}
        onSave={saveContext}
      />
    </section>
  );
}
