import { Check, Copy, WrapText } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "@/components/IconButton";
import { codeLineCount, linesLabel } from "@/lib/code-block";
import { cn } from "@/lib/utils";

export interface CodeBlockProps {
  /** Подпись языка в шапке; пусто — если распознать не удалось. */
  language: string | null;
  /** Сырой текст блока: из него считаются строки и он же уходит в буфер. */
  code: string;
  /** Подсвеченное содержимое; во время стрима — тот же сырой текст. */
  children: ReactNode;
}

const COPIED_FEEDBACK_MS = 1500;
const UNKNOWN_LANGUAGE_LABEL = "код";
const COPY_LABEL = "Копировать блок";
const COPIED_LABEL = "Скопировано";
const WRAP_ON_LABEL = "Переносить длинные строки";
const WRAP_OFF_LABEL = "Не переносить строки";
const ACTION_CLASS = "size-6";

function useCopiedFlag(): [copied: boolean, markCopied: () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const markCopied = () => {
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
    }, COPIED_FEEDBACK_MS);
  };

  return [copied, markCopied];
}

export function CodeBlock({ language, code, children }: CodeBlockProps) {
  const [wrapped, setWrapped] = useState(false);
  const [copied, markCopied] = useCopiedFlag();

  const copy = () => {
    void navigator.clipboard.writeText(code).then(markCopied);
  };

  return (
    <div
      data-wrap={wrapped}
      className="code-block my-2 overflow-hidden rounded-md bg-code-surface ring-1 ring-border ring-inset"
    >
      <div className="flex items-center gap-2 border-b border-border py-0.5 pr-0.5 pl-2.5 font-mono text-caption">
        <span className="truncate font-medium text-foreground/85">
          {language ?? UNKNOWN_LANGUAGE_LABEL}
        </span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {linesLabel(codeLineCount(code))}
        </span>
        <span className="min-w-0 flex-1" />
        <IconButton
          title={wrapped ? WRAP_OFF_LABEL : WRAP_ON_LABEL}
          className={cn(ACTION_CLASS, wrapped && "text-foreground")}
          onClick={() => {
            setWrapped((on) => !on);
          }}
        >
          <WrapText className="size-3.5" />
        </IconButton>
        <IconButton
          title={copied ? COPIED_LABEL : COPY_LABEL}
          className={ACTION_CLASS}
          onClick={copy}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </IconButton>
      </div>
      <pre>{children}</pre>
    </div>
  );
}
