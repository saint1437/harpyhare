import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { CHAT_LIMIT, type Chat } from "@/lib/chats";
import { cn } from "@/lib/utils";

export interface ChatTabsProps {
  chats: Chat[];
  activeId: string;
  streaming: Record<string, boolean>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onNew: () => void;
  /** Переименование чата (пустое имя игнорируется владельцем). */
  onRename: (id: string, title: string) => void;
}

export function ChatTabs({
  chats,
  activeId,
  streaming,
  onSelect,
  onRemove,
  onNew,
  onRename,
}: ChatTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const cancelRef = useRef(false);

  const startEdit = (c: Chat) => {
    cancelRef.current = false;
    setDraft(c.title);
    setEditingId(c.id);
  };

  // Вызывается из onBlur (в т.ч. после Enter/Escape — оба делают input.blur()).
  const finishEdit = () => {
    if (editingId !== null && !cancelRef.current) onRename(editingId, draft);
    cancelRef.current = false;
    setEditingId(null);
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      {chats.map((c, i) => {
        const isActive = c.id === activeId;
        const isEditing = editingId === c.id;
        return (
          <div
            key={c.id}
            className={cn(
              "group relative flex shrink-0 items-center rounded-md transition-colors",
              isActive ? "bg-white/10" : "hover:bg-white/5",
            )}
          >
            {isEditing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                }}
                onBlur={finishEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelRef.current = true;
                    e.currentTarget.blur();
                  }
                }}
                onFocus={(e) => {
                  e.currentTarget.select();
                }}
                aria-label="Имя чата"
                className="w-[100px] rounded-md bg-transparent px-2.5 py-1 font-mono text-[11px] text-foreground ring-1 ring-primary/60 outline-none ring-inset"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  onSelect(c.id);
                }}
                onDoubleClick={() => {
                  startEdit(c);
                }}
                title={`${c.title} — двойной клик: переименовать`}
                className={cn(
                  "flex items-center gap-1.5 rounded-md py-1 pr-2 pl-2.5 font-mono text-[11px]",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {streaming[c.id] && (
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
                )}
                <span className="max-w-[88px] truncate">{c.title || `Чат ${i + 1}`}</span>
              </button>
            )}
            {!isEditing && chats.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  onRemove(c.id);
                }}
                aria-label={`Удалить ${c.title}`}
                className="mr-1 grid size-4 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-foreground"
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
        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
