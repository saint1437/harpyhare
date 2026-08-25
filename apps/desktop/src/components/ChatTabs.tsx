import { CopyPlus, Plus, X } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { CHAT_LIMIT, type Chat } from "@/lib/chats";
import { formatCombo } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";

export interface ChatTabsProps {
  chats: Chat[];
  activeId: string;
  streaming: Record<string, boolean>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onNew: () => void;
  onDuplicate: () => void;
  duplicateCombo: string;
}

export function ChatTabs({
  chats,
  activeId,
  streaming,
  onSelect,
  onRemove,
  onNew,
  onDuplicate,
  duplicateCombo,
}: ChatTabsProps) {
  const atLimit = chats.length >= CHAT_LIMIT;
  return (
    <nav
      aria-label="Чаты"
      className="no-scrollbar flex min-w-0 shrink items-center gap-1 overflow-x-auto"
    >
      {chats.map((c, i) => (
        <ChatTab
          key={c.id}
          number={i + 1}
          title={c.title}
          isActive={c.id === activeId}
          isStreaming={!!streaming[c.id]}
          closable={chats.length > 1}
          onSelect={() => {
            onSelect(c.id);
          }}
          onRemove={() => {
            onRemove(c.id);
          }}
        />
      ))}
      <NewChatButton disabled={atLimit} onClick={onNew} />
      <DuplicateChatButton disabled={atLimit} combo={duplicateCombo} onClick={onDuplicate} />
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
  const closeOnClick = isActive && closable;
  return (
    <button
      type="button"
      onClick={closeOnClick ? onRemove : onSelect}
      title={title || `Чат ${String(number)}`}
      aria-label={closeOnClick ? `Закрыть чат ${String(number)}` : `Чат ${String(number)}`}
      className={cn(
        "group relative grid size-6.5 shrink-0 place-items-center rounded-md font-mono text-caption transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
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
  return (
    <IconButton title="Новый чат" onClick={onClick} disabled={disabled} className="shrink-0">
      <Plus />
    </IconButton>
  );
}

const DUPLICATE_TITLE = "Дубликат чата — те же параметры, без сообщений";

function duplicateTitle(combo: string): string {
  const formatted = formatCombo(combo);
  return formatted === "" ? DUPLICATE_TITLE : `${DUPLICATE_TITLE} (${formatted})`;
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
  return (
    <IconButton
      title={duplicateTitle(combo)}
      onClick={onClick}
      disabled={disabled}
      className="shrink-0"
    >
      <CopyPlus />
    </IconButton>
  );
}
