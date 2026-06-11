import { X } from "lucide-react";

export interface PreviewPanelProps {
  html: string;
  onClose: () => void;
}

/** Встроенная панель HTML-превью (правая колонка окна). JS внутри HTML выполняется,
 *  но без allow-same-origin iframe изолирован от приложения и его IPC. */
export function PreviewPanel({ html, onClose }: PreviewPanelProps) {
  return (
    <aside className="flex w-[570px] flex-col gap-2">
      <header className="flex items-center gap-2.5">
        <span className="font-mono text-[11px] tracking-wider text-primary uppercase">Превью</span>
        <span
          className="h-px flex-1 bg-gradient-to-r from-primary/40 via-border to-transparent"
          aria-hidden
        />
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(html)}
          className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Копировать код
        </button>
        <button
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </header>
      {html === "" ? (
        <div className="grid flex-1 place-items-center">
          <span className="text-[13px] text-muted-foreground">Нет содержимого</span>
        </div>
      ) : (
        <iframe
          sandbox="allow-scripts"
          srcDoc={html}
          title="HTML превью"
          className="min-h-0 flex-1 rounded-[12px] border-0 bg-white"
        />
      )}
    </aside>
  );
}
