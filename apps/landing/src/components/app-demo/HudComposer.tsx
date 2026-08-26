import { ArrowUp, Crop, Eraser, NotebookText, SlidersHorizontal, Square } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useCopy } from "./copy";
import { AppIconButton, CycleSelect } from "./ui";

const PROMPT_MAX_HEIGHT_PX = 160;

const MODELS = ["Haiku 4.5", "Sonnet 5", "Opus 5"];

function ParamRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[76px] shrink-0 text-app-caption text-app-fg">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function RequestParams() {
  const copy = useCopy().hud.composer;
  const toggles = [copy.toggles.off, copy.toggles.on];
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<string>(MODELS[0] ?? "");
  const [thinking, setThinking] = useState<string>(copy.toggles.off);
  const [webSearch, setWebSearch] = useState<string>(copy.toggles.off);
  const [preset, setPreset] = useState<string>(copy.presets[1] ?? "");

  return (
    <div className="relative">
      <AppIconButton
        title={copy.requestParams}
        aria-label={copy.requestParams}
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
            aria-label={copy.closeRequestParams}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => {
              setOpen(false);
            }}
          />
          <div className="absolute bottom-full left-0 z-20 mb-1.5 w-60 rounded-lg border border-app-border bg-app-card p-3 shadow-xl">
            <div className="flex flex-col gap-1.5">
              <ParamRow label={copy.model}>
                <CycleSelect
                  value={model}
                  options={MODELS}
                  ariaLabel={copy.model}
                  onChange={setModel}
                />
              </ParamRow>
              <ParamRow label={copy.thinking}>
                <CycleSelect
                  value={thinking}
                  options={toggles}
                  ariaLabel={copy.thinking}
                  onChange={setThinking}
                />
              </ParamRow>
              <ParamRow label={copy.webSearch}>
                <CycleSelect
                  value={webSearch}
                  options={toggles}
                  ariaLabel={copy.webSearch}
                  onChange={setWebSearch}
                />
              </ParamRow>
              <ParamRow label={copy.preset}>
                <CycleSelect
                  value={preset}
                  options={copy.presets}
                  ariaLabel={copy.preset}
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
  const copy = useCopy();
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
      placeholder={copy.hud.composer.placeholder}
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
  const copy = useCopy().hud.composer;
  const [hasContext, setHasContext] = useState(true);

  return (
    <section>
      <div className="rounded-xl bg-app-card/60 ring-1 ring-app-border transition-[box-shadow] ring-inset focus-within:ring-app-primary-mark/50">
        <PromptTextarea value={draft} onChange={onDraftChange} onSend={onSend} />
        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          <AppIconButton
            title={copy.clearHistory}
            aria-label={copy.clearHistory}
            className="rounded-md"
            disabled={streaming}
            onClick={onClearHistory}
          >
            <Eraser />
          </AppIconButton>
          <AppIconButton
            title={copy.chatContext}
            aria-label={copy.chatContext}
            className="relative rounded-md"
            onClick={() => {
              setHasContext((value) => !value);
            }}
          >
            <NotebookText />
            {hasContext && (
              <span
                className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-app-primary-mark"
                aria-hidden
              />
            )}
          </AppIconButton>
          <AppIconButton
            title={copy.screenshot}
            aria-label={copy.screenshot}
            className="rounded-md"
          >
            <Crop />
          </AppIconButton>
          <RequestParams />
          <div className="flex-1" />
          {streaming ? (
            <button
              type="button"
              title={copy.stopAnswer}
              aria-label={copy.stopAnswer}
              onClick={onStop}
              className="grid size-7 shrink-0 place-items-center rounded-md bg-app-destructive text-app-destructive-fg transition-colors hover:bg-app-destructive/90"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              title={copy.send}
              aria-label={copy.send}
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
