import { Plus, X } from "lucide-react";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import { CHAT_LIMIT, type Chat } from "@/lib/chats";
import { cn } from "@/lib/utils";

export const TAB_RAIL_WIDTH_PX = 28;

export interface TabRailProps {
  chats: Chat[];
  activeId: string;
  streaming: Record<string, boolean>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onNew: () => void;
}

export function TabRail({ chats, activeId, streaming, onSelect, onRemove, onNew }: TabRailProps) {
  const onDragMouseDown = useWindowDrag();
  return (
    <nav
      aria-label="Чаты"
      className="flex shrink-0 flex-col items-center gap-1"
      style={{ width: TAB_RAIL_WIDTH_PX }}
      onMouseDown={onDragMouseDown}
    >
      {chats.map((c, i) => (
        <TabRailItem
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

interface TabRailItemProps {
  number: number;
  title: string;
  isActive: boolean;
  isStreaming: boolean;
  closable: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function TabRailItem({
  number,
  title,
  isActive,
  isStreaming,
  closable,
  onSelect,
  onRemove,
}: TabRailItemProps) {
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
