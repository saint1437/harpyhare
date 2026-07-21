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
      className="my-1.5 flex items-center gap-2 rounded-md border bg-code-surface px-3 py-1.5 font-mono text-caption text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="font-medium text-foreground/80">html</span>
      <span>{lines} строк</span>
      <span className="flex items-center gap-1">
        Открыть превью <ExternalLink className="size-3" />
      </span>
    </button>
  );
}
