import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { setPreviewHtml } from "@/ipc/commands";
import { isTauri } from "@/ipc/env";

export interface PreviewPanelProps {
  html: string;
  onClose: () => void;
}

/** Встроенная панель HTML-превью (правая колонка окна). В Tauri контент грузится
 *  с origin preview://localhost (кастомная схема) — localStorage/сеть работают,
 *  но cross-origin к приложению и отсутствие capability изолируют превью от IPC и
 *  ключей. В браузерном моке (вне Tauri) — фолбэк на srcDoc для демо. */
export function PreviewPanel({ html, onClose }: PreviewPanelProps) {
  const [src, setSrc] = useState("");
  const nonce = useRef(0);

  useEffect(() => {
    if (html === "" || !isTauri()) {
      setSrc("");
      return;
    }
    nonce.current += 1;
    const v = nonce.current;
    // Нонс заставляет WKWebView перезагрузить iframe даже при том же HTML.
    void setPreviewHtml(html).then(() => {
      // Игнорируем устаревший ответ, если html успел смениться (гонка быстрых открытий).
      if (v === nonce.current) setSrc(`preview://localhost/?v=${v}`);
    });
  }, [html]);

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
      ) : isTauri() ? (
        <iframe
          sandbox="allow-scripts allow-same-origin"
          src={src}
          title="HTML превью"
          className="min-h-0 flex-1 rounded-[12px] border-0 bg-white"
        />
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
