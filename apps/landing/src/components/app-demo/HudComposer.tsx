import {
  ArrowUp,
  Crop,
  Eraser,
  NotebookText,
  RotateCcw,
  SlidersHorizontal,
  Square,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useCopy } from "./copy";
import { AppButton, AppIconButton, AppSelect, AppSwitch, Kbd } from "./ui";
import type { SettingValue } from "./useDemoRun";

/** `PROMPT_MAX_HEIGHT_PX` in `apps/desktop/src/features/hud/Composer.tsx`. */
const PROMPT_MAX_HEIGHT_PX = 160;

function ParamRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <span className="w-20 shrink-0 text-app-caption text-app-subtle">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end">{children}</div>
    </div>
  );
}

function RequestParams({
  presets,
  settings,
  onSetting,
}: {
  presets: string[];
  settings: Record<string, SettingValue>;
  onSetting: (id: string, value: SettingValue) => void;
}) {
  const copy = useCopy().hud.composer;
  const [open, setOpen] = useState(false);
  const model = typeof settings["model"] === "string" ? settings["model"] : (copy.models[0] ?? "");
  const preset = typeof settings["preset"] === "string" ? settings["preset"] : copy.noPreset;

  return (
    <div className="relative">
      <AppIconButton
        title={copy.requestParams}
        aria-expanded={open}
        className={cn(open && "bg-app-card text-app-fg")}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <SlidersHorizontal />
      </AppIconButton>
      {open && (
        <>
          <button
            type="button"
            aria-label={copy.closeRequestParams}
            className="fixed inset-0 z-10"
            onClick={() => {
              setOpen(false);
            }}
          />
          <div className="absolute bottom-full left-0 z-20 mb-1.5 w-64 rounded-lg border border-app-border bg-app-surface p-3 shadow-xl">
            <div className="flex flex-col gap-1.5">
              <ParamRow label={copy.params.model}>
                <AppSelect
                  value={model}
                  options={copy.models}
                  ariaLabel={copy.params.model}
                  onChange={(value) => {
                    onSetting("model", value);
                  }}
                />
              </ParamRow>
              <ParamRow label={copy.params.preset}>
                <AppSelect
                  value={preset}
                  options={[copy.noPreset, ...presets]}
                  ariaLabel={copy.params.preset}
                  onChange={(value) => {
                    onSetting("preset", value);
                  }}
                />
              </ParamRow>
              <ParamRow label={copy.params.thinking}>
                <AppSwitch
                  checked={settings["thinking"] === true}
                  ariaLabel={copy.params.thinking}
                  onChange={(value) => {
                    onSetting("thinking", value);
                  }}
                />
              </ParamRow>
              <ParamRow label={copy.params.webSearch}>
                <AppSwitch
                  checked={settings["web_search"] === true}
                  ariaLabel={copy.params.webSearch}
                  onChange={(value) => {
                    onSetting("web_search", value);
                  }}
                />
              </ParamRow>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function HudComposer({
  draft,
  attachments,
  streaming,
  showRetry,
  quickActions,
  quickActionCombo,
  presets,
  settings,
  focusToken,
  onDraftChange,
  onSend,
  onStop,
  onClearHistory,
  onScreenshot,
  onRemoveAttachment,
  onQuickAction,
  onRetry,
  onSetting,
}: {
  draft: string;
  attachments: number;
  streaming: boolean;
  showRetry: boolean;
  quickActions: { id: string; title: string; prompt: string }[];
  quickActionCombo: string;
  presets: string[];
  settings: Record<string, SettingValue>;
  /** Bumped by the focus-prompt hotkey; puts the caret at the end of the text. */
  focusToken: number;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  onClearHistory: () => void;
  onScreenshot: () => void;
  onRemoveAttachment: () => void;
  onQuickAction: (prompt: string) => void;
  onRetry: () => void;
  onSetting: (id: string, value: SettingValue) => void;
}) {
  const dict = useCopy();
  const copy = dict.hud.composer;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [contextOpen, setContextOpen] = useState(false);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el === null) return;
    el.style.height = "0px";
    el.style.height = `${String(Math.min(el.scrollHeight, PROMPT_MAX_HEIGHT_PX))}px`;
  }, [draft]);

  useEffect(() => {
    if (focusToken === 0) return;
    const el = textareaRef.current;
    if (el === null) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusToken]);

  return (
    <section>
      {quickActions.length > 0 && (
        <div
          role="group"
          aria-label={copy.quickActionsLabel}
          className="app-no-scrollbar mb-1.5 flex min-w-0 items-center gap-1 overflow-x-auto"
        >
          {quickActions.map((action, index) => (
            <AppButton
              key={action.id}
              variant="ghost"
              size="compact"
              disabled={streaming}
              className="bg-app-card text-app-fg/85 ring-1 ring-app-border ring-inset hover:bg-app-surface-active active:bg-app-card"
              onMouseDown={(event) => {
                // Never steal focus from the prompt: the app does the same, so a
                // quick action can be pressed mid-sentence.
                event.preventDefault();
              }}
              onClick={() => {
                onQuickAction(action.prompt);
              }}
            >
              {action.title}
              <span className="font-mono text-app-hint text-app-subtle/80 tabular-nums">
                {quickActionCombo}
                {index + 1}
              </span>
            </AppButton>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-app-card/70 shadow-lg ring-1 ring-app-border transition-[box-shadow] ring-inset focus-within:ring-app-focus">
        <textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          placeholder={copy.placeholder}
          onChange={(event) => {
            onDraftChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!streaming) onSend();
            }
          }}
          className="max-h-40 min-h-9 w-full resize-none overflow-y-auto border-0 bg-transparent px-2.5 py-1.5 text-app-body text-app-fg placeholder:text-app-subtle focus-visible:outline-none"
        />

        {attachments > 0 && (
          <div className="flex flex-wrap gap-1.5 px-2.5 pb-2">
            {Array.from({ length: attachments }, (_, index) => (
              <span
                key={index}
                className="group relative grid size-12 place-items-center overflow-hidden rounded-md bg-app-code text-app-subtle ring-1 ring-app-border ring-inset"
                aria-label={copy.attachmentAlt}
              >
                <Crop className="size-4" aria-hidden />
                <button
                  type="button"
                  title={copy.removeAttachment}
                  aria-label={copy.removeAttachment}
                  onClick={onRemoveAttachment}
                  className="absolute top-1 right-1 grid size-4.5 place-items-center rounded-full bg-app-scrim text-app-on-scrim opacity-0 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          <AppIconButton title={copy.clearHistory} disabled={streaming} onClick={onClearHistory}>
            <Eraser />
          </AppIconButton>
          <AppIconButton
            title={copy.context}
            className="relative"
            onClick={() => {
              setContextOpen((value) => !value);
            }}
          >
            <NotebookText />
            {contextOpen && (
              <span
                className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-app-primary-mark"
                aria-hidden
              />
            )}
          </AppIconButton>
          <AppIconButton title={copy.captureRegion} onClick={onScreenshot}>
            <Crop />
          </AppIconButton>
          <RequestParams presets={presets} settings={settings} onSetting={onSetting} />

          <span className="min-w-0 flex-1" />

          {showRetry && (
            <AppIconButton title={copy.retryTranscription} onClick={onRetry}>
              <RotateCcw />
            </AppIconButton>
          )}
          {streaming ? (
            <AppButton
              variant="destructive"
              size="icon-compact"
              title={copy.stopAnswer}
              aria-label={copy.stopAnswer}
              onClick={onStop}
            >
              <Square className="size-3.5 fill-current" />
            </AppButton>
          ) : (
            <AppButton
              size="icon-compact"
              title={copy.sendTitle}
              aria-label={copy.send}
              onClick={onSend}
            >
              <ArrowUp />
            </AppButton>
          )}
        </div>
      </div>

      {contextOpen && (
        <p className="mt-1.5 flex items-center gap-2 rounded-md bg-app-card px-2.5 py-1.5 text-app-caption text-app-subtle ring-1 ring-app-border ring-inset">
          <Kbd>{copy.context}</Kbd>
          {dict.launcher.screens.contexts.description}
        </p>
      )}
    </section>
  );
}
