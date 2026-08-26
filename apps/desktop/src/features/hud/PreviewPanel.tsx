import { X } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { useDict } from "@/hooks/useDict";
import { usePreviewSrc } from "@/hooks/usePreviewSrc";
import { PREVIEW_PANEL_WIDTH_PX } from "@/lib/shell-layout";

export interface PreviewPanelProps {
  html: string;
  onClose: () => void;
}

const PREVIEW_IFRAME_CLASS = "min-h-0 flex-1 rounded-xl border-0 bg-surface-preview";
const PREVIEW_SANDBOX = "allow-scripts allow-same-origin";

function PreviewHeader({ html, onClose }: { html: string; onClose: () => void }) {
  const dict = useDict();
  return (
    <header className="flex min-h-7 items-center gap-1.5">
      <SectionLabel className="min-w-0 flex-1 truncate">{dict.hud.preview.title}</SectionLabel>
      <Button
        variant="ghost"
        size="compact"
        className="text-fg-subtle"
        onClick={() => void navigator.clipboard.writeText(html)}
      >
        {dict.hud.preview.copyCode}
      </Button>
      <IconButton title={dict.common.actions.close} onClick={onClose}>
        <X />
      </IconButton>
    </header>
  );
}

function PreviewBody({ html, src }: { html: string; src: string }) {
  const copy = useDict().hud.preview;
  if (html === "") {
    return (
      <div className="grid flex-1 place-items-center">
        <span className="text-body text-fg-subtle">{copy.empty}</span>
      </div>
    );
  }
  return (
    <iframe
      sandbox={PREVIEW_SANDBOX}
      src={src}
      title={copy.frameTitle}
      className={PREVIEW_IFRAME_CLASS}
    />
  );
}

export function PreviewPanel({ html, onClose }: PreviewPanelProps) {
  const src = usePreviewSrc(html);

  return (
    <aside className="flex flex-col gap-2.5" style={{ width: PREVIEW_PANEL_WIDTH_PX }}>
      <PreviewHeader html={html} onClose={onClose} />
      <PreviewBody html={html} src={src} />
    </aside>
  );
}
