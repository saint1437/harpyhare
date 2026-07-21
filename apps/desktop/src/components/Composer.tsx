import { ArrowUp, Eraser, NotebookText, RotateCcw, SlidersHorizontal, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  disabled: boolean;
}

const SELECT_TRIGGER_CLASS = "h-7 w-full text-[11px]";
const ICON_BUTTON_CLASS = "size-7 p-0";
const SELECT_CONTENT_POSITION = "popper";
const TOGGLE_ON = "on";
const TOGGLE_OFF = "off";
const NO_PRESET_VALUE = "none";

function pasteHasImages(items: DataTransferItemList) {
  return extractImageItems(items).length > 0;
}

type PromptTextareaProps = Pick<ComposerProps, "value" | "onChange" | "onPaste" | "onSend">;

const PROMPT_MAX_HEIGHT_PX = 160;

function usePromptAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${String(Math.min(el.scrollHeight, PROMPT_MAX_HEIGHT_PX))}px`;
  }, [ref]);

  useLayoutEffect(fit, [fit, value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref, fit]);
}

function PromptTextarea(props: PromptTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  usePromptAutosize(ref, props.value);
  return (
    <Textarea
      ref={ref}
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
        const sendShortcutPressed = e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing;
        if (sendShortcutPressed) {
          e.preventDefault();
          props.onSend();
        }
      }}
      spellCheck={false}
      placeholder="Расшифровка появится здесь — или напиши вопрос сам"
      className="field-sizing-fixed max-h-40 min-h-9 resize-none overflow-y-auto border-0 bg-transparent py-1.5 text-[13px] shadow-none focus-visible:ring-0 md:text-[13px]"
    />
  );
}

interface AttachmentListProps {
  attachments: Attachment[];
  onRemove: (index: number) => void;
}

function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pb-2">
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
        <SelectItem value={TOGGLE_ON}>Вкл</SelectItem>
        <SelectItem value={TOGGLE_OFF}>Выкл</SelectItem>
      </SelectContent>
    </Select>
  );
}

interface ModelSelectProps {
  value: string;
  models: ModelInfo[];
  onChange: (model: string) => void;
  disabled: boolean;
}

function ModelSelect(props: ModelSelectProps) {
  return (
    <Select value={props.value} disabled={props.disabled} onValueChange={props.onChange}>
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
  disabled: boolean;
}

function PresetSelect({ presets, presetId, onChange, disabled }: PresetSelectProps) {
  const selectedValue =
    presetId !== "" && presets.some((p) => p.id === presetId) ? presetId : NO_PRESET_VALUE;
  return (
    <Select
      value={selectedValue}
      disabled={disabled}
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

function ParamRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[76px] shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

type RequestParamsProps = Pick<
  ComposerProps,
  | "webSearch"
  | "onWebSearchChange"
  | "model"
  | "onModelChange"
  | "thinkingEnabled"
  | "onThinkingChange"
  | "presets"
  | "presetId"
  | "onPresetChange"
  | "disabled"
> & {
  modelOptions: ModelInfo[];
  thinkingDisabled: boolean;
};

function RequestParamsPopover(props: RequestParamsProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={ICON_BUTTON_CLASS}
          disabled={props.disabled}
          title="Параметры запроса"
          aria-label="Параметры запроса"
        >
          <SlidersHorizontal className="size-4.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-60 p-2.5">
        <div className="flex flex-col gap-1.5">
          <ParamRow label="Модель">
            <ModelSelect
              models={props.modelOptions}
              value={props.model}
              disabled={props.disabled}
              onChange={props.onModelChange}
            />
          </ParamRow>
          <ParamRow label="Thinking">
            <ToggleSelect
              value={props.thinkingEnabled}
              disabled={props.disabled || props.thinkingDisabled}
              onChange={props.onThinkingChange}
            />
          </ParamRow>
          <ParamRow label="Веб-поиск">
            <ToggleSelect
              value={props.webSearch}
              disabled={props.disabled}
              onChange={props.onWebSearchChange}
            />
          </ParamRow>
          <ParamRow label="Препромпт">
            <PresetSelect
              presets={props.presets}
              presetId={props.presetId}
              disabled={props.disabled}
              onChange={props.onPresetChange}
            />
          </ParamRow>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type ComposerToolbarProps = RequestParamsProps &
  Pick<ComposerProps, "onClear" | "showRetry" | "onRetry" | "streaming" | "onStop" | "onSend"> & {
    hasContext: boolean;
    onOpenContext: () => void;
  };

function ComposerToolbar(props: ComposerToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-1.5 pb-1.5">
      <Button
        variant="ghost"
        size="sm"
        className={ICON_BUTTON_CLASS}
        disabled={props.disabled}
        onClick={props.onClear}
        title="Очистить черновик"
        aria-label="Очистить черновик"
      >
        <Eraser className="size-4.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`relative ${ICON_BUTTON_CLASS}`}
        disabled={props.disabled}
        onClick={props.onOpenContext}
        title="Контекст чата"
        aria-label="Контекст чата"
      >
        <NotebookText className="size-4.5" />
        {props.hasContext && (
          <span
            className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary"
            aria-hidden
          />
        )}
      </Button>
      <RequestParamsPopover
        webSearch={props.webSearch}
        onWebSearchChange={props.onWebSearchChange}
        model={props.model}
        modelOptions={props.modelOptions}
        onModelChange={props.onModelChange}
        thinkingEnabled={props.thinkingEnabled}
        thinkingDisabled={props.thinkingDisabled}
        onThinkingChange={props.onThinkingChange}
        presets={props.presets}
        presetId={props.presetId}
        onPresetChange={props.onPresetChange}
        disabled={props.disabled}
      />
      <div className="flex-1" />
      {props.showRetry && (
        <Button
          variant="ghost"
          size="sm"
          className={ICON_BUTTON_CLASS}
          disabled={props.disabled}
          onClick={props.onRetry}
          title="Повторить распознавание"
          aria-label="Повторить распознавание"
        >
          <RotateCcw className="size-4.5" />
        </Button>
      )}
      {props.streaming ? (
        <Button
          variant="destructive"
          size="sm"
          className={ICON_BUTTON_CLASS}
          onClick={props.onStop}
          title="Остановить ответ"
          aria-label="Остановить ответ"
        >
          <Square className="size-4 fill-current" />
        </Button>
      ) : (
        <Button
          size="sm"
          className={ICON_BUTTON_CLASS}
          onClick={props.onSend}
          disabled={props.disabled}
          title="Отправить (⏎)"
          aria-label="Отправить"
        >
          <ArrowUp className="size-4.5" />
        </Button>
      )}
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
      <DialogContent className="max-w-[min(480px,95vw)] sm:max-w-[min(480px,95vw)]">
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
    <section>
      <div className="rounded-xl bg-card/60 ring-1 ring-border transition-[box-shadow] ring-inset focus-within:ring-primary/50">
        <PromptTextarea
          value={props.value}
          onChange={props.onChange}
          onPaste={props.onPaste}
          onSend={props.onSend}
        />
        <AttachmentList attachments={props.attachments} onRemove={props.onRemoveAttachment} />
        <ComposerToolbar
          disabled={props.disabled}
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
      </div>
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
