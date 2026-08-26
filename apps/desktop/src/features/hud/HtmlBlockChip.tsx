import { ExternalLink } from "lucide-react";
import { useDict } from "@/hooks/useDict";
import { format } from "@/i18n";

export interface HtmlBlockChipProps {
  code: string;
  onToggle: () => void;
}

const TRAILING_NEWLINE = /\n$/;

function countLines(code: string) {
  return code.replace(TRAILING_NEWLINE, "").split("\n").length;
}

export function HtmlBlockChip({ code, onToggle }: HtmlBlockChipProps) {
  const copy = useDict().hud.htmlBlock;
  const lines = countLines(code);
  return (
    <button
      type="button"
      onClick={onToggle}
      className="my-1.5 flex items-center gap-2 rounded-md bg-inset px-2.5 py-1.5 font-mono text-caption text-fg-subtle ring-1 ring-inset ring-line transition-colors outline-none hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid active:bg-surface"
    >
      <span className="font-medium text-fg/85">html</span>
      <span className="tabular-nums">{format(copy.lines, { count: String(lines) })}</span>
      <span className="flex items-center gap-1">
        {copy.openPreview} <ExternalLink className="size-3" />
      </span>
    </button>
  );
}
