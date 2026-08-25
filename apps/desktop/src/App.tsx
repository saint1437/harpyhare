import { useQuery } from "@tanstack/react-query";
import { Copy, ScrollText } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { AnswerPanel } from "@/components/AnswerPanel";
import { AutoModeIndicator } from "@/components/AutoModeIndicator";
import { AutoTranscript } from "@/components/AutoTranscript";
import { ChatTabs } from "@/components/ChatTabs";
import { Composer } from "@/components/Composer";
import { ConnectivityOverlay } from "@/components/ConnectivityOverlay";
import { HotkeysPopover } from "@/components/HotkeysPopover";
import { IconButton } from "@/components/IconButton";
import { Orb } from "@/components/Orb";
import { PREVIEW_PANEL_WIDTH_PX, PreviewPanel } from "@/components/PreviewPanel";
import { ScreenShareIndicator } from "@/components/ScreenShareIndicator";
import { StatusBar, type ContextUsage, type StatusBarProps } from "@/components/StatusBar";
import { Teleprompter } from "@/components/Teleprompter";
import { UpdateDialog } from "@/components/UpdateDialog";
import { useAutoMode, type AutoModeApi } from "@/hooks/useAutoMode";
import { useChats, type ChatsApi } from "@/hooks/useChats";
import { useClaudeStream, type ClaudeStreams } from "@/hooks/useClaudeStream";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useContextLibrary } from "@/hooks/useContextLibrary";
import { useDuplicateChatKey } from "@/hooks/useDuplicateChatKey";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useModels } from "@/hooks/useModels";
import { useOfficialPresets } from "@/hooks/useOfficialPresets";
import { usePromptFocus } from "@/hooks/usePromptFocus";
import { usePttSuspend } from "@/hooks/usePttSuspend";
import { useQuickActionKeys } from "@/hooks/useQuickActionKeys";
import { useRecorder } from "@/hooks/useRecorder";
import { useRegionScreenshot } from "@/hooks/useRegionScreenshot";
import { useSettings } from "@/hooks/useSettings";
import { useTranscription } from "@/hooks/useTranscription";
import { useUpdater, type UpdaterApi } from "@/hooks/useUpdater";
import { useWindowControls } from "@/hooks/useWindowControls";
import {
  closeApp,
  countChatTokens,
  retryTranscription,
  setWindowCollapsed,
  setWindowSize,
  startWindowDrag,
  stopMainWindow,
  copyImageToClipboard,
} from "@/ipc/commands";
import { onEvent, onWindowResized, type LogicalWindowSize } from "@/ipc/events";
import type {
  ChatMessageDto,
  HotkeyBinding,
  ImagePayload,
  QuickAction,
  RecorderState,
  Settings,
} from "@/ipc/types";
import { planDispatch } from "@/lib/auto-turns";
import {
  attachmentImage,
  chatRequestOptions,
  type Chat,
  type ChatImage,
  type ChatMessage,
} from "@/lib/chats";
import { appendTranscript } from "@/lib/composer";
import { libraryContextBlocks, type ContextLibrary } from "@/lib/context-library";
import { internalError, isNetworkError, isRetryable, type AppError } from "@/lib/errors";
import { effectiveCombo } from "@/lib/hotkeys";
import { extractHtmlBlocks } from "@/lib/html-blocks";
import { imagePngBase64, messageCopyImage, messageCopyText } from "@/lib/message-clipboard";
import type { ModelInfo } from "@/lib/models";
import { answerArrival, orbState } from "@/lib/orb";
import { mergePresets, presetText, type PromptPreset } from "@/lib/presets";
import { queryKeys } from "@/lib/query-client";
import { filledQuickActions } from "@/lib/quick-actions";
import { toReadingText } from "@/lib/teleprompter";
import { nativeSizeEcho, windowSizesEqual } from "@/lib/window-size";

const SHELL_COLUMN_GAP_PX = 10;
const SHELL_PADDING_PX = 12;
const PREVIEW_EXTRA_WIDTH_PX = PREVIEW_PANEL_WIDTH_PX + SHELL_COLUMN_GAP_PX;

const USER_CONTEXT_SYSTEM_HEADER = "Контекст от пользователя (справочные материалы):\n";
const SYSTEM_BLOCKS_SEPARATOR = "\n\n";

const settingsSaveErrorText = (err: string) => `Ошибка сохранения настроек: ${err}`;
const NOOP = () => undefined;
const COPY_IMAGE_ERROR_TEXT = "Не удалось скопировать картинку в буфер обмена";

function historyWithNewUserMessage(
  chat: Chat,
  text: string,
  images: ChatImage[],
): ChatMessageDto[] {
  return [
    ...chat.messages.map((m) => ({ role: m.role, text: m.text, images: requestImages(m.images) })),
    { role: "user", text, images: requestImages(images) },
  ];
}

function draftImages(chat: Chat): ChatImage[] {
  return chat.draftAttachments.map(attachmentImage);
}

function requestImages(images: ChatImage[]): ImagePayload[] {
  return images.map(({ media_type, data }) => ({ media_type, data }));
}

function chatSystemPrompt(presets: PromptPreset[], chat: Chat, library: ContextLibrary): string {
  const context = chat.context.trim();
  return [
    presetText(presets, chat.presetId),
    ...libraryContextBlocks(library, chat.libraryDocIds),
    context === "" ? "" : `${USER_CONTEXT_SYSTEM_HEADER}${context}`,
  ]
    .filter((s) => s !== "")
    .join(SYSTEM_BLOCKS_SEPARATOR);
}

function lastHtmlBlock(markdown: string): string | undefined {
  const blocks = extractHtmlBlocks(markdown);
  return blocks[blocks.length - 1];
}

function copyLastAssistantMessage(messages: ChatMessage[]): void {
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  if (last) void navigator.clipboard.writeText(last.text);
}

function lastAssistantText(messages: ChatMessage[]): string {
  return [...messages].reverse().find((m) => m.role === "assistant")?.text ?? "";
}

function updateBadge(updater: UpdaterApi, onOpen: () => void): StatusBarProps["update"] {
  if (updater.status === "idle" || !updater.info) return null;
  return {
    version: updater.info.version,
    busy: updater.status === "downloading" || updater.status === "restarting",
    onOpen,
  };
}

interface SttFeedback {
  sttError: AppError | null;
  showRetry: boolean;
  setSttError: (err: AppError | null) => void;
  clearError: () => void;
  clearFeedback: () => void;
  retry: () => void;
}

function useSttFeedback(state: RecorderState): SttFeedback {
  const [sttError, setSttError] = useState<AppError | null>(null);
  const [showRetry, setShowRetry] = useState(false);

  useEffect(
    () =>
      onEvent("stt-error", (err) => {
        setSttError(err);
        setShowRetry(isRetryable(err));
      }),
    [],
  );

  useEffect(() => {
    if (state === "recording") {
      setSttError(null);
      setShowRetry(false);
    }
  }, [state]);

  const clearError = useCallback(() => {
    setSttError(null);
  }, []);

  const clearFeedback = useCallback(() => {
    setSttError(null);
    setShowRetry(false);
  }, []);

  const retry = useCallback(() => {
    setShowRetry(false);
    void retryTranscription();
  }, []);

  return { sttError, showRetry, setSttError, clearError, clearFeedback, retry };
}

interface PreviewPanelState {
  previewHtml: string;
  previewOpen: boolean;
  openPreview: (code: string) => void;
  togglePreview: (code: string) => void;
  closePreview: () => void;
}

function usePreviewPanel(): PreviewPanelState {
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const currentRef = useRef({ html: previewHtml, open: previewOpen });
  currentRef.current = { html: previewHtml, open: previewOpen };

  const openPreview = useCallback((code: string) => {
    setPreviewHtml(code);
    setPreviewOpen(true);
  }, []);

  const togglePreview = useCallback((code: string) => {
    if (currentRef.current.open && currentRef.current.html === code) {
      setPreviewOpen(false);
    } else {
      setPreviewHtml(code);
      setPreviewOpen(true);
    }
  }, []);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
  }, []);

  return { previewHtml, previewOpen, openPreview, togglePreview, closePreview };
}

const PROGRAMMATIC_RESIZE_GUARD_MS = 600;

function useWindowFrameSync(
  windowWidth: number,
  windowHeight: number,
  previewOpen: boolean,
  ready: boolean,
  nativeSizeRef: RefObject<LogicalWindowSize>,
  guardUntilRef: RefObject<number>,
): void {
  useEffect(() => {
    if (!ready) return;
    const extra = previewOpen ? PREVIEW_EXTRA_WIDTH_PX : 0;
    const target = { width: windowWidth + extra, height: windowHeight };
    if (windowSizesEqual(target, nativeSizeEcho(nativeSizeRef.current, extra))) return;
    guardUntilRef.current = Date.now() + PROGRAMMATIC_RESIZE_GUARD_MS;
    void setWindowSize(target.width, target.height);
  }, [windowWidth, windowHeight, previewOpen, ready, nativeSizeRef, guardUntilRef]);
}

function useNativeResizeSync(
  previewOpen: boolean,
  collapsed: boolean,
  ready: boolean,
  nativeSizeRef: RefObject<LogicalWindowSize>,
  guardUntilRef: RefObject<number>,
  applyNativeWindowSize: (width: number, height: number) => void,
): void {
  const previewOpenRef = useLatestRef(previewOpen);
  // Свёрнутое окно — 72×72; без этого гейта размер клубка уехал бы в
  // window_width/height и стал бы «сохранённым размером» HUD.
  const collapsedRef = useLatestRef(collapsed);
  const readyRef = useLatestRef(ready);
  const applyRef = useLatestRef(applyNativeWindowSize);
  useEffect(() => {
    let pending = 0;
    const stop = onWindowResized((size) => {
      if (collapsedRef.current) return;
      nativeSizeRef.current = size;
      if (!readyRef.current) return;
      if (Date.now() < guardUntilRef.current) return;
      if (pending !== 0) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        const latest = nativeSizeRef.current;
        const base = latest.width - (previewOpenRef.current ? PREVIEW_EXTRA_WIDTH_PX : 0);
        applyRef.current(base, latest.height);
      });
    });
    return () => {
      stop();
      cancelAnimationFrame(pending);
    };
  }, [nativeSizeRef, guardUntilRef, previewOpenRef, collapsedRef, readyRef, applyRef]);
}

const TOKEN_COUNT_PLACEHOLDER_MESSAGE: ChatMessageDto = { role: "user", text: ".", images: [] };
const PROJECTED_TOKENS_STALE_MS = 10 * 60 * 1000;

function useProjectedContextTokens(chat: Chat, system: string, streaming: boolean): number {
  const messagesKey = chat.messages.map((m) => `${m.role}:${String(m.text.length)}`).join("|");
  const { data } = useQuery({
    queryKey: queryKeys.countTokens(chat.model, chatRequestOptions(chat), system, messagesKey),
    queryFn: () => {
      const history: ChatMessageDto[] =
        chat.messages.length > 0
          ? chat.messages.map((m) => ({
              role: m.role,
              text: m.text,
              images: requestImages(m.images),
            }))
          : [TOKEN_COUNT_PLACEHOLDER_MESSAGE];
      return countChatTokens(history, system, chat.model, chatRequestOptions(chat));
    },
    enabled: !streaming,
    staleTime: PROJECTED_TOKENS_STALE_MS,
    placeholderData: (prev) => prev,
  });
  return data ?? 0;
}

interface SendPipeline {
  dispatchSend: (rawText: string) => void;
  dispatchQuickAction: (prompt: string, withAttachments: boolean) => void;
  dispatchAutoTurn: (text: string) => boolean;
  doSend: () => void;
  resendFromMessage: (index: number) => void;
}

function useSendPipeline(
  chatsRef: RefObject<ChatsApi>,
  streamRef: RefObject<ClaudeStreams>,
  presetsRef: RefObject<PromptPreset[]>,
  libraryRef: RefObject<ContextLibrary>,
  clearSttError: () => void,
): SendPipeline {
  const streamChat = useCallback(
    (chat: Chat, history: ChatMessageDto[]) => {
      const system = chatSystemPrompt(presetsRef.current, chat, libraryRef.current);
      void streamRef.current.send(chat.id, history, system, chat.model, chatRequestOptions(chat));
    },
    [streamRef, presetsRef, libraryRef],
  );

  const dispatchSend = useCallback(
    (rawText: string) => {
      const chat = chatsRef.current.active;
      if (streamRef.current.streaming[chat.id]) return;
      const trimmed = rawText.trim();
      const images = draftImages(chat);
      if (trimmed === "" && images.length === 0) return;
      clearSttError();
      chatsRef.current.appendUserMessage(chat.id, trimmed, images);
      streamChat(chat, historyWithNewUserMessage(chat, trimmed, images));
    },
    [chatsRef, streamRef, clearSttError, streamChat],
  );

  const dispatchQuickAction = useCallback(
    (prompt: string, withAttachments: boolean) => {
      const chat = chatsRef.current.active;
      if (streamRef.current.streaming[chat.id]) return;
      const trimmed = prompt.trim();
      if (trimmed === "") return;
      const images = withAttachments ? draftImages(chat) : [];
      clearSttError();
      chatsRef.current.appendQuickActionMessage(chat.id, trimmed, images);
      streamChat(chat, historyWithNewUserMessage(chat, trimmed, images));
    },
    [chatsRef, streamRef, clearSttError, streamChat],
  );

  const dispatchAutoTurn = useCallback(
    (text: string) => {
      const chat = chatsRef.current.active;
      const streaming = streamRef.current.streaming[chat.id] === true;
      const { interrupt, send } = planDispatch(text, streaming);
      if (!send) return false;
      // Fire-and-forget is safe here only because `send` awaits the cancellation this
      // starts; the replacement request cannot outrun it.
      if (interrupt) void streamRef.current.abandon(chat.id);
      clearSttError();
      const trimmed = text.trim();
      chatsRef.current.appendAutoTurnMessage(chat.id, trimmed);
      streamChat(chat, historyWithNewUserMessage(chat, trimmed, []));
      return true;
    },
    [chatsRef, streamRef, clearSttError, streamChat],
  );

  const doSend = useCallback(() => {
    dispatchSend(chatsRef.current.active.draft);
  }, [dispatchSend, chatsRef]);

  const resendFromMessage = useCallback(
    (index: number) => {
      const chat = chatsRef.current.active;
      if (streamRef.current.streaming[chat.id]) return;
      if (chat.messages[index]?.role !== "user") return;
      clearSttError();
      const kept = chat.messages.slice(0, index + 1);
      chatsRef.current.truncateMessages(chat.id, kept.length);
      streamChat(
        chat,
        kept.map((m) => ({ role: m.role, text: m.text, images: requestImages(m.images) })),
      );
    },
    [chatsRef, streamRef, clearSttError, streamChat],
  );

  return { dispatchSend, dispatchQuickAction, dispatchAutoTurn, doSend, resendFromMessage };
}

interface AppHeaderProps {
  state: RecorderState;
  autoMode: AutoModeApi;
  error: AppError | null;
  hotkeys: HotkeyBinding[];
  updater: UpdaterApi;
  chats: ChatsApi;
  stream: ClaudeStreams;
  canCopy: boolean;
  canTeleprompt: boolean;
  contextUsage: ContextUsage | null;
  screenShareVisible: boolean;
  bufferEnabled: boolean;
  onTogglePause: () => void;
  onToggleScreenShare: () => void;
  onCopy: () => void;
  onOpenTeleprompter: () => void;
  onStop: () => void;
  onOpenUpdate: () => void;
}

function AppHeader({
  state,
  autoMode,
  error,
  hotkeys,
  updater,
  chats,
  stream,
  canCopy,
  canTeleprompt,
  contextUsage,
  screenShareVisible,
  bufferEnabled,
  onTogglePause,
  onToggleScreenShare,
  onCopy,
  onOpenTeleprompter,
  onStop,
  onOpenUpdate,
}: AppHeaderProps) {
  return (
    <StatusBar
      state={state}
      autoListening={autoMode.active}
      bufferEnabled={bufferEnabled}
      onTogglePause={onTogglePause}
      onQuit={() => void closeApp()}
      error={error?.message ?? null}
      toggleHotkey={effectiveCombo(hotkeys, "toggle_window")}
      contextUsage={contextUsage}
      update={updateBadge(updater, onOpenUpdate)}
      onStop={onStop}
      onCollapse={() => void setWindowCollapsed(true, false)}
      tabs={
        <ChatTabs
          chats={chats.chats}
          activeId={chats.activeId}
          streaming={stream.streaming}
          onSelect={chats.selectChat}
          onRemove={(id) => {
            stream.stop(id);
            chats.removeChat(id);
          }}
          onNew={chats.newChat}
          onDuplicate={() => {
            chats.duplicateChat(chats.activeId);
          }}
          duplicateCombo={effectiveCombo(hotkeys, "duplicate_chat")}
        />
      }
      actions={
        <>
          <AutoModeIndicator
            active={autoMode.active}
            combo={effectiveCombo(hotkeys, "auto_mode")}
            onToggle={autoMode.toggle}
          />
          <ScreenShareIndicator visible={screenShareVisible} onToggle={onToggleScreenShare} />
          {canTeleprompt && (
            <IconButton title="Суфлёр" onClick={onOpenTeleprompter}>
              <ScrollText />
            </IconButton>
          )}
          {canCopy && (
            <IconButton title="Копировать последний ответ" onClick={onCopy}>
              <Copy />
            </IconButton>
          )}
          <HotkeysPopover hotkeys={hotkeys} />
        </>
      }
    />
  );
}

interface AppComposerProps {
  chats: ChatsApi;
  models: ModelInfo[];
  presets: PromptPreset[];
  library: ContextLibrary;
  onCaptureRegion: () => void;
  streaming: boolean;
  showRetry: boolean;
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  quickActions: QuickAction[];
  quickActionCombo: string;
  onQuickAction: (action: QuickAction) => void;
}

function AppComposer({
  chats,
  models,
  presets,
  library,
  onCaptureRegion,
  streaming,
  showRetry,
  onSend,
  onStop,
  onRetry,
  promptRef,
  quickActions,
  quickActionCombo,
  onQuickAction,
}: AppComposerProps) {
  const { active, activeId } = chats;
  return (
    <Composer
      chat={active}
      onPatch={(patch) => {
        chats.patchChat(activeId, patch);
      }}
      onRemoveAttachment={(i) => {
        chats.removeDraftAttachment(activeId, i);
      }}
      onPaste={(items) => void chats.addDraftAttachments(activeId, items)}
      onSend={onSend}
      onStop={onStop}
      onClearHistory={() => {
        chats.clearMessages(activeId);
      }}
      onRetry={onRetry}
      streaming={streaming}
      showRetry={showRetry}
      presets={presets}
      library={library}
      models={models}
      onCaptureRegion={onCaptureRegion}
      promptRef={promptRef}
      quickActions={quickActions}
      quickActionCombo={quickActionCombo}
      onQuickAction={onQuickAction}
    />
  );
}

export default function App() {
  const {
    settings,
    loading: settingsLoading,
    save,
    bumpOpacity,
    bumpWindowSize,
    applyNativeWindowSize,
  } = useSettings();
  const state = useRecorder();
  const chats = useChats();
  const models = useModels();
  const updater = useUpdater();

  const [updateOpen, setUpdateOpen] = useState(false);
  // Свёрнутость живёт в Rust: глобальный хоткей обрабатывается там же, и окно
  // меняет только Rust. Здесь мы её лишь отражаем.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(
    () =>
      onEvent("collapsed-changed", ({ collapsed: next }) => {
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
  const collapsedRef = useLatestRef(collapsed);
  const activeChatRef = useLatestRef(chats.activeId);
  useEffect(
    () =>
      onEvent("llm-done", ({ chatId }) => {
        const arrival = answerArrival({
          collapsed: collapsedRef.current,
          chatId,
          activeChatId: activeChatRef.current,
        });
        if (arrival === "expand") void setWindowCollapsed(false, false);
        if (arrival === "notify") setUnreadAnswer(true);
      }),
    [collapsedRef, activeChatRef],
  );
  useEffect(() => {
    if (!collapsed) setUnreadAnswer(false);
  }, [collapsed]);
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const teleprompterResumeRef = useRef({ text: "", offset: 0 });

  const { sttError, showRetry, setSttError, clearError, clearFeedback, retry } =
    useSttFeedback(state);
  const { previewHtml, previewOpen, openPreview, togglePreview, closePreview } = usePreviewPanel();
  const nativeSizeRef = useRef<LogicalWindowSize>({ width: 0, height: 0 });
  const resizeGuardUntilRef = useRef(0);
  useWindowFrameSync(
    settings.window_width,
    settings.window_height,
    previewOpen,
    !settingsLoading,
    nativeSizeRef,
    resizeGuardUntilRef,
  );
  useNativeResizeSync(
    previewOpen,
    collapsed,
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

  const settingsRef = useLatestRef(settings);
  const presetsRef = useLatestRef(presets);
  const chatsRef = useLatestRef(chats);
  const libraryRef = useLatestRef(contextLibrary.library);

  const onScreenshotImage = useCallback(
    (dataUrl: string, mediaType: string) => {
      void chatsRef.current.addDraftImage(chatsRef.current.activeId, dataUrl, mediaType);
    },
    [chatsRef],
  );
  const screenshot = useRegionScreenshot(onScreenshotImage);
  const clearScreenshotError = screenshot.clearError;
  const clearAutoModeErrorRef = useRef<() => void>(NOOP);
  const clearAllErrors = useCallback(() => {
    clearError();
    clearScreenshotError();
    clearAutoModeErrorRef.current();
  }, [clearError, clearScreenshotError, clearAutoModeErrorRef]);

  const onAssistantDone = useCallback(
    (chatId: string, text: string) => {
      if (text === "") return;
      chatsRef.current.appendAssistantMessage(chatId, text);
      if (!settingsRef.current.auto_preview_html) return;
      if (chatId !== chatsRef.current.activeId) return;
      const block = lastHtmlBlock(text);
      if (block !== undefined) openPreview(block);
    },
    [chatsRef, settingsRef, openPreview],
  );

  const stream = useClaudeStream(onAssistantDone);
  const streamRef = useLatestRef(stream);

  const { dispatchSend, dispatchQuickAction, dispatchAutoTurn, doSend, resendFromMessage } =
    useSendPipeline(chatsRef, streamRef, presetsRef, libraryRef, clearAllErrors);

  const autoMode = useAutoMode(dispatchAutoTurn, settings.auto_reply_instant);
  const clearAutoModeError = autoMode.clearError;
  useEffect(() => {
    clearAutoModeErrorRef.current = clearAutoModeError;
  }, [clearAutoModeError]);

  useTranscription(
    useCallback(
      (incoming: string) => {
        const chat = chatsRef.current.active;
        const merged = appendTranscript(chat.draft, incoming);
        chatsRef.current.patchChat(chat.id, { draft: merged });
        clearFeedback();
        if (settingsRef.current.auto_send) dispatchSend(merged);
      },
      [chatsRef, settingsRef, dispatchSend, clearFeedback],
    ),
  );

  useWindowControls(settings.hotkeys, doSend, bumpOpacity, bumpWindowSize);
  usePttSuspend(effectiveCombo(settings.hotkeys, "record"));
  const connectivity = useConnectivity();
  const promptCoveredByOverlay = teleprompterOpen || connectivity.offline;
  const promptRef = usePromptFocus(promptCoveredByOverlay, collapsed);

  const duplicateActiveChat = useCallback(() => {
    chatsRef.current.duplicateChat(chatsRef.current.activeId);
  }, [chatsRef]);
  useDuplicateChatKey(
    effectiveCombo(settings.hotkeys, "duplicate_chat"),
    !promptCoveredByOverlay,
    duplicateActiveChat,
  );

  const quickActions = useMemo(
    () => (settingsLoading ? [] : filledQuickActions(settings.quick_actions)),
    [settingsLoading, settings.quick_actions],
  );
  const quickActionCombo = effectiveCombo(settings.hotkeys, "quick_action");
  const quickActionAttachments = settings.quick_action_attachments;
  const runQuickAction = useCallback(
    (action: QuickAction) => {
      dispatchQuickAction(action.prompt, quickActionAttachments);
    },
    [dispatchQuickAction, quickActionAttachments],
  );
  const runQuickActionAt = useCallback(
    (index: number) => {
      if (promptCoveredByOverlay) return;
      const action = quickActions[index];
      if (action) runQuickAction(action);
    },
    [promptCoveredByOverlay, quickActions, runQuickAction],
  );
  useQuickActionKeys(quickActionCombo, quickActions.length, runQuickActionAt);

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
        chatsRef.current.patchChat(chatId, { lastInputTokens: inputTokens });
      }),
    [chatsRef],
  );

  const active = chats.active;
  const activeId = chats.activeId;
  const activeStreaming = !!stream.streaming[activeId];
  const error: AppError | null =
    sttError ?? autoMode.error ?? screenshot.error ?? stream.error[activeId] ?? null;
  const partial = activeStreaming ? (stream.partial[activeId] ?? "") : null;
  const reportNetworkError = connectivity.reportNetworkError;
  useEffect(() => {
    if (isNetworkError(error)) reportNetworkError();
  }, [error, reportNetworkError]);
  const teleprompterText = toReadingText(
    partial !== null && partial !== "" ? partial : lastAssistantText(active.messages),
  );
  const hasAssistantReply = active.messages.some((m) => m.role === "assistant");
  const canCopy = !activeStreaming && hasAssistantReply;
  const canTeleprompt = hasAssistantReply || (partial !== null && partial !== "");
  const activeModelMaxInput = models.find((m) => m.id === active.model)?.maxInputTokens ?? 0;
  const activeSystem = useMemo(
    () => chatSystemPrompt(presets, active, contextLibrary.library),
    [presets, active, contextLibrary.library],
  );
  const projectedTokens = useProjectedContextTokens(active, activeSystem, activeStreaming);
  const usedTokens = projectedTokens > 0 ? projectedTokens : active.lastInputTokens;
  const contextUsage: ContextUsage | null =
    activeModelMaxInput > 0 && usedTokens > 0
      ? { usedTokens, maxTokens: activeModelMaxInput }
      : null;

  const saveSettingsReportingError = (next: Settings) => {
    void save(next).then((err) => {
      if (err) setSttError(internalError(settingsSaveErrorText(err)));
    });
  };

  const copyMessage = (index: number) => {
    const message = chatsRef.current.active.messages[index];
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
        setSttError(internalError(COPY_IMAGE_ERROR_TEXT));
      });
  };

  const toggleScreenShareVisible = () => {
    const current = settingsRef.current;
    saveSettingsReportingError({
      ...current,
      screen_share_visible: !current.screen_share_visible,
    });
  };

  /**
   * Пауза выключает ВСЁ пассивное — фоновый буфер и автослушание. Пуш-ту-ток
   * остаётся: удержание клавиши не пассивное прослушивание, и отнимать его
   * значило бы сделать паузу второй кнопкой «Стоп».
   */
  const togglePassiveListening = () => {
    const current = settingsRef.current;
    const resuming = !current.buffer_enabled;
    if (!resuming && autoMode.active) autoMode.toggle();
    saveSettingsReportingError({ ...current, buffer_enabled: resuming });
  };

  const skipUpdate = () => {
    const skipped = updater.info?.version ?? "";
    setUpdateOpen(false);
    updater.dismiss();
    saveSettingsReportingError({ ...settingsRef.current, skipped_version: skipped });
  };

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
          hasError: error !== null,
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
        <AppHeader
          state={state}
          autoMode={autoMode}
          error={error}
          hotkeys={settings.hotkeys}
          updater={updater}
          chats={chats}
          stream={stream}
          canCopy={canCopy}
          canTeleprompt={canTeleprompt}
          contextUsage={contextUsage}
          screenShareVisible={settings.screen_share_visible}
          bufferEnabled={settings.buffer_enabled}
          onTogglePause={togglePassiveListening}
          onToggleScreenShare={toggleScreenShareVisible}
          onCopy={() => {
            copyLastAssistantMessage(active.messages);
          }}
          onOpenTeleprompter={() => {
            setTeleprompterOpen(true);
          }}
          onStop={() => void stopMainWindow()}
          onOpenUpdate={() => {
            setUpdateOpen(true);
          }}
        />

        <AnswerPanel
          recordCombo={effectiveCombo(settings.hotkeys, "record")}
          messages={active.messages}
          chatId={activeId}
          partial={partial}
          streaming={activeStreaming}
          streamStartedAt={stream.startedAt[activeId]}
          scrollStep={settings.scroll_step}
          scrollModifier={effectiveCombo(settings.hotkeys, "scroll_chat")}
          onTogglePreview={togglePreview}
          onCopyMessage={copyMessage}
          onRemoveMessage={(index) => {
            chats.removeMessage(activeId, index);
          }}
          onResendMessage={resendFromMessage}
        />

        {autoMode.active && (
          <AutoTranscript
            turns={autoMode.turns}
            submittedThrough={autoMode.submittedThrough}
            pendingCount={autoMode.pending.length}
            instant={settings.auto_reply_instant}
            answerCombo={effectiveCombo(settings.hotkeys, "auto_answer")}
            onAnswer={autoMode.answer}
          />
        )}

        <AppComposer
          chats={chats}
          models={models}
          presets={presets}
          library={contextLibrary.library}
          onCaptureRegion={screenshot.capture}
          streaming={activeStreaming}
          showRetry={showRetry}
          onSend={doSend}
          onStop={() => {
            stream.stop(activeId);
          }}
          onRetry={retry}
          promptRef={promptRef}
          quickActions={quickActions}
          quickActionCombo={quickActionCombo}
          onQuickAction={runQuickAction}
        />
      </div>

      {previewOpen && <PreviewPanel html={previewHtml} onClose={closePreview} />}

      {teleprompterOpen && (
        <Teleprompter
          text={teleprompterText}
          initialSpeed={settings.teleprompter_speed}
          initialFontSize={settings.teleprompter_font_size}
          initialOffset={
            settings.teleprompter_resume && teleprompterResumeRef.current.text === teleprompterText
              ? teleprompterResumeRef.current.offset
              : 0
          }
          closeCombo={effectiveCombo(settings.hotkeys, "teleprompter_close")}
          pauseCombo={effectiveCombo(settings.hotkeys, "teleprompter_pause")}
          onPersist={(speed, fontSize, offset) => {
            teleprompterResumeRef.current = { text: teleprompterText, offset };
            saveSettingsReportingError({
              ...settingsRef.current,
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
