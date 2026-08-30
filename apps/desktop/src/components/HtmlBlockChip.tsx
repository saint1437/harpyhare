import { ExternalLink } from "lucide-react";

export interface HtmlBlockChipProps {
  code: string;
  onToggle: () => void;
}

const TRAILING_NEWLINE = /\n$/;

function countLines(code: string) {
  return code.replace(TRAILING_NEWLINE, "").split("\n").length;
}

export function HtmlBlockChip({ code, onToggle }: HtmlBlockChipProps) {
  const lines = countLines(code);
  return (
    <button
      type="button"
      onClick={onToggle}
      className="my-1.5 flex items-center gap-2 rounded-md bg-code-surface px-2.5 py-1.5 font-mono text-caption text-muted-foreground ring-1 ring-border transition-colors outline-none ring-inset hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:bg-surface"
    >
      <span className="font-medium text-foreground/85">html</span>
      <span className="tabular-nums">{lines} строк</span>
      <span className="flex items-center gap-1">
        Открыть превью <ExternalLink className="size-3" />
      </span>
    </button>
  );
}
