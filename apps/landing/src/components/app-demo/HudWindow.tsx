import {
  ArrowDownCircle,
  Copy,
  CopyPlus,
  Ear,
  EarOff,
  Eye,
  EyeOff,
  Keyboard,
  Minimize2,
  Pause,
  Play,
  Plus,
  Power,
  ScrollText,
  Square,
  X,
} from "lucide-react";
import { useState } from "react";
import type { ListeningStateId } from "@/i18n/demo-types";
import { cn } from "@/lib/cn";
import { format } from "@/lib/format";
import { useCopy } from "./copy";
import { HudChat } from "./HudChat";
import { HudComposer } from "./HudComposer";
import {
  AutoTranscript,
  ConnectivityOverlay,
  NotificationStack,
  PreviewPanel,
  Teleprompter,
} from "./HudOverlays";
import { AppIconButton, CaptureMeter, Kbd, SectionLabel } from "./ui";
import type { DemoRun } from "./useDemoRun";

/** `CHAT_LIMIT` in the app. */
const CHAT_LIMIT = 6;
const CONTEXT_WARN_PERCENT = 80;

/**
 * The capture indicator's five tones, and the one that matters most: `armed` is
 * a DIM cyan, not the bright one. "The buffer is holding audio" and "audio is
 * going somewhere" must not look the same, or the product's central promise —
 * that nothing leaves the machine until you hold the key — is unreadable.
 */
const METER: Record<ListeningStateId, { bar: string; animated: boolean; word: string }> = {
  recording: { bar: "bg-app-recording", animated: true, word: "text-app-fg" },
  auto: { bar: "bg-app-recording", animated: true, word: "text-app-fg" },
  armed: { bar: "bg-app-recording-dim", animated: false, word: "text-app-fg" },
  transcribing: { bar: "bg-app-muted", animated: true, word: "text-app-fg" },
  off: { bar: "bg-app-subtle", animated: false, word: "text-app-subtle" },
  error: { bar: "bg-app-destructive", animated: false, word: "text-app-destructive" },
};

function ListeningStatus({
  state,
  buffering,
  onToggle,
}: {
  state: ListeningStateId;
  buffering: boolean;
  onToggle: () => void;
}) {
  const copy = useCopy().hud;
  const tone = METER[state];
  const words = copy.listening[state];

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-md bg-app-card px-1.5 py-0.5 ring-1 ring-app-border ring-inset">
      <span className="sr-only" role="status">
        {words.announcement}
      </span>
      <CaptureMeter animated={tone.animated} barClass={tone.bar} />
      <span className={cn("text-app-caption whitespace-nowrap", tone.word)}>{words.word}</span>
      <AppIconButton
        title={buffering ? copy.pauseTitle : copy.resumeTitle}
        size="icon-xs"
        onClick={onToggle}
      >
        {buffering ? <Pause /> : <Play />}
      </AppIconButton>
    </div>
  );
}

function ContextUsageGauge({ used, max }: { used: number; max: number }) {
  const copy = useCopy().hud;
  const percent = Math.min(100, Math.round((used / max) * 100));
  return (
    <div
      className="hidden shrink-0 items-center gap-1.5 px-1 sm:flex"
      title={format(copy.contextUsage, {
        used: used.toLocaleString(),
        max: max.toLocaleString(),
      })}
    >
      <span className="h-1 w-10 overflow-hidden rounded-full bg-app-surface-active">
        <span
          className={cn(
            "block h-full rounded-full transition-[width] duration-300",
            percent >= CONTEXT_WARN_PERCENT ? "bg-app-destructive" : "bg-app-subtle/60",
          )}
          style={{ width: `${String(Math.max(3, percent))}%` }}
        />
      </span>
      <span className="text-app-hint text-app-subtle tabular-nums">{percent}%</span>
    </div>
  );
}

function HotkeysPopover() {
  const dict = useCopy();
  const copy = dict.hud;
  const [open, setOpen] = useState(false);
  const byId = new Map(dict.hotkeys.map((hotkey) => [hotkey.id, hotkey]));

  return (
    <div className="relative">
      <AppIconButton
        title={copy.hotkeys}
        aria-expanded={open}
        className={cn(open && "bg-app-card text-app-fg")}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <Keyboard />
      </AppIconButton>
      {open && (
        <>
          <button
            type="button"
            aria-label={copy.closeHotkeys}
            className="fixed inset-0 z-10"
            onClick={() => {
              setOpen(false);
            }}
          />
          <div className="app-scroll absolute top-full right-0 z-20 mt-1.5 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-app-border bg-app-surface p-3 shadow-xl">
            <div className="flex flex-col gap-2.5">
              {dict.hotkeyGroups.map((group) => (
                <div key={group.title} className="flex flex-col gap-1">
                  <SectionLabel>{group.title}</SectionLabel>
                  <div className="grid grid-cols-[max-content_1fr] items-center gap-x-2.5 gap-y-1">
                    {group.ids.map((id) => {
                      const hotkey = byId.get(id);
                      if (hotkey === undefined) return null;
                      return (
                        <div key={id} className="contents">
                          <Kbd>{hotkey.combo}</Kbd>
                          <span className="min-w-0 text-app-caption text-app-muted">
                            {hotkey.label.toLocaleLowerCase()}
                          </span>
                        </div>
                      );
                    })}
                    {group.title === dict.hotkeyGroups[1]?.title &&
                      dict.hotkeyFieldHints.map((hint) => (
                        <div key={hint.combo} className="contents">
                          <Kbd>{hint.combo}</Kbd>
                          <span className="min-w-0 text-app-caption text-app-muted">
                            {hint.label}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ChatTabs({ run }: { run: DemoRun }) {
  const copy = useCopy().hud.chats;
  return (
    <nav
      aria-label={copy.nav}
      className="app-no-scrollbar flex min-w-0 shrink items-center gap-1 overflow-x-auto"
    >
      {run.chats.map((chat, index) => {
        const isActive = chat.id === run.activeId;
        const closeOnClick = isActive && run.chats.length > 1;
        return (
          <button
            key={chat.id}
            type="button"
            title={chat.title}
            aria-label={format(closeOnClick ? copy.closeChat : copy.chat, { number: index + 1 })}
            onClick={() => {
              if (closeOnClick) run.closeChat(chat.id);
              else run.selectChat(chat.id);
            }}
            className={cn(
              "group relative grid size-6.5 shrink-0 place-items-center rounded-md font-mono text-app-caption transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid",
              isActive
                ? "bg-app-surface-active text-app-fg ring-1 ring-app-border ring-inset"
                : "text-app-subtle hover:bg-app-card hover:text-app-fg active:bg-app-surface-active",
            )}
          >
            <span className={cn("tabular-nums", closeOnClick && "group-hover:hidden")}>
              {index + 1}
            </span>
            {closeOnClick && <X className="hidden size-3.5 group-hover:block" />}
            {run.streamingIds.includes(chat.id) && (
              <span
                className="absolute -top-0.5 -right-0.5 size-1.5 animate-pulse rounded-full bg-app-primary-mark"
                aria-hidden
              />
            )}
          </button>
        );
      })}
      <AppIconButton
        title={copy.newChat}
        size="icon-xs"
        disabled={run.chats.length >= CHAT_LIMIT}
        onClick={run.newChat}
      >
        <Plus />
      </AppIconButton>
      <AppIconButton
        title={copy.duplicate}
        size="icon-xs"
        disabled={run.chats.length >= CHAT_LIMIT}
        onClick={run.duplicateChat}
      >
        <CopyPlus />
      </AppIconButton>
    </nav>
  );
}

export function HudWindow({
  run,
  focusToken,
  onStop,
  onQuit,
}: {
  run: DemoRun;
  focusToken: number;
  onStop: () => void;
  onQuit: () => void;
}) {
  const dict = useCopy();
  const copy = dict.hud;
  const recordCombo = dict.hotkeys.find((hotkey) => hotkey.id === "record")?.combo ?? "";
  const collapseCombo = dict.hotkeys.find((hotkey) => hotkey.id === "toggle_window")?.combo ?? "";
  const quickActionModifier = (
    dict.hotkeys.find((h) => h.id === "quick_action")?.combo ?? ""
  ).split(" ")[0];

  const streaming = run.phase === "streaming";
  const hasAssistantReply = run.active.messages.some((message) => message.role === "assistant");
  const canTeleprompt = hasAssistantReply || (run.partial !== null && run.partial !== "");
  const autoMode = run.autoMode ? copy.autoMode.active : copy.autoMode.idle;
  const screenShare = run.screenShareVisible ? copy.screenShare.visible : copy.screenShare.hidden;

  const chatFontSize =
    typeof run.settings["chat_font_size"] === "number" ? run.settings["chat_font_size"] : 13.5;
  const instant = run.settings["auto_reply_instant"] === true;

  return (
    <div
      className="relative flex h-full gap-2.5 rounded-[inherit] p-3"
      style={{ "--text-app-chat": `${String(chatFontSize)}px` } as React.CSSProperties}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <header className="flex min-h-7 items-center gap-2">
          <ListeningStatus
            state={run.listening}
            buffering={run.buffering}
            onToggle={run.toggleBuffering}
          />
          <ChatTabs run={run} />
          <span className="min-w-0 flex-1" />

          <div className="flex shrink-0 items-center gap-0.5">
            {run.usedTokens > 0 && (
              <ContextUsageGauge used={run.usedTokens} max={run.contextMaxTokens} />
            )}
            <AppIconButton
              title={`${autoMode.label} — ${autoMode.action}`}
              aria-pressed={run.autoMode}
              className={cn(run.autoMode && "text-app-recording hover:text-app-recording/85")}
              onClick={run.toggleAutoMode}
            >
              {run.autoMode ? <Ear /> : <EarOff />}
            </AppIconButton>
            <AppIconButton
              title={`${screenShare.label} — ${screenShare.action}`}
              aria-pressed={run.screenShareVisible}
              className={cn(run.screenShareVisible && "text-app-warning hover:text-app-warning/85")}
              onClick={run.toggleScreenShare}
            >
              {run.screenShareVisible ? <Eye /> : <EyeOff />}
            </AppIconButton>
            {canTeleprompt && (
              <AppIconButton title={copy.teleprompter} onClick={run.toggleTeleprompter}>
                <ScrollText />
              </AppIconButton>
            )}
            {!streaming && hasAssistantReply && (
              <AppIconButton title={copy.copyLast}>
                <Copy />
              </AppIconButton>
            )}
            <HotkeysPopover />
            <span className="hidden items-center gap-1 px-1 font-mono text-app-hint text-app-subtle tabular-nums sm:inline-flex">
              <ArrowDownCircle className="size-3.5 text-app-primary-mark" aria-hidden />
              {dict.version}
            </span>
          </div>

          <div className="ml-1 flex shrink-0 items-center gap-0.5 border-l border-app-border pl-1.5">
            <AppIconButton
              title={format(copy.collapseRestore, {
                label: copy.collapse,
                combo: collapseCombo,
              })}
              onClick={() => {
                run.setCollapsed(true);
              }}
            >
              <Minimize2 />
            </AppIconButton>
            <AppIconButton title={copy.stop} onClick={onStop}>
              <Square />
            </AppIconButton>
            <AppIconButton
              title={copy.quit}
              className="hover:text-app-destructive"
              onClick={onQuit}
            >
              <Power />
            </AppIconButton>
          </div>
        </header>

        <HudChat
          chatId={run.activeId}
          messages={run.active.messages}
          attachments={run.active.attachments}
          partial={run.partial}
          streaming={streaming}
          thinkingStartedAt={run.thinkingStartedAt}
          recordCombo={recordCombo}
          onRemoveMessage={run.removeMessage}
          onResendMessage={run.resendMessage}
          onOpenPreview={() => {
            run.setPreviewOpen(true);
          }}
        />

        {run.autoMode && (
          <AutoTranscript turns={run.turns} instant={instant} onAnswer={run.answerPendingTurns} />
        )}

        <NotificationStack items={run.notifications} onDismiss={run.dismissNotification} />

        <HudComposer
          draft={run.active.draft}
          attachments={run.active.attachments}
          streaming={streaming}
          showRetry={run.showRetry}
          quickActions={dict.launcher.settings.quickActions.items}
          quickActionCombo={quickActionModifier ?? ""}
          presets={dict.launcher.presets.items.map((preset) => preset.name)}
          settings={run.settings}
          focusToken={focusToken}
          onDraftChange={run.setDraft}
          onSend={run.send}
          onStop={run.stopStream}
          onClearHistory={run.clearHistory}
          onScreenshot={run.addAttachment}
          onRemoveAttachment={run.removeAttachment}
          onQuickAction={run.runQuickAction}
          onRetry={run.retryTranscription}
          onSetting={run.setSetting}
        />
      </div>

      {run.previewOpen && (
        <PreviewPanel
          onClose={() => {
            run.setPreviewOpen(false);
          }}
        />
      )}

      {run.teleprompterOpen && (
        <Teleprompter text={run.lastAnswer} onClose={run.toggleTeleprompter} />
      )}
      {run.offline && <ConnectivityOverlay />}
    </div>
  );
}
