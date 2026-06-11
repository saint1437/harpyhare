import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { extractImageItems } from "@/lib/composer";
import type { Attachment } from "@/hooks/useAttachments";
import { AttachmentChip } from "./AttachmentChip";

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  attachments: Attachment[];
  onRemoveAttachment: (index: number) => void;
  onPaste: (items: DataTransferItemList) => void;
  onSend: () => void;
  onStop: () => void;
  onClear: () => void;
  onRetry: () => void;
  hotkey: string;
  streaming: boolean;
  showRetry: boolean;
}

export function Composer(props: ComposerProps) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="rounded-xl bg-card/60 ring-1 ring-inset ring-border focus-within:ring-primary/50 transition-[box-shadow]">
        <Textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            // Гасим нативную вставку только если в буфере есть картинки —
            // текстовая вставка остаётся нативной (строгий паритет со старым кодом).
            if (extractImageItems(items).length > 0) e.preventDefault();
            props.onPaste(items);
          }}
          spellCheck={false}
          placeholder={`Зажми ${props.hotkey} у видео — расшифровка появится здесь. Текст можно править, ⌘V вставляет скриншот.`}
          className="min-h-24 max-h-44 resize-none border-0 bg-transparent focus-visible:ring-0 shadow-none"
        />
        {props.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pb-3">
            {props.attachments.map((att, i) => (
              <AttachmentChip key={att.preview} attachment={att} onRemove={() => props.onRemoveAttachment(i)} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={props.onClear}>
          Очистить
        </Button>
        <div className="flex-1" />
        {props.showRetry && (
          <Button variant="ghost" size="sm" onClick={props.onRetry}>
            Повторить
          </Button>
        )}
        {props.streaming && (
          <Button variant="destructive" size="sm" onClick={props.onStop}>
            Стоп
          </Button>
        )}
        <Button onClick={props.onSend} disabled={props.streaming}>
          Отправить <kbd className="ml-1.5 px-1.5 py-0.5 rounded bg-black/20 font-mono text-[10.5px]">⌘⏎</kbd>
        </Button>
      </div>
    </section>
  );
}
