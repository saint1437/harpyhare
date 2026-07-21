import {
  ArrowUp,
  Check,
  Eraser,
  NotebookText,
  RotateCcw,
  SlidersHorizontal,
  Square,
} from "lucide-react";
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
import {
  docsInFolder,
  rootDocs,
  type ContextDoc,
  type ContextLibrary,
} from "@/lib/context-library";
import { modelLabel, selectableModels, thinkingLocked, type ModelInfo } from "@/lib/models";
import { cn } from "@/lib/utils";
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
  library: ContextLibrary;
  libraryDocIds: string[];
  onLibraryDocsChange: (ids: string[]) => void;
  contextUsage: ContextUsage | null;
  models: ModelInfo[];
  disabled: boolean;
}

export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
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

const CONTEXT_USAGE_WARN_PERCENT = 80;
const CONTEXT_GAUGE_MIN_FILL_PERCENT = 3;
const PERCENT_SCALE = 100;

function ContextUsageGauge({ usage }: { usage: ContextUsage }) {
  const percent = Math.min(
    PERCENT_SCALE,
    Math.round((usage.usedTokens / usage.maxTokens) * PERCENT_SCALE),
  );
  const title = `Контекст чата: ${usage.usedTokens.toLocaleString("ru-RU")} из ${usage.maxTokens.toLocaleString("ru-RU")} токенов (по последнему запросу)`;
  return (
    <div className="flex shrink-0 items-center gap-1.5 px-1" title={title}>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-white/10">
        <span
          className={cn(
            "block h-full rounded-full",
            percent >= CONTEXT_USAGE_WARN_PERCENT ? "bg-recording" : "bg-muted-foreground/60",
          )}
          style={{ width: `${String(Math.max(CONTEXT_GAUGE_MIN_FILL_PERCENT, percent))}%` }}
        />
      </span>
      <span className="text-[10px] text-muted-foreground">{percent}%</span>
    </div>
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
          <SlidersHorizontal className="size-4" />
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
  Pick<
    ComposerProps,
    "onClear" | "showRetry" | "onRetry" | "streaming" | "onStop" | "onSend" | "contextUsage"
  > & {
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
        <Eraser className="size-4" />
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
        <NotebookText className="size-4" />
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
      {props.contextUsage && <ContextUsageGauge usage={props.contextUsage} />}
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
          <RotateCcw className="size-4" />
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
          <Square className="size-3.5 fill-current" />
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
          <ArrowUp className="size-4" />
        </Button>
      )}
    </div>
  );
}

interface ChatContextDialogProps {
  open: boolean;
  draft: string;
  library: ContextLibrary;
  selectedDocIds: string[];
  onDraftChange: (draft: string) => void;
  onToggleDoc: (id: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

function LibraryDocToggle({
  doc,
  selected,
  onToggle,
}: {
  doc: ContextDoc;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] transition-colors ${
        selected ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5"
      }`}
    >
      <Check className={`size-3.5 shrink-0 ${selected ? "" : "opacity-0"}`} />
      <span className="min-w-0 truncate">{doc.name}</span>
    </button>
  );
}

function LibraryPicker({
  library,
  selectedDocIds,
  onToggleDoc,
}: {
  library: ContextLibrary;
  selectedDocIds: string[];
  onToggleDoc: (id: string) => void;
}) {
  if (library.docs.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Библиотека пуста — материалы добавляются в Настройках, вкладка «Контексты».
      </p>
    );
  }
  const selected = new Set(selectedDocIds);
  const groups = [
    { id: "", name: library.folders.length > 0 ? "Без папки" : "", docs: rootDocs(library) },
    ...library.folders.map((f) => ({ id: f.id, name: f.name, docs: docsInFolder(library, f.id) })),
  ].filter((g) => g.docs.length > 0);
  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
      {groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-0.5">
          {g.name !== "" && (
            <span className="px-2 pt-1 text-[10.5px] font-medium text-foreground/55">{g.name}</span>
          )}
          {g.docs.map((doc) => (
            <LibraryDocToggle
              key={doc.id}
              doc={doc}
              selected={selected.has(doc.id)}
              onToggle={() => {
                onToggleDoc(doc.id);
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
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
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium text-foreground/55">Из библиотеки</span>
          <LibraryPicker
            library={props.library}
            selectedDocIds={props.selectedDocIds}
            onToggleDoc={props.onToggleDoc}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium text-foreground/55">Свой текст</span>
          <p className="text-[11px] text-muted-foreground">
            Уникальный справочный текст этого чата — уходит в системный промпт каждого запроса
            вместе с выбранными материалами.
          </p>
          <Textarea
            rows={6}
            value={props.draft}
            onChange={(e) => {
              props.onDraftChange(e.target.value);
            }}
            placeholder="Вставь сюда справочные материалы"
            className="field-sizing-fixed max-h-40 overflow-y-auto"
          />
        </div>
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
  const [selectedDraft, setSelectedDraft] = useState<string[]>([]);
  const openContextDialog = () => {
    setContextDraft(props.context);
    setSelectedDraft(props.libraryDocIds);
    setContextOpen(true);
  };
  const closeContextDialog = () => {
    setContextOpen(false);
  };
  const toggleSelectedDoc = (id: string) => {
    setSelectedDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const saveContext = () => {
    props.onContextChange(contextDraft);
    props.onLibraryDocsChange(selectedDraft);
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
          hasContext={props.context.trim() !== "" || props.libraryDocIds.length > 0}
          onOpenContext={openContextDialog}
          contextUsage={props.contextUsage}
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
        library={props.library}
        selectedDocIds={selectedDraft}
        onDraftChange={setContextDraft}
        onToggleDoc={toggleSelectedDoc}
        onCancel={closeContextDialog}
        onSave={saveContext}
      />
    </section>
  );
}
