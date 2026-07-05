import { ExternalLink } from "lucide-react";

export interface HtmlBlockChipProps {
  code: string;
  onOpen: () => void;
}

const TRAILING_NEWLINE = /\n$/;

function countLines(code: string) {
  return code.replace(TRAILING_NEWLINE, "").split("\n").length;
}

export function HtmlBlockChip({ code, onOpen }: HtmlBlockChipProps) {
  const lines = countLines(code);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="my-1.5 flex items-center gap-2 rounded-lg border border-border bg-black/30 px-3 py-1.5 font-mono text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className="text-primary">html</span>
      <span>{lines} строк</span>
      <span className="flex items-center gap-1 text-primary">
        Открыть превью <ExternalLink className="size-3" />
      </span>
    </button>
  );
}
