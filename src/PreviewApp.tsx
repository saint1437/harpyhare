import { X } from "lucide-react";
import { useEffect } from "react";
import { usePreviewHtml } from "@/hooks/usePreviewHtml";
import { closePreviewWindow } from "@/ipc/commands";

/** Окно HTML-превью (label "preview"): шапка с drag-зоной + sandbox-iframe.
 *  JS внутри HTML выполняется, но без allow-same-origin iframe изолирован
 *  от приложения и его IPC. */
export default function PreviewApp() {
  const html = usePreviewHtml();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void closePreviewWindow();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="app-shell flex h-screen flex-col gap-2 overflow-hidden rounded-[22px] p-3">
      <header data-tauri-drag-region className="flex items-center gap-2.5">
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
          onClick={() => void closePreviewWindow()}
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
    </div>
  );
}
