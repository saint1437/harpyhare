import { Check, Copy, WrapText } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { IconButton } from "@/components/IconButton";
import { codeLineCount, linesLabel } from "@/lib/code-block";
import { splitRenderedLines, trimTrailingEmptyLine } from "@/lib/code-lines";
import { cn } from "@/lib/utils";

export interface CodeBlockProps {
  /** Подпись языка в шапке; пусто — если распознать не удалось. */
  language: string | null;
  /** Сырой текст блока: из него считаются строки и он же уходит в буфер. */
  code: string;
  /** Классы код-элемента от подсветки — на них висят цвета токенов. */
  codeClassName?: string;
  /** Содержимое блока: подсвеченное дерево или сырой текст во время стрима. */
  children: ReactNode;
}

const COPIED_FEEDBACK_MS = 1500;
const UNKNOWN_LANGUAGE_LABEL = "код";
const COPY_LABEL = "Копировать блок";
const COPIED_LABEL = "Скопировано";
const WRAP_ON_LABEL = "Переносить длинные строки";
const WRAP_OFF_LABEL = "Не переносить строки";
const ACTION_CLASS = "size-6";
const MIN_GUTTER_DIGITS = 2;

function gutterDigits(lineCount: number): number {
  return Math.max(MIN_GUTTER_DIGITS, String(lineCount).length);
}

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

export function CodeBlock({ language, code, codeClassName, children }: CodeBlockProps) {
  const [wrapped, setWrapped] = useState(false);
  const [copied, markCopied] = useCopiedFlag();
  const lines = useMemo(() => trimTrailingEmptyLine(splitRenderedLines(children)), [children]);

  const copy = () => {
    void navigator.clipboard.writeText(code).then(markCopied);
  };

  return (
    <div
      data-wrap={wrapped}
      style={{ "--code-gutter": `${String(gutterDigits(lines.length))}ch` } as CSSProperties}
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
      <pre>
        <code className={codeClassName}>
          {lines.map((line, index) => (
            <span key={index} className="code-line">
              <span className="code-line-number" aria-hidden>
                {index + 1}
              </span>
              <span className="code-line-text">{line}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
