import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { extractImageItems } from "@/lib/composer";
import type { Attachment } from "@/lib/composer";
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
  presets: { id: string; name: string }[];
  presetId: string;
  onPresetChange: (id: string) => void;
  /** Режим ответа этого чата: thinking (умнее) или без него (быстрее первый токен). */
  thinkingEnabled: boolean;
  onThinkingChange: (enabled: boolean) => void;
}

export function Composer(props: ComposerProps) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="rounded-xl bg-card/60 ring-1 ring-border transition-[box-shadow] ring-inset focus-within:ring-primary/50">
        <Textarea
          value={props.value}
          onChange={(e) => {
            props.onChange(e.target.value);
          }}
          onPaste={(e) => {
            const items = e.clipboardData.items;
            // Гасим нативную вставку только если в буфере есть картинки —
            // текстовая вставка остаётся нативной (строгий паритет со старым кодом).
            if (extractImageItems(items).length > 0) e.preventDefault();
            props.onPaste(items);
          }}
          onKeyDown={(e) => {
            // Enter — отправка; Shift+Enter — перенос строки; не мешаем IME-композиции.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              props.onSend();
            }
          }}
          spellCheck={false}
          placeholder={`Зажми ${props.hotkey} у видео — расшифровка появится здесь. Текст можно править, ⌘V вставляет скриншот.`}
          className="max-h-44 min-h-24 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        {props.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pb-3">
            {props.attachments.map((att, i) => (
              <AttachmentChip
                key={att.preview}
                attachment={att}
                onRemove={() => {
                  props.onRemoveAttachment(i);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="w-[120px]" onClick={props.onClear}>
          Очистить
        </Button>
        <div className="flex-1" />
        {props.showRetry && (
          <Button variant="ghost" size="sm" className="w-[120px]" onClick={props.onRetry}>
            Повторить
          </Button>
        )}
        <Select
          value={props.thinkingEnabled ? "on" : "off"}
          onValueChange={(v) => {
            props.onThinkingChange(v === "on");
          }}
        >
          <SelectTrigger className="h-8 w-[120px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="on">Thinking</SelectItem>
            <SelectItem value="off">Без thinking</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={
            props.presetId !== "" && props.presets.some((p) => p.id === props.presetId)
              ? props.presetId
              : "none"
          }
          onValueChange={(v) => {
            props.onPresetChange(v === "none" ? "" : v);
          }}
        >
          <SelectTrigger className="h-8 w-[120px] text-[12px]">
            <SelectValue placeholder="Препромпт" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="none">Без препромпта</SelectItem>
            {props.presets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name || "Без имени"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {props.streaming && (
          <Button variant="destructive" size="sm" className="w-[120px]" onClick={props.onStop}>
            Стоп
          </Button>
        )}
        <Button size="sm" className="w-[120px]" onClick={props.onSend} disabled={props.streaming}>
          Отправить
        </Button>
      </div>
    </section>
  );
}
