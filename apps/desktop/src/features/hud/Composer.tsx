import {
  ArrowUp,
  Check,
  Crop,
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
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDict } from "@/hooks/useDict";
import { useHotkeyCombos } from "@/hooks/useHotkeyCombos";
import { useModels } from "@/hooks/useModels";
import { useQuickActions } from "@/hooks/useQuickActions";
import type { QuickAction } from "@/ipc/types";
import type { ChatPatch, ChatWithoutDraft } from "@/lib/chats";
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
import { addDraftAttachments } from "@/state/chat-attachments";
import {
  clearMessages,
  patchChat,
  removeDraftAttachment,
  useActiveChatId,
  useActiveChatWithoutDraft,
  useActiveDraft,
  useActiveDraftAttachments,
} from "@/state/chats";
import { useIsStreaming } from "@/state/stream";
import { AttachmentChip } from "./AttachmentChip";
import { QuickActionsBar } from "./QuickActionsBar";

/**
 * What is left after the composer started reading its own slices: the stream's
 * two verbs, the STT retry pair, the caret's ref, the two documents that are
 * still hook-shaped stores (`presets`, `library`) and one callback into the
 * send pipeline. Everything about the CHAT — the draft, its attachments, the
 * request parameters — comes from `state/chats`.
 */
export interface ComposerProps {
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
  showRetry: boolean;
  presets: { id: string; name: string }[];
  library: ContextLibrary;
  onCaptureRegion: () => void;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  onQuickAction: (action: QuickAction) => void;
}

const SELECT_TRIGGER_CLASS = "h-7 w-full text-caption";
const SELECT_CONTENT_POSITION = "popper";
const NO_PRESET_VALUE = "none";

function pasteHasImages(items: DataTransferItemList) {
  return extractImageItems(items).length > 0;
}

type PromptTextareaProps = Pick<ComposerProps, "onSend"> & {
  value: string;
  onChange: (value: string) => void;
  onPaste: (items: DataTransferItemList) => void;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
};

const PROMPT_MAX_HEIGHT_PX = 160;

function usePromptAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Collapsing the box is how its natural height is read at all; what must
    // not happen is writing a height back when it did not change, because the
    // observer below wakes on exactly that write.
    const applied = el.style.height;
    el.style.height = "0px";
    const fitted = `${String(Math.min(el.scrollHeight, PROMPT_MAX_HEIGHT_PX))}px`;
    el.style.height = fitted === applied ? applied : fitted;
  }, [ref]);

  useLayoutEffect(fit, [fit, value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /**
     * `fit` writes the height and the observer wakes on the height — measuring
     * again on our own write is the feedback half of that loop, and it ran on
     * every keystroke. Only a WIDTH change can alter how the text wraps, and a
     * resizable window is the only reason the observer exists.
     */
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      fit();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref, fit]);
}

function PromptTextarea(props: PromptTextareaProps) {
  const placeholder = useDict().hud.composer.promptPlaceholder;
  usePromptAutosize(props.fieldRef, props.value);
  return (
    <Textarea
      ref={props.fieldRef}
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
      placeholder={placeholder}
      className="max-h-40 min-h-9 resize-none overflow-y-auto border-0 bg-transparent py-1.5 text-body focus-visible:outline-none"
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
    <div className="flex flex-wrap gap-1.5 px-2.5 pb-2">
      {attachments.map((att, i) => (
        <AttachmentChip
          key={i}
          attachment={att}
          onRemove={() => {
            onRemove(i);
          }}
        />
      ))}
    </div>
  );
}

interface ParamToggleProps {
  label: string;
  value: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

function ParamToggle(props: ParamToggleProps) {
  return (
    <Switch
      size="sm"
      aria-label={props.label}
      checked={props.value}
      disabled={props.disabled}
      onCheckedChange={props.onChange}
    />
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
  const copy = useDict().hud.composer;
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
        <SelectValue placeholder={copy.params.preset} />
      </SelectTrigger>
      <SelectContent position={SELECT_CONTENT_POSITION}>
        <SelectItem value={NO_PRESET_VALUE}>{copy.noPreset}</SelectItem>
        {presets.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name || copy.unnamedPreset}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ParamRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <Label className="w-20 shrink-0">{label}</Label>
      <div className="flex min-w-0 flex-1 items-center justify-end">{children}</div>
    </div>
  );
}

/**
 * Every control in the composer's toolbar is the same ghost icon button, and its
 * tooltip and its announced name are ONE string by construction. They used to be
 * spelled out side by side on each button, where they could only ever drift
 * apart silently — nothing on screen shows an `aria-label` that stopped matching
 * its `title`. It is deliberately not `IconButton`: that one idles muted
 * (`text-fg-subtle`), and the toolbar sits inside the prompt card at full
 * contrast.
 */
function ToolbarButton({ label, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return <Button variant="ghost" size="icon-compact" title={label} aria-label={label} {...props} />;
}

type RequestParamsProps = Pick<ComposerProps, "presets"> & {
  chat: ChatWithoutDraft;
  onPatch: (patch: ChatPatch) => void;
  modelOptions: ModelInfo[];
  thinkingDisabled: boolean;
};

function RequestParamsPopover(props: RequestParamsProps) {
  const copy = useDict().hud.composer;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolbarButton label={copy.requestParams}>
          <SlidersHorizontal />
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 p-3">
        <div className="flex flex-col gap-1">
          <ParamRow label={copy.params.model}>
            <ModelSelect
              models={props.modelOptions}
              value={props.chat.model}
              onChange={(model) => {
                props.onPatch({ model });
              }}
            />
          </ParamRow>
          <ParamRow label={copy.params.preset}>
            <PresetSelect
              presets={props.presets}
              presetId={props.chat.presetId}
              onChange={(presetId) => {
                props.onPatch({ presetId });
              }}
            />
          </ParamRow>
          <ParamRow label={copy.params.thinking}>
            <ParamToggle
              label={copy.params.thinking}
              value={props.chat.thinkingEnabled}
              disabled={props.thinkingDisabled}
              onChange={(thinkingEnabled) => {
                props.onPatch({ thinkingEnabled });
              }}
            />
          </ParamRow>
          <ParamRow label={copy.params.webSearch}>
            <ParamToggle
              label={copy.params.webSearch}
              value={props.chat.webSearch}
              onChange={(webSearch) => {
                props.onPatch({ webSearch });
              }}
            />
          </ParamRow>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type ComposerToolbarProps = RequestParamsProps &
  Pick<ComposerProps, "showRetry" | "onRetry" | "onStop" | "onSend" | "onCaptureRegion"> & {
    streaming: boolean;
    hasContext: boolean;
    onClearHistory: () => void;
    onOpenContext: () => void;
  };

function ComposerToolbar(props: ComposerToolbarProps) {
  const copy = useDict().hud.composer;
  return (
    <div className="flex items-center gap-1 px-1.5 pb-1.5">
      <ToolbarButton
        label={copy.clearHistory}
        disabled={props.streaming}
        onClick={props.onClearHistory}
      >
        <Eraser />
      </ToolbarButton>
      <ToolbarButton label={copy.context} className="relative" onClick={props.onOpenContext}>
        <NotebookText />
        {props.hasContext && (
          <span
            className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-accent-mark"
            aria-hidden
          />
        )}
      </ToolbarButton>
      <ToolbarButton label={copy.captureRegion} onClick={props.onCaptureRegion}>
        <Crop />
      </ToolbarButton>
      <RequestParamsPopover
        chat={props.chat}
        onPatch={props.onPatch}
        modelOptions={props.modelOptions}
        thinkingDisabled={props.thinkingDisabled}
        presets={props.presets}
      />
      <div className="flex-1" />
      {props.showRetry && (
        <ToolbarButton label={copy.retryTranscription} onClick={props.onRetry}>
          <RotateCcw />
        </ToolbarButton>
      )}
      {props.streaming ? (
        <Button
          variant="destructive"
          size="icon-compact"
          onClick={props.onStop}
          title={copy.stopAnswer}
          aria-label={copy.stopAnswer}
        >
          <Square className="size-3.5 fill-current" />
        </Button>
      ) : (
        <Button
          size="icon-compact"
          onClick={props.onSend}
          title={copy.sendTitle}
          aria-label={copy.send}
        >
          <ArrowUp />
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
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-body transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid",
        selected
          ? "bg-surface-active text-fg"
          : "text-fg-subtle hover:bg-surface active:bg-surface-active",
      )}
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
  const copy = useDict().hud.composer;
  if (library.docs.length === 0) {
    return <p className="text-caption text-fg-subtle">{copy.libraryEmpty}</p>;
  }
  const selected = new Set(selectedDocIds);
  const groups = [
    { id: "", name: library.folders.length > 0 ? copy.noFolder : "", docs: rootDocs(library) },
    ...library.folders.map((f) => ({ id: f.id, name: f.name, docs: docsInFolder(library, f.id) })),
  ].filter((g) => g.docs.length > 0);
  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
      {groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-0.5">
          {g.name !== "" && <SectionLabel className="px-2 pt-1">{g.name}</SectionLabel>}
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
  const dict = useDict();
  const copy = dict.hud.composer;
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <DialogContent className="max-w-[min(480px,95vw)] sm:max-w-[min(480px,95vw)]">
        <DialogHeader>
          <DialogTitle>{copy.context}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{copy.fromLibrary}</SectionLabel>
          <LibraryPicker
            library={props.library}
            selectedDocIds={props.selectedDocIds}
            onToggleDoc={props.onToggleDoc}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{copy.ownText}</SectionLabel>
          <p className="text-caption text-fg-subtle">{copy.ownTextHint}</p>
          <Textarea
            rows={6}
            value={props.draft}
            onChange={(e) => {
              props.onDraftChange(e.target.value);
            }}
            placeholder={copy.contextPlaceholder}
            className="max-h-40 overflow-y-auto"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onCancel}>
            {dict.common.actions.cancel}
          </Button>
          <Button onClick={props.onSave}>{dict.common.actions.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The one component that reads the draft. It lives per chat in `state/chats`,
 * and every keystroke publishes a change — so the subscription belongs HERE and
 * nowhere above: while the draft was a prop threaded down from the HUD's root,
 * typing a character re-rendered the header, the tabs, the status bar and the
 * message list to change one string inside one textarea.
 */
export function Composer(props: ComposerProps) {
  const chatId = useActiveChatId();
  const chat = useActiveChatWithoutDraft();
  const draft = useActiveDraft();
  const attachments = useActiveDraftAttachments();
  const streaming = useIsStreaming(chatId);
  const models = useModels();
  // The same derivation the HUD's root reads for ⌘1…9: one list, one numbering.
  const quickActions = useQuickActions();
  const quickActionCombo = useHotkeyCombos().quick_action;
  const onPatch = useCallback(
    (patch: ChatPatch) => {
      patchChat(chatId, patch);
    },
    [chatId],
  );
  const modelOptions = selectableModels(models, chat.model);
  const thinkingDisabled = thinkingLocked(modelOptions, chat.model);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextDraft, setContextDraft] = useState("");
  const [selectedDraft, setSelectedDraft] = useState<string[]>([]);
  const openContextDialog = () => {
    setContextDraft(chat.context);
    setSelectedDraft(chat.libraryDocIds);
    setContextOpen(true);
  };
  const closeContextDialog = () => {
    setContextOpen(false);
  };
  const toggleSelectedDoc = (id: string) => {
    setSelectedDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const saveContext = () => {
    onPatch({ context: contextDraft, libraryDocIds: selectedDraft });
    setContextOpen(false);
  };
  return (
    <section>
      <QuickActionsBar
        actions={quickActions}
        combo={quickActionCombo}
        disabled={streaming}
        onRun={props.onQuickAction}
      />
      <div className="rounded-xl bg-surface/70 shadow-raise ring-1 ring-inset ring-line transition-[box-shadow] focus-within:ring-focus">
        <PromptTextarea
          fieldRef={props.promptRef}
          value={draft}
          onChange={(next) => {
            onPatch({ draft: next });
          }}
          onPaste={(items) => void addDraftAttachments(chatId, items)}
          onSend={props.onSend}
        />
        <AttachmentList
          attachments={attachments}
          onRemove={(index) => {
            removeDraftAttachment(chatId, index);
          }}
        />
        <ComposerToolbar
          chat={chat}
          onPatch={onPatch}
          onClearHistory={() => {
            clearMessages(chatId);
          }}
          hasContext={chat.context.trim() !== "" || chat.libraryDocIds.length > 0}
          onOpenContext={openContextDialog}
          showRetry={props.showRetry}
          onRetry={props.onRetry}
          modelOptions={modelOptions}
          thinkingDisabled={thinkingDisabled}
          presets={props.presets}
          streaming={streaming}
          onStop={props.onStop}
          onSend={props.onSend}
          onCaptureRegion={props.onCaptureRegion}
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
