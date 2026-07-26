import { ArrowUp, Crop, Eraser, NotebookText, SlidersHorizontal, Square } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AppIconButton, CycleSelect } from "./ui";

const PROMPT_MAX_HEIGHT_PX = 160;

const MODELS = ["Haiku 4.5", "Sonnet 5", "Opus 5"] as const;
const TOGGLES = ["Выкл", "Вкл"] as const;
const PRESETS = ["Без препромпта", "Расшифровка речи", "Собеседование"] as const;

function ParamRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[76px] shrink-0 text-app-caption text-app-fg">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function RequestParams() {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<string>(MODELS[0]);
  const [thinking, setThinking] = useState<string>(TOGGLES[0]);
  const [webSearch, setWebSearch] = useState<string>(TOGGLES[0]);
  const [preset, setPreset] = useState<string>(PRESETS[1]);

  return (
    <div className="relative">
      <AppIconButton
        title="Параметры запроса"
        aria-label="Параметры запроса"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={cn("rounded-md", open && "bg-app-surface text-app-fg")}
      >
        <SlidersHorizontal />
      </AppIconButton>
      {open && (
        <>
          <button
            type="button"
            aria-label="Закрыть параметры запроса"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => {
              setOpen(false);
            }}
          />
          <div className="absolute bottom-full left-0 z-20 mb-1.5 w-60 rounded-lg border border-app-border bg-app-card p-3 shadow-xl">
            <div className="flex flex-col gap-1.5">
              <ParamRow label="Модель">
                <CycleSelect
                  value={model}
                  options={MODELS}
                  ariaLabel="Модель"
                  onChange={setModel}
                />
              </ParamRow>
              <ParamRow label="Thinking">
                <CycleSelect
                  value={thinking}
                  options={TOGGLES}
                  ariaLabel="Thinking"
                  onChange={setThinking}
                />
              </ParamRow>
              <ParamRow label="Веб-поиск">
                <CycleSelect
                  value={webSearch}
                  options={TOGGLES}
                  ariaLabel="Веб-поиск"
                  onChange={setWebSearch}
                />
              </ParamRow>
              <ParamRow label="Препромпт">
                <CycleSelect
                  value={preset}
                  options={PRESETS}
                  ariaLabel="Препромпт"
                  onChange={setPreset}
                />
              </ParamRow>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PromptTextarea({
  value,
  onChange,
  onSend,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, PROMPT_MAX_HEIGHT_PX)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      spellCheck={false}
      placeholder="Расшифровка появится здесь — или напиши вопрос сам"
      onChange={(e) => {
        onChange(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onSend();
        }
      }}
      className="app-scroll block max-h-40 min-h-9 w-full resize-none bg-transparent px-3 py-2 text-app-body text-app-fg outline-none placeholder:text-app-muted"
    />
  );
}

export function HudComposer({
  draft,
  streaming,
  onDraftChange,
  onSend,
  onStop,
  onClearHistory,
}: {
  draft: string;
  streaming: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onClearHistory: () => void;
}) {
  const [hasContext, setHasContext] = useState(true);

  return (
    <section>
      <div className="rounded-xl bg-app-card/60 ring-1 ring-app-border transition-[box-shadow] ring-inset focus-within:ring-app-primary/50">
        <PromptTextarea value={draft} onChange={onDraftChange} onSend={onSend} />
        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          <AppIconButton
            title="Очистить историю чата"
            aria-label="Очистить историю чата"
            className="rounded-md"
            disabled={streaming}
            onClick={onClearHistory}
          >
            <Eraser />
          </AppIconButton>
          <AppIconButton
            title="Контекст чата"
            aria-label="Контекст чата"
            className="relative rounded-md"
            onClick={() => {
              setHasContext((value) => !value);
            }}
          >
            <NotebookText />
            {hasContext && (
              <span
                className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-app-primary"
                aria-hidden
              />
            )}
          </AppIconButton>
          <AppIconButton
            title="Снимок области экрана"
            aria-label="Снимок области экрана"
            className="rounded-md"
          >
            <Crop />
          </AppIconButton>
          <RequestParams />
          <div className="flex-1" />
          {streaming ? (
            <button
              type="button"
              title="Остановить ответ"
              aria-label="Остановить ответ"
              onClick={onStop}
              className="grid size-7 shrink-0 place-items-center rounded-md bg-app-destructive text-app-primary-fg transition-colors hover:bg-app-destructive/90"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              title="Отправить (⏎)"
              aria-label="Отправить"
              onClick={onSend}
              className="grid size-7 shrink-0 place-items-center rounded-md bg-app-primary text-app-primary-fg transition-colors hover:bg-app-primary/90"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
