import { Plus, X } from "lucide-react";
import { CHAT_LIMIT, type Chat } from "@/lib/chats";
import { cn } from "@/lib/utils";

export interface ChatTabsProps {
  chats: Chat[];
  activeId: string;
  streaming: Record<string, boolean>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onNew: () => void;
}

export function ChatTabs({ chats, activeId, streaming, onSelect, onRemove, onNew }: ChatTabsProps) {
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
      <NewChatButton disabled={chats.length >= CHAT_LIMIT} onClick={onNew} />
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
        "group relative grid size-7 shrink-0 place-items-center rounded-md font-mono text-[11px] transition-colors",
        isActive
          ? "bg-white/10 text-foreground"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
      )}
    >
      <span className={cn(closeOnClick && "group-hover:hidden")}>{number}</span>
      {closeOnClick && <X className="hidden size-3 group-hover:block" />}
      {isStreaming && (
        <span
          className="absolute -top-0.5 -right-0.5 size-1.5 animate-pulse rounded-full bg-primary"
          aria-hidden
        />
      )}
    </button>
  );
}

function NewChatButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Новый чат"
      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Plus className="size-3.5" />
    </button>
  );
}
