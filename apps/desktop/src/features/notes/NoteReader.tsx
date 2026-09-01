import { ArrowLeft, Check, Copy, Plus } from "lucide-react";
import { useMemo } from "react";
import { IconButton } from "@/components/IconButton";
import { markdownComponents, PROSE_MARKDOWN_CLASS } from "@/components/markdown-config";
import { MarkdownChunk } from "@/components/MarkdownChunk";
import type { ContextDoc } from "@/lib/context-library";
import { noteMatchCount } from "@/lib/notes-excerpt";
import { cn } from "@/lib/utils";
import { ADD_TO_CONTEXT_TITLE, REMOVE_FROM_CONTEXT_TITLE } from "./NoteResultRow";

const BACK_TITLE = "Назад к списку (Esc)";
const COPY_TITLE = "Копировать текст заметки";
const MATCHES_LABEL = "Совпадений:";
const EMPTY_NOTE_TEXT = "Заметка пустая";

export interface NoteReaderProps {
  doc: ContextDoc;
  folderName: string | null;
  terms: string[];
  inContext: boolean;
  onBack: () => void;
  onToggleContext: () => void;
  onCopy: () => void;
}

export function NoteReader({
  doc,
  folderName,
  terms,
  inContext,
  onBack,
  onToggleContext,
  onCopy,
}: NoteReaderProps) {
  const matches = useMemo(() => noteMatchCount(doc.text, terms), [doc.text, terms]);
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-1.5">
      <header className="flex items-center gap-1.5 border-b pb-1.5">
        <IconButton title={BACK_TITLE} className="size-6 shrink-0" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
        </IconButton>
        <span className="min-w-0 truncate text-body font-medium text-foreground">{doc.name}</span>
        {folderName !== null && (
          <span className="shrink-0 truncate text-hint text-muted-foreground">{folderName}</span>
        )}
        <span className="min-w-0 flex-1" />
        {matches > 0 && (
          <span className="shrink-0 text-hint text-muted-foreground tabular-nums">
            {MATCHES_LABEL} {matches}
          </span>
        )}
        <IconButton
          title={inContext ? REMOVE_FROM_CONTEXT_TITLE : ADD_TO_CONTEXT_TITLE}
          className={cn("size-6 shrink-0", inContext && "text-foreground")}
          onClick={onToggleContext}
        >
          {inContext ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
        </IconButton>
        <IconButton title={COPY_TITLE} className="size-6 shrink-0" onClick={onCopy}>
          <Copy className="size-3.5" />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1.5">
        {doc.text.trim() === "" ? (
          <p className="text-caption text-muted-foreground">{EMPTY_NOTE_TEXT}</p>
        ) : (
          <div className={PROSE_MARKDOWN_CLASS}>
            <MarkdownChunk text={doc.text} components={markdownComponents} />
          </div>
        )}
      </div>
    </section>
  );
}
