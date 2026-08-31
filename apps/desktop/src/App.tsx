import { useQuery } from "@tanstack/react-query";
import { ArrowDownCircle, Copy, Cpu, Eye, EyeOff, Minus, ScrollText, Square } from "lucide-react";
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
import { ChatTabs } from "@/components/ChatTabs";
import { Composer } from "@/components/Composer";
import { ConnectivityOverlay } from "@/components/ConnectivityOverlay";
import { HotkeysPopover } from "@/components/HotkeysPopover";
import { MiniHud } from "@/components/MiniHud";
import { ModelCommandMenu } from "@/components/ModelCommandMenu";
import { PREVIEW_PANEL_WIDTH_PX, PreviewPanel } from "@/components/PreviewPanel";
import { StatusBar, type ContextUsage } from "@/components/StatusBar";
import { Teleprompter } from "@/components/Teleprompter";
import { DOCK_BUTTON_CLASS, ToolbarDock, type ToolbarDockItem } from "@/components/ToolbarDock";
import { UpdateDialog } from "@/components/UpdateDialog";
import { useChats, type ChatsApi } from "@/hooks/useChats";
import { useClaudeStream, type ClaudeStreams } from "@/hooks/useClaudeStream";
import { useComboKey } from "@/hooks/useComboKey";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useContextLibrary } from "@/hooks/useContextLibrary";
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
  collapseMainWindow,
  countChatTokens,
  expandMainWindow,
  retryTranscription,
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
import { chatRequestOptions, type Chat, type ChatMessage } from "@/lib/chats";
import { appendTranscript } from "@/lib/composer";
import { libraryContextBlocks, type ContextLibrary } from "@/lib/context-library";
import { internalError, isNetworkError, isRetryable, type AppError } from "@/lib/errors";
import { effectiveCombo, formatCombo } from "@/lib/hotkeys";
import { extractHtmlBlocks } from "@/lib/html-blocks";
import { imagePngBase64, messageCopyImage, messageCopyText } from "@/lib/message-clipboard";
import type { ModelInfo } from "@/lib/models";
import { mergePresets, presetText, type PromptPreset } from "@/lib/presets";
import { queryKeys } from "@/lib/query-client";
import { filledQuickActions } from "@/lib/quick-actions";
import { toReadingText } from "@/lib/teleprompter";
import { cn } from "@/lib/utils";
import { nativeSizeEcho, windowSizesEqual } from "@/lib/window-size";

const SHELL_COLUMN_GAP_PX = 10;
const SHELL_PADDING_PX = 12;
const PREVIEW_EXTRA_WIDTH_PX = PREVIEW_PANEL_WIDTH_PX + SHELL_COLUMN_GAP_PX;

const USER_CONTEXT_SYSTEM_HEADER = "Контекст от пользователя (справочные материалы):\n";
const SYSTEM_BLOCKS_SEPARATOR = "\n\n";

const settingsSaveErrorText = (err: string) => `Ошибка сохранения настроек: ${err}`;
const COPY_IMAGE_ERROR_TEXT = "Не удалось скопировать картинку в буфер обмена";

function historyWithNewUserMessage(
  chat: Chat,
  text: string,
  images: ImagePayload[],
): ChatMessageDto[] {
  return [
    ...chat.messages.map((m) => ({ role: m.role, text: m.text, images: m.images })),
    { role: "user", text, images },
  ];
}

function draftImages(chat: Chat): ImagePayload[] {
  return chat.draftAttachments.map((a) => a.payload);
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

interface DockUpdate {
  version: string;
  busy: boolean;
  onOpen: () => void;
}

function updateBadge(updater: UpdaterApi, onOpen: () => void): DockUpdate | null {
  if (updater.status === "idle" || !updater.info) return null;
  return {
    version: updater.info.version,
    busy: updater.status === "downloading" || updater.status === "restarting",
    onOpen,
  };
}

const DOCK_VERTICAL_BREAKPOINT_PX = 460;
const SCREEN_SHARE_VISIBLE_LABEL = "Видно при демонстрации экрана — нажмите, чтобы скрыть";
const SCREEN_SHARE_HIDDEN_LABEL = "Скрыто при демонстрации экрана — нажмите, чтобы показывать";

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
  miniMode: boolean,
  ready: boolean,
  nativeSizeRef: RefObject<LogicalWindowSize>,
  guardUntilRef: RefObject<number>,
): void {
  const wasMiniRef = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (miniMode) {
      wasMiniRef.current = true;
      guardUntilRef.current = Date.now() + PROGRAMMATIC_RESIZE_GUARD_MS;
      void collapseMainWindow();
      return;
    }
    const extra = previewOpen ? PREVIEW_EXTRA_WIDTH_PX : 0;
    const target = { width: windowWidth + extra, height: windowHeight };
    if (wasMiniRef.current) {
      wasMiniRef.current = false;
      guardUntilRef.current = Date.now() + PROGRAMMATIC_RESIZE_GUARD_MS;
      void expandMainWindow(target.width, target.height);
      return;
    }
    if (windowSizesEqual(target, nativeSizeEcho(nativeSizeRef.current, extra))) return;
    guardUntilRef.current = Date.now() + PROGRAMMATIC_RESIZE_GUARD_MS;
    void setWindowSize(target.width, target.height);
  }, [windowWidth, windowHeight, previewOpen, miniMode, ready, nativeSizeRef, guardUntilRef]);
}

function useNativeResizeSync(
  previewOpen: boolean,
  miniMode: boolean,
  ready: boolean,
  nativeSizeRef: RefObject<LogicalWindowSize>,
  guardUntilRef: RefObject<number>,
  applyNativeWindowSize: (width: number, height: number) => void,
): void {
  const previewOpenRef = useLatestRef(previewOpen);
  const miniModeRef = useLatestRef(miniMode);
  const readyRef = useLatestRef(ready);
  const applyRef = useLatestRef(applyNativeWindowSize);
  useEffect(() => {
    let pending = 0;
    const stop = onWindowResized((size) => {
      nativeSizeRef.current = size;
      if (!readyRef.current) return;
      if (miniModeRef.current) return;
      if (Date.now() < guardUntilRef.current) return;
      if (pending !== 0) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        if (miniModeRef.current) return;
        const latest = nativeSizeRef.current;
        const base = latest.width - (previewOpenRef.current ? PREVIEW_EXTRA_WIDTH_PX : 0);
        applyRef.current(base, latest.height);
      });
    });
    return () => {
      stop();
      cancelAnimationFrame(pending);
    };
  }, [nativeSizeRef, guardUntilRef, previewOpenRef, miniModeRef, readyRef, applyRef]);
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
          ? chat.messages.map((m) => ({ role: m.role, text: m.text, images: m.images }))
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
        kept.map((m) => ({ role: m.role, text: m.text, images: m.images })),
      );
    },
    [chatsRef, streamRef, clearSttError, streamChat],
  );

  return { dispatchSend, dispatchQuickAction, doSend, resendFromMessage };
}

interface AppHeaderProps {
  state: RecorderState;
  error: AppError | null;
  hotkeys: HotkeyBinding[];
  updater: UpdaterApi;
  chats: ChatsApi;
  stream: ClaudeStreams;
  canCopy: boolean;
  canTeleprompt: boolean;
  contextUsage: ContextUsage | null;
  dockVertical: boolean;
  screenShareVisible: boolean;
  onToggleScreenShare: () => void;
  onOpenModelMenu: () => void;
  onCopy: () => void;
  onOpenTeleprompter: () => void;
  onStop: () => void;
  onCollapse: () => void;
  onOpenUpdate: () => void;
}

function AppHeader({
  state,
  error,
  hotkeys,
  updater,
  chats,
  stream,
  canCopy,
  canTeleprompt,
  contextUsage,
  dockVertical,
  screenShareVisible,
  onToggleScreenShare,
  onOpenModelMenu,
  onCopy,
  onOpenTeleprompter,
  onStop,
  onCollapse,
  onOpenUpdate,
}: AppHeaderProps) {
  const update = updateBadge(updater, onOpenUpdate);
  const dockItems: ToolbarDockItem[] = [
    {
      id: "mini",
      label: "Свернуть в мини-режим",
      icon: <Minus />,
      shortcut: formatCombo(effectiveCombo(hotkeys, "toggle_window")),
      onClick: onCollapse,
    },
    {
      id: "screen-share",
      label: screenShareVisible ? SCREEN_SHARE_VISIBLE_LABEL : SCREEN_SHARE_HIDDEN_LABEL,
      icon: screenShareVisible ? <Eye /> : <EyeOff />,
      iconClass: screenShareVisible ? "text-primary hover:text-primary/85" : undefined,
      onClick: onToggleScreenShare,
    },
    {
      id: "models",
      label: "Модели",
      icon: <Cpu />,
      shortcut: formatCombo(effectiveCombo(hotkeys, "model_menu")),
      onClick: onOpenModelMenu,
    },
    ...(canTeleprompt
      ? [{ id: "teleprompter", label: "Суфлёр", icon: <ScrollText />, onClick: onOpenTeleprompter }]
      : []),
    ...(canCopy
      ? [{ id: "copy", label: "Копировать последний ответ", icon: <Copy />, onClick: onCopy }]
      : []),
    {
      id: "hotkeys",
      label: "Горячие клавиши",
      element: <HotkeysPopover hotkeys={hotkeys} triggerClass={DOCK_BUTTON_CLASS} />,
    },
    ...(update
      ? [
          {
            id: "update",
            label: update.busy
              ? `Обновление до ${update.version}…`
              : `Доступна версия ${update.version}`,
            icon: <ArrowDownCircle className={cn(update.busy && "animate-pulse")} />,
            iconClass: "text-primary hover:text-primary/85",
            onClick: update.onOpen,
          },
        ]
      : []),
    { id: "stop", label: "Стоп — вернуться в лаунчер", icon: <Square />, onClick: onStop },
  ];
  return (
    <StatusBar
      state={state}
      error={error?.message ?? null}
      contextUsage={contextUsage}
      dock={<ToolbarDock items={dockItems} vertical={dockVertical} />}
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
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const [miniMode, setMiniMode] = useState(false);
  const [unreadAnswer, setUnreadAnswer] = useState(false);
  const miniModeRef = useLatestRef(miniMode);
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
    miniMode,
    !settingsLoading,
    nativeSizeRef,
    resizeGuardUntilRef,
  );
  useNativeResizeSync(
    previewOpen,
    miniMode,
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
      setMiniMode(false);
      void chatsRef.current.addDraftImage(chatsRef.current.activeId, dataUrl, mediaType);
    },
    [chatsRef],
  );
  const screenshot = useRegionScreenshot(onScreenshotImage);
  const clearScreenshotError = screenshot.clearError;
  const clearAllErrors = useCallback(() => {
    clearError();
    clearScreenshotError();
  }, [clearError, clearScreenshotError]);

  const onAssistantDone = useCallback(
    (chatId: string, text: string) => {
      if (text === "") return;
      chatsRef.current.appendAssistantMessage(chatId, text);
      if (miniModeRef.current) setUnreadAnswer(true);
      if (!settingsRef.current.auto_preview_html) return;
      if (chatId !== chatsRef.current.activeId) return;
      const block = lastHtmlBlock(text);
      if (block !== undefined) openPreview(block);
    },
    [chatsRef, settingsRef, miniModeRef, openPreview],
  );

  const stream = useClaudeStream(onAssistantDone);
  const streamRef = useLatestRef(stream);

  const { dispatchSend, dispatchQuickAction, doSend, resendFromMessage } = useSendPipeline(
    chatsRef,
    streamRef,
    presetsRef,
    libraryRef,
    clearAllErrors,
  );

  useTranscription(
    useCallback(
      (incoming: string) => {
        setMiniMode(false);
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
  const promptUnavailable = teleprompterOpen || connectivity.offline || miniMode;
  const promptRef = usePromptFocus(promptUnavailable);

  const duplicateActiveChat = useCallback(() => {
    chatsRef.current.duplicateChat(chatsRef.current.activeId);
  }, [chatsRef]);
  useComboKey(
    effectiveCombo(settings.hotkeys, "duplicate_chat"),
    !promptUnavailable,
    duplicateActiveChat,
  );

  const openModelMenu = useCallback(() => {
    setModelMenuOpen(true);
  }, []);
  useComboKey(effectiveCombo(settings.hotkeys, "model_menu"), !promptUnavailable, openModelMenu);

  const stopActiveStream = useCallback(() => {
    streamRef.current.stop(chatsRef.current.activeId);
  }, [streamRef, chatsRef]);
  useComboKey(
    effectiveCombo(settings.hotkeys, "cancel_stream"),
    !!stream.streaming[chats.activeId] && !teleprompterOpen,
    stopActiveStream,
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
      if (promptUnavailable) return;
      const action = quickActions[index];
      if (action) runQuickAction(action);
    },
    [promptUnavailable, quickActions, runQuickAction],
  );
  useQuickActionKeys(quickActionCombo, quickActions.length, runQuickActionAt);

  useEffect(
    () =>
      onEvent("toggle-teleprompter", () => {
        if (miniModeRef.current) return;
        setTeleprompterOpen((open) => !open);
      }),
    [miniModeRef],
  );

  useEffect(
    () =>
      onEvent("toggle-mini", () => {
        setMiniMode((mini) => !mini);
      }),
    [],
  );

  useEffect(() => {
    if (!miniMode) setUnreadAnswer(false);
  }, [miniMode]);

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
  const error: AppError | null = sttError ?? screenshot.error ?? stream.error[activeId] ?? null;
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

  const switchSttProvider = (provider: string) => {
    saveSettingsReportingError({ ...settingsRef.current, stt_provider: provider });
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

  if (miniMode) {
    return (
      <MiniHud
        state={state}
        streaming={Object.values(stream.streaming).some(Boolean)}
        hasError={error !== null}
        unreadAnswer={unreadAnswer}
        expandCombo={effectiveCombo(settings.hotkeys, "toggle_window")}
        onExpand={() => {
          setMiniMode(false);
        }}
      />
    );
  }

  return (
    <div
      className="app-shell relative flex h-screen overflow-hidden rounded-[var(--window-radius)]"
      style={{ gap: SHELL_COLUMN_GAP_PX, padding: SHELL_PADDING_PX }}
      onMouseDown={onShellDragStart}
    >
      <div className="flex shrink-0 flex-col gap-2.5" style={{ width: chatColumnWidth }}>
        <AppHeader
          state={state}
          error={error}
          hotkeys={settings.hotkeys}
          updater={updater}
          chats={chats}
          stream={stream}
          canCopy={canCopy}
          canTeleprompt={canTeleprompt}
          contextUsage={contextUsage}
          dockVertical={settings.window_width < DOCK_VERTICAL_BREAKPOINT_PX}
          screenShareVisible={settings.screen_share_visible}
          onToggleScreenShare={toggleScreenShareVisible}
          onOpenModelMenu={() => {
            setModelMenuOpen(true);
          }}
          onCopy={() => {
            copyLastAssistantMessage(active.messages);
          }}
          onOpenTeleprompter={() => {
            setTeleprompterOpen(true);
          }}
          onStop={() => void stopMainWindow()}
          onCollapse={() => {
            setMiniMode(true);
          }}
          onOpenUpdate={() => {
            setUpdateOpen(true);
          }}
        />

        <AnswerPanel
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

      <ModelCommandMenu
        open={modelMenuOpen}
        onOpenChange={setModelMenuOpen}
        sttProvider={settings.stt_provider}
        onSwitchSttProvider={switchSttProvider}
        models={models}
        activeModelId={active.model}
        onSelectModel={(id) => {
          chats.patchChat(chats.activeId, { model: id });
        }}
      />

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
