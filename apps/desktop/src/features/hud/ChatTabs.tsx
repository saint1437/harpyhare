import { CopyPlus, Plus, X } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { useDict } from "@/hooks/useDict";
import { format } from "@/i18n";
import { CHAT_LIMIT } from "@/lib/chats";
import { withComboHint } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";
import {
  duplicateChat,
  newChat,
  removeChat,
  selectChat,
  useActiveChatId,
  useChatTabs,
} from "@/state/chats";
import { useStreamingFlags } from "@/state/stream";

export interface ChatTabsProps {
  /**
   * Closing a tab stops its stream first, and the stream API belongs to the
   * root's `useClaudeStream` — the one thing here that a selector cannot fetch.
   */
  onStopStream: (chatId: string) => void;
  duplicateCombo: string;
}

/**
 * Reads the two slices it draws instead of taking them as props: the tab list
 * (`{id, title}` per chat, cached by identity in `state/chats`) and the busy
 * flags (`state/stream`). Neither a keystroke in the composer nor a frame of
 * the stream reveal changes either of them, so the tabs sit both of them out.
 */
export function ChatTabs({ onStopStream, duplicateCombo }: ChatTabsProps) {
  const copy = useDict().hud.chatTabs;
  const tabs = useChatTabs();
  const activeId = useActiveChatId();
  const streaming = useStreamingFlags();
  const atLimit = tabs.length >= CHAT_LIMIT;
  return (
    <nav
      aria-label={copy.label}
      className="no-scrollbar flex min-w-0 shrink items-center gap-1 overflow-x-auto"
    >
      {tabs.map((tab, i) => (
        <ChatTab
          key={tab.id}
          number={i + 1}
          title={tab.title}
          isActive={tab.id === activeId}
          isStreaming={!!streaming[tab.id]}
          closable={tabs.length > 1}
          onSelect={() => {
            selectChat(tab.id);
          }}
          onRemove={() => {
            onStopStream(tab.id);
            removeChat(tab.id);
          }}
        />
      ))}
      <NewChatButton disabled={atLimit} onClick={newChat} />
      <DuplicateChatButton
        disabled={atLimit}
        combo={duplicateCombo}
        onClick={() => {
          duplicateChat(activeId);
        }}
      />
    </nav>
  );
}

interface ChatTabProps {
  number: number;
  title: string;
  isActive: boolean;
  isStreaming: boolean;
  closable: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function ChatTab({
  number,
  title,
  isActive,
  isStreaming,
  closable,
  onSelect,
  onRemove,
}: ChatTabProps) {
  const copy = useDict().hud.chatTabs;
  const position = { number: String(number) };
  const closeOnClick = isActive && closable;
  return (
    <button
      type="button"
      onClick={closeOnClick ? onRemove : onSelect}
      title={title || format(copy.chat, position)}
      aria-label={format(closeOnClick ? copy.closeChat : copy.chat, position)}
      className={cn(
        "group relative grid size-6.5 shrink-0 place-items-center rounded-md font-mono text-caption transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid",
        isActive
          ? "bg-surface-active text-fg ring-1 ring-inset ring-line"
          : "text-fg-subtle hover:bg-surface hover:text-fg active:bg-surface-active",
      )}
    >
      <span className={cn("tabular-nums", closeOnClick && "group-hover:hidden")}>{number}</span>
      {closeOnClick && <X className="hidden size-3.5 group-hover:block" />}
      {isStreaming && (
        <span
          className="absolute -top-0.5 -right-0.5 size-1.5 animate-pulse rounded-full bg-accent-mark"
          aria-hidden
        />
      )}
    </button>
  );
}

function NewChatButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const label = useDict().hud.chatTabs.newChat;
  return (
    <IconButton title={label} onClick={onClick} disabled={disabled} className="shrink-0">
      <Plus />
    </IconButton>
  );
}

function DuplicateChatButton({
  disabled,
  combo,
  onClick,
}: {
  disabled: boolean;
  combo: string;
  onClick: () => void;
}) {
  const label = useDict().hud.chatTabs.duplicate;
  return (
    <IconButton
      title={withComboHint(label, combo)}
      onClick={onClick}
      disabled={disabled}
      className="shrink-0"
    >
      <CopyPlus />
    </IconButton>
  );
}
