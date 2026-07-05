import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { modelLabel, selectableModels, thinkingLocked, type ModelInfo } from "@/lib/models";
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
  /** Модель Anthropic этого чата. */
  model: string;
  onModelChange: (model: string) => void;
  /** Server-side веб-поиск Anthropic в ответах этого чата. */
  webSearch: boolean;
  onWebSearchChange: (enabled: boolean) => void;
  /** Постоянный контекст чата (уходит в system каждого запроса). */
  context: string;
  onContextChange: (context: string) => void;
  /** Модели аккаунта (useModels). */
  models: ModelInfo[];
}

export function Composer(props: ComposerProps) {
  const models = selectableModels(props.models, props.model);
  // модель без выключаемого thinking (haiku/fable) — селект thinking заблокирован
  const lockedThinking = thinkingLocked(models, props.model);
  // Диалог контекста: локальный черновик, применяется по «Сохранить».
  const [contextOpen, setContextOpen] = useState(false);
  const [contextDraft, setContextDraft] = useState("");
  const openContext = () => {
    setContextDraft(props.context);
    setContextOpen(true);
  };
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
        <Button variant="ghost" size="sm" className="min-w-[96px]" onClick={openContext}>
          {props.context.trim() !== "" ? "Контекст •" : "Контекст"}
        </Button>
        <div className="flex-1" />
        {props.showRetry && (
          <Button variant="ghost" size="sm" className="w-[120px]" onClick={props.onRetry}>
            Повторить
          </Button>
        )}
        <Select
          value={props.webSearch ? "on" : "off"}
          onValueChange={(v) => {
            props.onWebSearchChange(v === "on");
          }}
        >
          <SelectTrigger className="h-8 w-[120px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="on">Веб-поиск</SelectItem>
            <SelectItem value="off">Без поиска</SelectItem>
          </SelectContent>
        </Select>
        <Select value={props.model} onValueChange={props.onModelChange}>
          <SelectTrigger className="h-8 w-[120px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {modelLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={props.thinkingEnabled ? "on" : "off"}
          disabled={lockedThinking}
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

      <Dialog
        open={contextOpen}
        onOpenChange={(open) => {
          if (!open) setContextOpen(false);
        }}
      >
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Контекст чата</DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-muted-foreground">
            Постоянный справочный текст этого чата (вакансия, резюме, конспект…) — уходит в
            системный промпт каждого запроса и сохраняется на диск.
          </p>
          <Textarea
            rows={10}
            value={contextDraft}
            onChange={(e) => {
              setContextDraft(e.target.value);
            }}
            placeholder="Вставь сюда справочные материалы"
            className="field-sizing-fixed max-h-64 overflow-y-auto"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setContextOpen(false);
              }}
            >
              Отмена
            </Button>
            <Button
              onClick={() => {
                props.onContextChange(contextDraft);
                setContextOpen(false);
              }}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
