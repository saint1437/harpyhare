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

  const finishEdit = () => {
    if (editingId !== null && !cancelRef.current) onRename(editingId, draft);
    cancelRef.current = false;
    setEditingId(null);
  };

  const cancelEdit = () => {
    cancelRef.current = true;
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      {chats.map((c, i) => (
        <ChatTab
          key={c.id}
          chat={c}
          fallbackTitle={`Чат ${i + 1}`}
          isActive={c.id === activeId}
          isEditing={editingId === c.id}
          isStreaming={streaming[c.id]}
          showRemove={chats.length > 1}
          draft={draft}
          onDraftChange={setDraft}
          onSelect={() => {
            onSelect(c.id);
          }}
          onStartEdit={() => {
            startEdit(c);
          }}
          onRemove={() => {
            onRemove(c.id);
          }}
          onFinishEdit={finishEdit}
          onCancelEdit={cancelEdit}
        />
      ))}
      <NewChatButton disabled={chats.length >= CHAT_LIMIT} onClick={onNew} />
    </div>
  );
}

interface ChatTabProps {
  chat: Chat;
  fallbackTitle: string;
  isActive: boolean;
  isEditing: boolean;
  isStreaming: boolean | undefined;
  showRemove: boolean;
  draft: string;
  onDraftChange: (title: string) => void;
  onSelect: () => void;
  onStartEdit: () => void;
  onRemove: () => void;
  onFinishEdit: () => void;
  onCancelEdit: () => void;
}

function ChatTab({
  chat,
  fallbackTitle,
  isActive,
  isEditing,
  isStreaming,
  showRemove,
  draft,
  onDraftChange,
  onSelect,
  onStartEdit,
  onRemove,
  onFinishEdit,
  onCancelEdit,
}: ChatTabProps) {
  return (
    <div
      className={cn(
        "group relative flex shrink-0 items-center rounded-md transition-colors",
        isActive ? "bg-white/10" : "hover:bg-white/5",
      )}
    >
      {isEditing ? (
        <RenameInput
          value={draft}
          onChange={onDraftChange}
          onFinish={onFinishEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={onStartEdit}
          title={`${chat.title} — двойной клик: переименовать`}
          className={cn(
            "flex items-center gap-1.5 rounded-md py-1 pr-2 pl-2.5 font-mono text-[11px]",
            isActive ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {isStreaming && (
            <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
          )}
          <span className="max-w-[88px] truncate">{chat.title || fallbackTitle}</span>
        </button>
      )}
      {!isEditing && showRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Удалить ${chat.title}`}
          className="mr-1 grid size-4 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

function RenameInput({
  value,
  onChange,
  onFinish,
  onCancel,
}: {
  value: string;
  onChange: (title: string) => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      onBlur={onFinish}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
          e.currentTarget.blur();
        }
      }}
      onFocus={(e) => {
        e.currentTarget.select();
      }}
      aria-label="Имя чата"
      className="w-[100px] rounded-md bg-transparent px-2.5 py-1 font-mono text-[11px] text-foreground ring-1 ring-primary/60 outline-none ring-inset"
    />
  );
}

function NewChatButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Новый чат"
      className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Plus className="size-3.5" />
    </button>
  );
}
