import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { setPreviewHtml } from "@/ipc/commands";
import { isTauri } from "@/ipc/env";

export interface PreviewPanelProps {
  html: string;
  onClose: () => void;
}

export const PREVIEW_PANEL_WIDTH_PX = 570;

const PREVIEW_ORIGIN = "preview://localhost";
const PREVIEW_IFRAME_TITLE = "HTML превью";
const PREVIEW_IFRAME_CLASS = "min-h-0 flex-1 rounded-[12px] border-0 bg-white";
const TAURI_SANDBOX = "allow-scripts allow-same-origin";
const SRCDOC_SANDBOX = "allow-scripts";

const previewSrcUrl = (version: number) => `${PREVIEW_ORIGIN}/?v=${version}`;

function usePreviewSrc(html: string) {
  const [src, setSrc] = useState("");
  const nonce = useRef(0);

  useEffect(() => {
    if (html === "" || !isTauri()) {
      setSrc("");
      return;
    }
    nonce.current += 1;
    const version = nonce.current;
    void setPreviewHtml(html).then(() => {
      if (version === nonce.current) setSrc(previewSrcUrl(version));
    });
  }, [html]);

  return src;
}

function PreviewHeader({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <header className="flex items-center gap-2.5">
      <span className="text-[10.5px] font-medium text-foreground/55">Превью</span>
      <span className="h-px flex-1 bg-border" aria-hidden />
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
  );
}

function PreviewBody({ html, src }: { html: string; src: string }) {
  if (html === "") {
    return (
      <div className="grid flex-1 place-items-center">
        <span className="text-[13px] text-muted-foreground">Нет содержимого</span>
      </div>
    );
  }
  if (isTauri()) {
    return (
      <iframe
        sandbox={TAURI_SANDBOX}
        src={src}
        title={PREVIEW_IFRAME_TITLE}
        className={PREVIEW_IFRAME_CLASS}
      />
    );
  }
  return (
    <iframe
      sandbox={SRCDOC_SANDBOX}
      srcDoc={html}
      title={PREVIEW_IFRAME_TITLE}
      className={PREVIEW_IFRAME_CLASS}
    />
  );
}

export function PreviewPanel({ html, onClose }: PreviewPanelProps) {
  const src = usePreviewSrc(html);

  return (
    <aside className="flex flex-col gap-2" style={{ width: PREVIEW_PANEL_WIDTH_PX }}>
      <PreviewHeader html={html} onClose={onClose} />
      <PreviewBody html={html} src={src} />
    </aside>
  );
}
