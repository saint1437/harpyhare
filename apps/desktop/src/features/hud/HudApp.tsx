import { Copy, ScrollText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { PanelErrorBoundary } from "@/components/ErrorBoundary";
import { IconButton } from "@/components/IconButton";
import { NotificationStack } from "@/components/NotificationStack";
import { useAutoMode } from "@/hooks/useAutoMode";
import { useCancelKey, cancellable } from "@/hooks/useCancelKey";
import { useChatsStorage } from "@/hooks/useChatsStorage";
import { useClaudeStream } from "@/hooks/useClaudeStream";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useContextLibrary } from "@/hooks/useContextLibrary";
import { useDict } from "@/hooks/useDict";
import { useDuplicateChatKey } from "@/hooks/useDuplicateChatKey";
import { useHotkeyCombos } from "@/hooks/useHotkeyCombos";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useModels } from "@/hooks/useModels";
import { useNotifications } from "@/hooks/useNotifications";
import { useOfficialPresets } from "@/hooks/useOfficialPresets";
import { orbDragInProgress } from "@/hooks/useOrbDrag";
import { usePreviewPanel } from "@/hooks/usePreviewPanel";
import { useProjectedContextTokens } from "@/hooks/useProjectedContextTokens";
import { usePromptFocus } from "@/hooks/usePromptFocus";
import { usePttSuspend } from "@/hooks/usePttSuspend";
import { useQuickActionKeys } from "@/hooks/useQuickActionKeys";
import { useQuickActions } from "@/hooks/useQuickActions";
import { useRecorder } from "@/hooks/useRecorder";
import { useRegionScreenshot } from "@/hooks/useRegionScreenshot";
import { useSendPipeline } from "@/hooks/useSendPipeline";
import { useSttFeedback } from "@/hooks/useSttFeedback";
import { useTranscription } from "@/hooks/useTranscription";
import { useUpdater, type UpdaterApi } from "@/hooks/useUpdater";
import { useWindowControls } from "@/hooks/useWindowControls";
import {
  PROGRAMMATIC_RESIZE_GUARD_MS,
  useNativeResizeSync,
  useWindowFrameSync,
} from "@/hooks/useWindowFrameSync";
import { getDict } from "@/i18n";
import {
  cancelRecording,
  setWindowCollapsed,
  startWindowDrag,
  copyImageToClipboard,
} from "@/ipc/commands";
import { onEvent, type LogicalWindowSize } from "@/ipc/events";
import type { QuickAction, Settings } from "@/ipc/types";
import { chatSystemPrompt } from "@/lib/chat-request";
import type { ChatMessage } from "@/lib/chats";
import { appendTranscript } from "@/lib/composer";
import { extractHtmlBlocks } from "@/lib/html-blocks";
import { listeningState } from "@/lib/listening";
import { imagePngBase64, messageCopyImage, messageCopyText } from "@/lib/message-clipboard";
import { hasFailureNotification, notifyError } from "@/lib/notifications";
import { answerArrival, orbState, transcriptArrival } from "@/lib/orb";
import { mergePresets } from "@/lib/presets";
import { SHELL_COLUMN_GAP_PX, SHELL_PADDING_PX } from "@/lib/shell-layout";
import { applyChatFontSize, applyOpacity, applyTheme } from "@/lib/window-controls";
import { addDraftImage } from "@/state/chat-attachments";
import {
  appendAssistantMessage,
  duplicateChat,
  getActiveChat,
  getActiveChatId,
  patchChat,
  removeMessage as removeChatMessage,
  useActiveChatWithoutDraft,
} from "@/state/chats";
import {
  applyNativeWindowSize,
  bumpOpacity,
  bumpWindowSize,
  getCurrentSettings,
  saveSettings,
  useSettings,
  useSettingsBootstrap,
  useSettingsLoading,
} from "@/state/settings";
import { useIsStreaming, useStreamHasText } from "@/state/stream";
import { AutoModeIndicator } from "./AutoModeIndicator";
import { AutoTranscript } from "./AutoTranscript";
import { ChatTabs } from "./ChatTabs";
import { Composer } from "./Composer";
import { ConnectivityOverlay } from "./ConnectivityOverlay";
import { HotkeysPopover } from "./HotkeysPopover";
import { LiveAnswerPanel } from "./LiveAnswerPanel";
import { LiveTeleprompter } from "./LiveTeleprompter";
import { Orb } from "./Orb";
import { PreviewPanel } from "./PreviewPanel";
import { ScreenShareIndicator } from "./ScreenShareIndicator";
import { StatusBar, type ContextUsage, type StatusBarProps } from "./StatusBar";
import { UpdateDialog } from "./UpdateDialog";

/**
 * What the HUD paints from the settings. It is the translucent window with the
 * chat in it, so it takes all three; the launcher paints the theme alone.
 */
function applyHudVisuals(settings: Settings): void {
  applyOpacity(document.documentElement, settings.window_opacity);
  applyChatFontSize(document.documentElement, settings.chat_font_size);
  applyTheme(document.documentElement, settings.theme);
}

function lastHtmlBlock(markdown: string): string | undefined {
  const blocks = extractHtmlBlocks(markdown);
  return blocks[blocks.length - 1];
}

function lastAssistantMessage(messages: ChatMessage[]): ChatMessage | undefined {
  // Walk backwards rather than copying-and-reversing: this runs on every render,
  // and during a stream that is sixty times a second.
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "assistant") return message;
  }
  return undefined;
}

function copyLastAssistantMessage(messages: ChatMessage[]): void {
  const last = lastAssistantMessage(messages);
  if (last) void navigator.clipboard.writeText(last.text);
}

function lastAssistantText(messages: ChatMessage[]): string {
  return lastAssistantMessage(messages)?.text ?? "";
}

function updateBadge(updater: UpdaterApi, onOpen: () => void): StatusBarProps["update"] {
  if (updater.status === "idle" || !updater.info) return null;
  return {
    version: updater.info.version,
    busy: updater.status === "downloading" || updater.status === "restarting",
    onOpen,
  };
}

export function HudApp() {
  useSettingsBootstrap(applyHudVisuals);
  const dict = useDict();
  const settings = useSettings();
  const settingsLoading = useSettingsLoading();
  const state = useRecorder();
  useChatsStorage();
  // The active chat WITHOUT its draft: the draft changes on every keystroke and
  // is read by the composer alone (see `state/chats`), so the root sits out
  // typing entirely.
  const chat = useActiveChatWithoutDraft();
  const activeId = chat.id;
  const models = useModels();
  const updater = useUpdater();
  const notifications = useNotifications();

  const [updateOpen, setUpdateOpen] = useState(false);
  // Свёрнутость живёт в Rust: глобальный хоткей обрабатывается там же, и окно
  // меняет только Rust. Здесь мы её лишь отражаем.
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const resizeGuardUntilRef = useRef(0);
  const nativeSizeRef = useRef<LogicalWindowSize>({ width: 0, height: 0 });
  useEffect(
    () =>
      onEvent("collapsed-changed", ({ collapsed: next }) => {
        // Ref и гард ставятся СИНХРОННО, а не через состояние React. Событие
        // приходит из Rust раньше первого кадра твина, а состояние обновится
        // только к следующему рендеру — и кадры успевали проскочить мимо гейта
        // в useNativeResizeSync, из-за чего промежуточный размер оседал в
        // настройках как «сохранённый». Это и есть тот случайно меняющийся
        // размер окна.
        collapsedRef.current = next;
        resizeGuardUntilRef.current = Date.now() + PROGRAMMATIC_RESIZE_GUARD_MS;
        // Collapsing wipes the native-size echo: it holds the pre-collapse
        // width (preview included), and on expand useWindowFrameSync would take
        // it for an already-applied target and stay silent — the preview would
        // come back zero-width.
        if (next) nativeSizeRef.current = { width: 0, height: 0 };
        setCollapsed(next);
      }),
    [],
  );
  /**
   * Дописанный ответ разворачивает окно сам — но БЕЗ клавиатурного фокуса:
   * окно alwaysOnTop, то есть развернувшись оно уже видно, а отнимать
   * клавиатуру у чужого приложения без просьбы нельзя (то же основание, по
   * которому готовая расшифровка намеренно не поднимает окно).
   *
   * Разворачивает только ответ в АКТИВНОМ чате: чаты идут параллельно, и
   * развернуться на чат, где ничего не изменилось, значит соврать. Ответ в
   * фоновом чате по-прежнему зовёт точкой на клубке.
   */
  const [unreadAnswer, setUnreadAnswer] = useState(false);
  useEffect(
    () =>
      onEvent("transcript-ready", () => {
        if (
          transcriptArrival({
            collapsed: collapsedRef.current,
            autoSend: getCurrentSettings().auto_send,
          }) === "expand" &&
          // While the OS owns an orb drag, expanding would yank the window out
          // from under the cursor; the user is literally holding the orb.
          !orbDragInProgress()
        ) {
          void setWindowCollapsed(false, false);
        }
      }),
    [],
  );
  useEffect(
    () =>
      onEvent("llm-done", ({ chatId }) => {
        const arrival = answerArrival({
          collapsed: collapsedRef.current,
          chatId,
          activeChatId: getActiveChatId(),
        });
        // An answer that finishes mid-drag does not expand the window — it
        // calls back with the dot, like an answer in a background chat.
        if (arrival === "expand" && !orbDragInProgress()) {
          void setWindowCollapsed(false, false);
        } else if (arrival !== "ignore") {
          setUnreadAnswer(true);
        }
      }),
    [],
  );
  useEffect(() => {
    if (!collapsed) setUnreadAnswer(false);
  }, [collapsed]);
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const teleprompterResumeRef = useRef({ text: "", offset: 0 });

  const { showRetry, clearFeedback, retry } = useSttFeedback(state);
  const { previewHtml, previewOpen, openPreview, togglePreview, closePreview } = usePreviewPanel();
  useWindowFrameSync(
    settings.window_width,
    settings.window_height,
    previewOpen,
    collapsed,
    !settingsLoading,
    nativeSizeRef,
    resizeGuardUntilRef,
  );
  useNativeResizeSync(
    previewOpen,
    collapsedRef,
    !settingsLoading,
    nativeSizeRef,
    resizeGuardUntilRef,
    applyNativeWindowSize,
  );
  const chatColumnWidth = settings.window_width - SHELL_PADDING_PX * 2;

  const officialPresets = useOfficialPresets();
  const presets = useMemo(
    () => mergePresets(officialPresets, settings.prompt_presets),
    [officialPresets, settings.prompt_presets],
  );

  const contextLibrary = useContextLibrary();

  const updaterRef = useLatestRef(updater);
  const presetsRef = useLatestRef(presets);
  const libraryRef = useLatestRef(contextLibrary.library);

  const onScreenshotImage = useCallback((dataUrl: string, mediaType: string) => {
    void addDraftImage(getActiveChatId(), dataUrl, mediaType);
  }, []);
  const screenshot = useRegionScreenshot(onScreenshotImage);

  const onAssistantDone = useCallback(
    (chatId: string, text: string) => {
      if (text === "") return;
      appendAssistantMessage(chatId, text);
      if (!getCurrentSettings().auto_preview_html) return;
      if (chatId !== getActiveChatId()) return;
      const block = lastHtmlBlock(text);
      if (block !== undefined) openPreview(block);
    },
    [openPreview],
  );

  const stream = useClaudeStream(onAssistantDone);
  const streamRef = useLatestRef(stream);

  const { dispatchSend, dispatchQuickAction, dispatchAutoTurn, doSend, resendFromMessage } =
    useSendPipeline(streamRef, presetsRef, libraryRef);

  const autoMode = useAutoMode(dispatchAutoTurn, settings.auto_reply_instant);
  const autoModeRef = useLatestRef(autoMode);

  useTranscription(
    useCallback(
      (incoming: string) => {
        const target = getActiveChat();
        const merged = appendTranscript(target.draft, incoming);
        patchChat(target.id, { draft: merged });
        clearFeedback();
        if (getCurrentSettings().auto_send) dispatchSend(merged);
      },
      [dispatchSend, clearFeedback],
    ),
  );

  // Collapsed, the webview stays alive and keeps keyboard focus, so the
  // document-level handlers (⌘Enter, ⌘1…9, ⌘⇧N) would act on an invisible chat
  // — the blind send promptCoveredByOverlay exists to prevent. Gated through a
  // ref: useWindowControls subscribes at the document level and reads no state.
  const sendUnlessCollapsed = useCallback(() => {
    if (collapsedRef.current) return;
    doSend();
  }, [doSend]);
  // While collapsed the resize hotkey leaves the settings alone too: the user
  // presses blind, sees nothing, and would meet a different size on expand.
  const bumpWindowSizeUnlessCollapsed = useCallback<typeof bumpWindowSize>((dim, dir) => {
    if (collapsedRef.current) return;
    bumpWindowSize(dim, dir);
  }, []);
  useWindowControls(
    settings.hotkeys,
    sendUnlessCollapsed,
    bumpOpacity,
    bumpWindowSizeUnlessCollapsed,
  );
  const combos = useHotkeyCombos();
  usePttSuspend(combos.record);
  const connectivity = useConnectivity();
  const promptCoveredByOverlay = teleprompterOpen || connectivity.offline;
  const promptRef = usePromptFocus(promptCoveredByOverlay, collapsed);

  const duplicateActiveChat = useCallback(() => {
    duplicateChat(getActiveChatId());
  }, []);
  useDuplicateChatKey(
    combos.duplicate_chat,
    !promptCoveredByOverlay && !collapsed,
    duplicateActiveChat,
  );

  // The same derivation `QuickActionsBar` reads: ⌘2 on a button and ⌘2 in the
  // settings must be the same action, and the numbering follows the filter.
  const quickActions = useQuickActions();
  const runQuickAction = useCallback(
    (action: QuickAction) => {
      dispatchQuickAction(action.prompt, getCurrentSettings().quick_action_attachments);
    },
    [dispatchQuickAction],
  );
  const runQuickActionAt = useCallback(
    (index: number) => {
      // Collapse is the same blind case as an overlay: a quick action's prompt
      // is always non-empty, and ⌘1 from the orb would send with no composer.
      if (promptCoveredByOverlay || collapsedRef.current) return;
      const action = quickActions[index];
      if (action) runQuickAction(action);
    },
    [promptCoveredByOverlay, quickActions, runQuickAction],
  );
  useQuickActionKeys(combos.quick_action, quickActions.length, runQuickActionAt);

  useEffect(
    () =>
      onEvent("toggle-teleprompter", () => {
        setTeleprompterOpen((open) => !open);
      }),
    [],
  );

  useEffect(
    () =>
      onEvent("llm-usage", ({ chatId, inputTokens }) => {
        patchChat(chatId, { lastInputTokens: inputTokens });
      }),
    [],
  );

  // The root subscribes to the FLAGS, never to the text: they change twice per
  // answer, while the revealed text changes on every frame of the reveal loop
  // (see state/stream). The text has exactly one subscriber, LiveAnswerPanel.
  const activeStreaming = useIsStreaming(activeId);
  const streamHasText = useStreamHasText(activeId);
  const stopActiveStream = useCallback(() => {
    stream.stop(getActiveChatId());
  }, [stream]);
  // Пока открыт суфлёр, Escape принадлежит ему — своё действие в реестре.
  useCancelKey(
    combos.cancel_recording,
    promptCoveredByOverlay ? null : cancellable(state === "recording", activeStreaming),
    () => void cancelRecording(),
    stopActiveStream,
  );

  // «Есть ли ошибка» для строки захвата и для клубка теперь тоже временное
  // состояние: оно живёт ровно столько, сколько живёт само уведомление.
  // The one join no slice can do for the header: three single-instance hooks
  // (the recorder, auto mode and the notification stack) meet the settings here.
  const hasError = hasFailureNotification(notifications);
  const listening = listeningState({
    state,
    autoListening: autoMode.active,
    bufferEnabled: settings.buffer_enabled,
    hasError,
  });
  const hasAssistantReply = chat.messages.some((m) => m.role === "assistant");
  const canCopy = !activeStreaming && hasAssistantReply;
  const canTeleprompt = hasAssistantReply || streamHasText;
  const activeModelMaxInput = models.find((m) => m.id === chat.model)?.maxInputTokens ?? 0;
  const activeSystem = useMemo(
    () => chatSystemPrompt(presets, chat, contextLibrary.library),
    [presets, chat, contextLibrary.library],
  );
  const projectedTokens = useProjectedContextTokens(chat, activeSystem, activeStreaming);
  const usedTokens = projectedTokens > 0 ? projectedTokens : chat.lastInputTokens;
  const contextUsage: ContextUsage | null =
    activeModelMaxInput > 0 && usedTokens > 0
      ? { usedTokens, maxTokens: activeModelMaxInput }
      : null;

  // Every one of these goes into a prop of a memoised child, so a fresh identity
  // per render would undo the memo. The current values are read through refs
  // rather than closed over, which is what lets the dependency lists be empty.
  const saveSettingsReportingError = useCallback((next: Settings) => {
    void saveSettings(next).then((err) => {
      if (err) notifyError(getDict().hud.notifications.settingsSaveFailed, err);
    });
  }, []);

  const copyMessage = useCallback((index: number) => {
    const message = getActiveChat().messages[index];
    if (!message) return;
    const text = messageCopyText(message);
    if (text !== "") {
      void navigator.clipboard.writeText(text);
      return;
    }
    const image = messageCopyImage(message);
    if (!image) return;
    void imagePngBase64(image)
      .then(copyImageToClipboard)
      .catch(() => {
        notifyError(getDict().hud.notifications.copyImageFailed);
      });
  }, []);

  const removeMessage = useCallback((index: number) => {
    removeChatMessage(getActiveChatId(), index);
  }, []);

  const toggleScreenShareVisible = useCallback(() => {
    const current = getCurrentSettings();
    saveSettingsReportingError({
      ...current,
      screen_share_visible: !current.screen_share_visible,
    });
  }, [saveSettingsReportingError]);

  /**
   * Пауза выключает ВСЁ пассивное — фоновый буфер и автослушание. Пуш-ту-ток
   * остаётся: удержание клавиши не пассивное прослушивание, и отнимать его
   * значило бы сделать паузу второй кнопкой «Стоп».
   */
  const togglePassiveListening = useCallback(() => {
    const current = getCurrentSettings();
    const resuming = !current.buffer_enabled;
    if (!resuming && autoModeRef.current.active) autoModeRef.current.toggle();
    saveSettingsReportingError({ ...current, buffer_enabled: resuming });
  }, [autoModeRef, saveSettingsReportingError]);

  const skipUpdate = useCallback(() => {
    const skipped = updaterRef.current.info?.version ?? "";
    setUpdateOpen(false);
    updaterRef.current.dismiss();
    saveSettingsReportingError({ ...getCurrentSettings(), skipped_version: skipped });
  }, [updaterRef, saveSettingsReportingError]);

  const onShellDragStart = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button === 0 && event.target === event.currentTarget) void startWindowDrag();
  }, []);

  if (collapsed)
    return (
      <Orb
        state={orbState({
          state,
          autoListening: autoMode.active,
          bufferEnabled: settings.buffer_enabled,
          hasError,
          streaming: activeStreaming,
          answerReady: unreadAnswer,
        })}
        onExpand={() => void setWindowCollapsed(false, true)}
      />
    );

  return (
    <div
      className="app-shell relative flex h-screen overflow-hidden rounded-[var(--window-radius)]"
      style={{ gap: SHELL_COLUMN_GAP_PX, padding: SHELL_PADDING_PX }}
      onMouseDown={onShellDragStart}
    >
      <div className="flex shrink-0 flex-col gap-2.5" style={{ width: chatColumnWidth }}>
        <StatusBar
          listening={listening}
          onTogglePause={togglePassiveListening}
          contextUsage={contextUsage}
          update={updateBadge(updater, () => {
            setUpdateOpen(true);
          })}
          tabs={<ChatTabs onStopStream={stream.stop} duplicateCombo={combos.duplicate_chat} />}
          actions={
            <>
              <AutoModeIndicator
                active={autoMode.active}
                combo={combos.auto_mode}
                onToggle={autoMode.toggle}
              />
              <ScreenShareIndicator
                visible={settings.screen_share_visible}
                onToggle={toggleScreenShareVisible}
              />
              {canTeleprompt && (
                <IconButton
                  title={dict.hud.statusBar.openTeleprompter}
                  onClick={() => {
                    setTeleprompterOpen(true);
                  }}
                >
                  <ScrollText />
                </IconButton>
              )}
              {canCopy && (
                <IconButton
                  title={dict.hud.statusBar.copyLastAnswer}
                  onClick={() => {
                    copyLastAssistantMessage(chat.messages);
                  }}
                >
                  <Copy />
                </IconButton>
              )}
              <HotkeysPopover hotkeys={settings.hotkeys} />
            </>
          }
        />

        <PanelErrorBoundary label="answer" title={dict.hud.boundaries.answer}>
          <LiveAnswerPanel
            recordCombo={combos.record}
            messages={chat.messages}
            chatId={activeId}
            scrollStep={settings.scroll_step}
            scrollModifier={combos.scroll_chat}
            onTogglePreview={togglePreview}
            onCopyMessage={copyMessage}
            onRemoveMessage={removeMessage}
            onResendMessage={resendFromMessage}
          />
        </PanelErrorBoundary>

        {autoMode.active && (
          <AutoTranscript
            turns={autoMode.turns}
            submittedThrough={autoMode.submittedThrough}
            pendingCount={autoMode.pending.length}
            instant={settings.auto_reply_instant}
            answerCombo={combos.auto_answer}
            onAnswer={autoMode.answer}
          />
        )}

        {/* В потоке, а не поверх интерфейса — ровно там же, где появляется
            AutoTranscript. В окне шириной в 400 точек любой плавающий слой
            закрывает либо объект захвата («меня слышно?»), либо поле ввода;
            здесь панель ответа просто отдаёт высоту и забирает обратно. */}
        <NotificationStack />

        <Composer
          onSend={doSend}
          onStop={() => {
            stream.stop(activeId);
          }}
          onRetry={retry}
          showRetry={showRetry}
          presets={presets}
          library={contextLibrary.library}
          onCaptureRegion={screenshot.capture}
          promptRef={promptRef}
          onQuickAction={runQuickAction}
        />
      </div>

      {previewOpen && (
        <PanelErrorBoundary label="preview" title={dict.hud.boundaries.preview}>
          <PreviewPanel html={previewHtml} onClose={closePreview} />
        </PanelErrorBoundary>
      )}

      {teleprompterOpen && (
        <LiveTeleprompter
          chatId={activeId}
          fallbackText={lastAssistantText(chat.messages)}
          resume={settings.teleprompter_resume}
          resumeRef={teleprompterResumeRef}
          initialSpeed={settings.teleprompter_speed}
          initialFontSize={settings.teleprompter_font_size}
          closeCombo={combos.teleprompter_close}
          pauseCombo={combos.teleprompter_pause}
          onPersistSettings={(speed, fontSize) => {
            saveSettingsReportingError({
              ...getCurrentSettings(),
              teleprompter_speed: speed,
              teleprompter_font_size: fontSize,
            });
          }}
          onClose={() => {
            setTeleprompterOpen(false);
          }}
        />
      )}

      {connectivity.offline && <ConnectivityOverlay />}

      {updater.info && (
        <UpdateDialog
          open={updateOpen}
          info={updater.info}
          status={updater.status}
          progress={updater.progress}
          error={updater.error}
          currentVersion={updater.currentVersion}
          onClose={() => {
            setUpdateOpen(false);
          }}
          onInstall={updater.install}
          onSkip={skipUpdate}
        />
      )}
    </div>
  );
}
