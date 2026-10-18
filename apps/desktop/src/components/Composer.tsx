import { memo, useCallback, useRef, useState, type RefObject } from "react";
import { ChatContextDialog } from "@/components/ChatContextDialog";
import { ActionGroup } from "@/components/composer/ActionGroup";
import { AttachmentList } from "@/components/composer/AttachmentList";
import { ComposerToolbar } from "@/components/composer/ComposerToolbar";
import { PROMPT_ROW_HEIGHT_PX, PromptTextarea } from "@/components/PromptTextarea";
import { useComposerEngagement } from "@/hooks/useComposerEngagement";
import { useComposerZone } from "@/hooks/useComposerZone";
import type { QuickAction } from "@/ipc/types";
import type { Chat, ChatPatch } from "@/lib/chats";
import { selectableModels, thinkingLocked, type ModelInfo } from "@/lib/models";
import type { Pipeline } from "@/lib/pipeline-types";
import { cn } from "@/lib/utils";
import { QuickActionsBar } from "./QuickActionsBar";

export interface ComposerProps {
  chat: Chat;
  onPatch: (chatId: string, patch: ChatPatch) => void;
  onRemoveAttachment: (index: number) => void;
  onPaste: (items: DataTransferItemList) => void;
  onSend: () => void;
  onStop: () => void;
  onClearHistory: () => void;
  onRetry: () => void;
  onRestoreFocus: () => void;
  /** How far the open card reaches above the composer's slot; the chat ledger pads by it. */
  onOverflowChange: (px: number) => void;
  retryLabel: string;
  streaming: boolean;
  showRetry: boolean;
  presets: { id: string; name: string }[];
  pipelines: Pipeline[];
  pipelinesReady: boolean;
  models: ModelInfo[];
  modelProvidersMissingKey: readonly string[];
  onCaptureRegion: () => void;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  quickActions: QuickAction[];
  quickActionCombo: string;
  onQuickAction: (action: QuickAction) => void;
}

/** Keep the card's corners independent of its measured content height. */
const CARD_RADIUS_PX = PROMPT_ROW_HEIGHT_PX / 2;
/** Between the quick actions and the card, when the actions are there. */
const BAR_GAP_PX = 6;
/** Opening and closing overshoot a little, like a sheet; typing grows the card plainly. */
const OPEN_CLOSE_TRANSITION = "height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
const GROW_TRANSITION = "height 0.15s ease-out";
/** Room the field and the toolbar leave for the buttons pinned into the card's corner. */
const ACTION_ROOM_CLASS = "pr-12";
const ACTION_ROOM_WITH_RETRY_CLASS = "pr-20";

/**
 * The input and toolbar are permanent bottom rows, including when the draft
 * is empty, unfocused or just sent. Extra content can open upward over the
 * ledger; `useComposerZone` reserves both permanent rows and reports only
 * that extra overhang for the ledger's bottom inset.
 *
 * `memo`: во время стрима `App` рендерится на каждый rAF-кадр раскрытия, а
 * входы композера при этом не меняются. Работает, пока App передаёт
 * стабильные колбэки — inline-стрелка в пропсах сведёт мемоизацию на нет.
 */
export const Composer = memo(function Composer(props: ComposerProps) {
  const { chat, onPatch, onRestoreFocus, onSend, promptRef } = props;
  const modelOptions = selectableModels(props.models, chat.model);
  const thinkingDisabled = thinkingLocked(modelOptions, chat.model);
  const [contextOpen, setContextOpen] = useState(false);
  const hasContent = chat.draft !== "" || chat.draftAttachments.length > 0;
  const { expanded, switching, send, onCardFocus, onCardMouseDown, onCardBlur, disengage } =
    useComposerEngagement({ promptRef, onRestoreFocus, onSend, hasContent });

  const cardRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { slot, cardHeight } = useComposerZone(
    { card: cardRef, row: rowRef, content: contentRef, bar: barRef, toolbar: toolbarRef },
    expanded,
    BAR_GAP_PX,
    props.onOverflowChange,
  );
  const transition = switching ? OPEN_CLOSE_TRANSITION : GROW_TRANSITION;
  const onParamsClosed = useCallback(
    (pressedOutside: Element | null) => {
      // The keyboard, the trigger or a press on the card itself: the caret
      // comes back to the field. A press elsewhere chose its own focus — or
      // started a text selection in the ledger that a jumping caret would cut —
      // and the card treats it as the caret leaving.
      if (pressedOutside === null || cardRef.current?.contains(pressedOutside)) onRestoreFocus();
      else disengage();
    },
    [onRestoreFocus, disengage],
  );

  const openContextDialog = useCallback(() => {
    setContextOpen(true);
  }, []);
  const closeContextDialog = useCallback(() => {
    setContextOpen(false);
    onRestoreFocus();
  }, [onRestoreFocus]);
  const onDraftChange = useCallback(
    (draft: string) => {
      onPatch(chat.id, { draft });
    },
    [onPatch, chat.id],
  );

  const actionRoom = props.showRetry ? ACTION_ROOM_WITH_RETRY_CLASS : ACTION_ROOM_CLASS;
  return (
    <section className="relative shrink-0" style={{ height: slot ?? undefined }}>
      <div
        className={cn(
          "z-10 flex flex-col",
          // In the flow until the first measurement, then anchored to the slot's bottom edge.
          slot !== null && "absolute inset-x-0 bottom-0",
        )}
        style={{ gap: BAR_GAP_PX }}
      >
        <div ref={barRef} className="empty:hidden">
          <QuickActionsBar
            actions={props.quickActions}
            combo={props.quickActionCombo}
            disabled={props.streaming}
            onRun={props.onQuickAction}
          />
        </div>
        <div
          ref={cardRef}
          data-expanded={expanded}
          className="relative overflow-hidden bg-card/70 shadow-raise ring-1 ring-border ring-inset focus-within:ring-ring/60 motion-reduce:transition-none"
          style={{ height: cardHeight ?? undefined, borderRadius: CARD_RADIUS_PX, transition }}
          onMouseDown={onCardMouseDown}
          onFocus={onCardFocus}
          onBlur={onCardBlur}
        >
          <div ref={contentRef}>
            <div ref={rowRef} className="flex">
              <PromptTextarea
                fieldRef={promptRef}
                value={chat.draft}
                onChange={onDraftChange}
                onPaste={props.onPaste}
                onSend={send}
                className={actionRoom}
              />
            </div>
            <AttachmentList
              attachments={chat.draftAttachments}
              onRemove={props.onRemoveAttachment}
            />
            <ComposerToolbar
              ref={toolbarRef}
              className={actionRoom}
              chat={chat}
              onPatch={onPatch}
              onClearHistory={props.onClearHistory}
              hasContext={chat.context.trim() !== ""}
              onOpenContext={openContextDialog}
              modelOptions={modelOptions}
              modelProvidersMissingKey={props.modelProvidersMissingKey}
              thinkingDisabled={thinkingDisabled}
              presets={props.presets}
              pipelines={props.pipelines}
              pipelinesReady={props.pipelinesReady}
              streaming={props.streaming}
              onCaptureRegion={props.onCaptureRegion}
              onClosed={onParamsClosed}
            />
          </div>
          <ActionGroup
            streaming={props.streaming}
            showRetry={props.showRetry}
            retryLabel={props.retryLabel}
            canSend={hasContent}
            onStop={props.onStop}
            onRetry={props.onRetry}
            onSend={send}
          />
        </div>
      </div>
      <ChatContextDialog
        open={contextOpen}
        chat={chat}
        onPatch={onPatch}
        onClose={closeContextDialog}
        onRestoreFocus={onRestoreFocus}
      />
    </section>
  );
});
