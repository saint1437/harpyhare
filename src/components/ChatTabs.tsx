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
    <div className="flex items-center gap-1 min-w-0">
      {chats.map((c, i) => {
        const isActive = c.id === activeId;
        return (
          <div
            key={c.id}
            className={cn(
              "group relative flex items-center shrink-0 rounded-md transition-colors",
              isActive ? "bg-white/10" : "hover:bg-white/5",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              title={c.title}
              className={cn(
                "flex items-center gap-1.5 pl-2.5 pr-2 py-1 font-mono text-[11px] rounded-md",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {streaming[c.id] && (
                <span className="size-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
              )}
              <span className="max-w-[88px] truncate">{c.title || `Чат ${i + 1}`}</span>
            </button>
            {chats.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                aria-label={`Удалить ${c.title}`}
                className="grid place-items-center size-4 mr-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-white/10 transition-opacity"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onNew}
        disabled={chats.length >= CHAT_LIMIT}
        aria-label="Новый чат"
        className="grid place-items-center size-6 shrink-0 rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
