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
import { ChatTabs } from "@/components/ChatTabs";
import { Composer } from "@/components/Composer";
import { ConnectivityOverlay } from "@/components/ConnectivityOverlay";
import { HotkeysPopover } from "@/components/HotkeysPopover";
import { IconButton } from "@/components/IconButton";
import { MissingKeysDialog } from "@/components/MissingKeysDialog";
import { PREVIEW_PANEL_WIDTH_PX, PreviewPanel } from "@/components/PreviewPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { StatusBar, type ContextUsage, type StatusBarProps } from "@/components/StatusBar";
import { Teleprompter } from "@/components/Teleprompter";
import { UpdateDialog } from "@/components/UpdateDialog";
import { WarningBanner } from "@/components/WarningBanner";
import { useChats, type ChatsApi } from "@/hooks/useChats";
import { useClaudeStream, type ClaudeStreams } from "@/hooks/useClaudeStream";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useContextLibrary, type ContextLibraryApi } from "@/hooks/useContextLibrary";
import { useModels } from "@/hooks/useModels";
import { useOfficialPresets } from "@/hooks/useOfficialPresets";
import { usePttSuspend } from "@/hooks/usePttSuspend";
import { useRecorder } from "@/hooks/useRecorder";
import { useSettings } from "@/hooks/useSettings";
import { useTranscription } from "@/hooks/useTranscription";
import { useUpdater, type UpdaterApi } from "@/hooks/useUpdater";
import { useWindowControls } from "@/hooks/useWindowControls";
import {
  captureAvailable,
  closeApp,
  hideMainWindow,
  openAudioPermissionSettings,
  countChatTokens,
  redeemAccessCode,
  requestAudioCapturePermission,
  retryTranscription,
  setWindowSize,
  startWindowDrag,
} from "@/ipc/commands";
import { onEvent, onWindowResized, type LogicalWindowSize } from "@/ipc/events";
import type {
  ChatMessageDto,
  ImagePayload,
  RecorderState,
  Settings,
  UpdateInfo,
} from "@/ipc/types";
import { missingApiKeys, missingKeysNotice, type ApiKeyInfo } from "@/lib/api-keys";
import type { Chat, ChatMessage } from "@/lib/chats";
import { appendTranscript } from "@/lib/composer";
import { libraryContextBlocks, type ContextLibrary } from "@/lib/context-library";
import { extractHtmlBlocks } from "@/lib/html-blocks";
import type { ModelInfo } from "@/lib/models";
import { mergePresets, presetText, type PromptPreset } from "@/lib/presets";
import { queryKeys } from "@/lib/query-client";
import { toReadingText } from "@/lib/teleprompter";

const RETRYABLE_STT_ERROR = /перегружен|соединение|VPN|интернет|оборван/i;
const NO_CONNECTION_TEXT = "Нет соединения";

const SHELL_COLUMN_GAP_PX = 10;
const SHELL_PADDING_PX = 12;
const PREVIEW_EXTRA_WIDTH_PX = PREVIEW_PANEL_WIDTH_PX + SHELL_COLUMN_GAP_PX;

const USER_CONTEXT_SYSTEM_HEADER = "Контекст от пользователя (справочные материалы):\n";
const SYSTEM_BLOCKS_SEPARATOR = "\n\n";

const settingsSaveErrorText = (err: string) => `Ошибка сохранения настроек: ${err}`;

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

function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

interface CapturePermission {
  permissionOk: boolean;
  requestPermission: () => Promise<void>;
}

function useCapturePermission(): CapturePermission {
  const [permissionOk, setPermissionOk] = useState(true);
  useEffect(() => {
    void captureAvailable().then((ok) => {
      setPermissionOk(ok);
    });
  }, []);
  const requestPermission = useCallback(async () => {
    setPermissionOk(await requestAudioCapturePermission());
  }, []);
  return { permissionOk, requestPermission };
}

interface MissingKeysGate {
  missingKeys: ApiKeyInfo[];
  keysMissing: boolean;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

function useMissingKeysGate(
  settings: Settings,
  settingsLoading: boolean,
  permissionMissing: boolean,
): MissingKeysGate {
  const missingKeys = useMemo(() => missingApiKeys(settings), [settings]);
  const keysMissing = !settingsLoading && missingKeys.length > 0;
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    setDialogOpen(keysMissing || permissionMissing);
  }, [keysMissing, permissionMissing]);

  const openDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);
  const closeDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);

  return { missingKeys, keysMissing, dialogOpen, openDialog, closeDialog };
}

interface SttFeedback {
  sttError: string | null;
  showRetry: boolean;
  setSttError: (msg: string | null) => void;
  clearError: () => void;
  clearFeedback: () => void;
  retry: () => void;
}

function useSttFeedback(state: RecorderState): SttFeedback {
  const [sttError, setSttError] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);

  useEffect(
    () =>
      onEvent("stt-error", (msg) => {
        setSttError(msg);
        setShowRetry(RETRYABLE_STT_ERROR.test(msg));
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
const NATIVE_SIZE_EPSILON_PX = 1.5;

function sizesEqual(a: LogicalWindowSize, b: LogicalWindowSize): boolean {
  return (
    Math.abs(a.width - b.width) < NATIVE_SIZE_EPSILON_PX &&
    Math.abs(a.height - b.height) < NATIVE_SIZE_EPSILON_PX
  );
}

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
    const target = {
      width: windowWidth + (previewOpen ? PREVIEW_EXTRA_WIDTH_PX : 0),
      height: windowHeight,
    };
    if (!sizesEqual(target, nativeSizeRef.current)) {
      guardUntilRef.current = Date.now() + PROGRAMMATIC_RESIZE_GUARD_MS;
    }
    void setWindowSize(target.width, target.height);
  }, [windowWidth, windowHeight, previewOpen, ready, nativeSizeRef, guardUntilRef]);
}

function useNativeResizeSync(
  previewOpen: boolean,
  ready: boolean,
  nativeSizeRef: RefObject<LogicalWindowSize>,
  guardUntilRef: RefObject<number>,
  applyNativeWindowSize: (width: number, height: number) => void,
): void {
  const previewOpenRef = useLatestRef(previewOpen);
  const readyRef = useLatestRef(ready);
  const applyRef = useLatestRef(applyNativeWindowSize);
  useEffect(
    () =>
      onWindowResized((size) => {
        nativeSizeRef.current = size;
        if (!readyRef.current) return;
        if (Date.now() < guardUntilRef.current) return;
        const base = size.width - (previewOpenRef.current ? PREVIEW_EXTRA_WIDTH_PX : 0);
        applyRef.current(base, size.height);
      }),
    [nativeSizeRef, guardUntilRef, previewOpenRef, readyRef, applyRef],
  );
}

const TOKEN_COUNT_PLACEHOLDER_MESSAGE: ChatMessageDto = { role: "user", text: ".", images: [] };
const PROJECTED_TOKENS_STALE_MS = 10 * 60 * 1000;

function useProjectedContextTokens(chat: Chat, system: string, streaming: boolean): number {
  const messagesKey = chat.messages.map((m) => `${m.role}:${String(m.text.length)}`).join("|");
  const { data } = useQuery({
    queryKey: queryKeys.countTokens(
      chat.model,
      chat.thinkingEnabled,
      chat.webSearch,
      system,
      messagesKey,
    ),
    queryFn: () => {
      const history: ChatMessageDto[] =
        chat.messages.length > 0
          ? chat.messages.map((m) => ({ role: m.role, text: m.text, images: m.images }))
          : [TOKEN_COUNT_PLACEHOLDER_MESSAGE];
      return countChatTokens(history, system, chat.thinkingEnabled, chat.model, chat.webSearch);
    },
    enabled: !streaming,
    staleTime: PROJECTED_TOKENS_STALE_MS,
    placeholderData: (prev) => prev,
  });
  return data ?? 0;
}

interface SendPipeline {
  dispatchSend: (rawText: string) => void;
  doSend: () => void;
  resendFromMessage: (index: number) => void;
}

function useSendPipeline(
  chatsRef: RefObject<ChatsApi>,
  streamRef: RefObject<ClaudeStreams>,
  presetsRef: RefObject<PromptPreset[]>,
  libraryRef: RefObject<ContextLibrary>,
  clearSttError: () => void,
  sendBlocked: boolean,
): SendPipeline {
  const sendBlockedRef = useLatestRef(sendBlocked);
  const dispatchSend = useCallback(
    (rawText: string) => {
      if (sendBlockedRef.current) return;
      const chat = chatsRef.current.active;
      if (streamRef.current.streaming[chat.id]) return;
      const trimmed = rawText.trim();
      const images = chat.draftAttachments.map((a) => a.payload);
      if (trimmed === "" && images.length === 0) return;
      clearSttError();
      chatsRef.current.appendUserMessage(chat.id, trimmed, images);
      const history = historyWithNewUserMessage(chat, trimmed, images);
      const system = chatSystemPrompt(presetsRef.current, chat, libraryRef.current);
      void streamRef.current.send(
        chat.id,
        history,
        system,
        chat.thinkingEnabled,
        chat.model,
        chat.webSearch,
      );
    },
    [chatsRef, streamRef, presetsRef, libraryRef, clearSttError, sendBlockedRef],
  );

  const doSend = useCallback(() => {
    dispatchSend(chatsRef.current.active.draft);
  }, [dispatchSend, chatsRef]);

  const resendFromMessage = useCallback(
    (index: number) => {
      if (sendBlockedRef.current) return;
      const chat = chatsRef.current.active;
      if (streamRef.current.streaming[chat.id]) return;
      if (chat.messages[index]?.role !== "user") return;
      clearSttError();
      const kept = chat.messages.slice(0, index + 1);
      chatsRef.current.truncateMessages(chat.id, kept.length);
      const history = kept.map((m) => ({ role: m.role, text: m.text, images: m.images }));
      const system = chatSystemPrompt(presetsRef.current, chat, libraryRef.current);
      void streamRef.current.send(
        chat.id,
        history,
        system,
        chat.thinkingEnabled,
        chat.model,
        chat.webSearch,
      );
    },
    [chatsRef, streamRef, presetsRef, libraryRef, clearSttError, sendBlockedRef],
  );

  return { dispatchSend, doSend, resendFromMessage };
}

interface AppHeaderProps {
  state: RecorderState;
  error: string | null;
  hotkey: string;
  toggleHotkey: string;
  teleprompterHotkey: string;
  updater: UpdaterApi;
  chats: ChatsApi;
  stream: ClaudeStreams;
  canCopy: boolean;
  canTeleprompt: boolean;
  contextUsage: ContextUsage | null;
  onCopy: () => void;
  onOpenTeleprompter: () => void;
  onOpenSettings: () => void;
  onOpenUpdate: () => void;
}

function AppHeader({
  state,
  error,
  hotkey,
  toggleHotkey,
  teleprompterHotkey,
  updater,
  chats,
  stream,
  canCopy,
  canTeleprompt,
  contextUsage,
  onCopy,
  onOpenTeleprompter,
  onOpenSettings,
  onOpenUpdate,
}: AppHeaderProps) {
  return (
    <StatusBar
      state={state}
      error={error}
      toggleHotkey={toggleHotkey}
      contextUsage={contextUsage}
      update={updateBadge(updater, onOpenUpdate)}
      onOpenSettings={onOpenSettings}
      onClose={() => void closeApp()}
      onHide={() => void hideMainWindow()}
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
        />
      }
      actions={
        <>
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
          <HotkeysPopover
            hotkey={hotkey}
            toggleHotkey={toggleHotkey}
            teleprompterHotkey={teleprompterHotkey}
          />
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
  streaming: boolean;
  showRetry: boolean;
  disabled: boolean;
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
}

function AppComposer({
  chats,
  models,
  presets,
  library,
  streaming,
  showRetry,
  disabled,
  onSend,
  onStop,
  onRetry,
}: AppComposerProps) {
  const { active, activeId } = chats;
  return (
    <Composer
      value={active.draft}
      onChange={(v) => {
        chats.setDraft(activeId, v, active.draftAttachments);
      }}
      attachments={active.draftAttachments}
      onRemoveAttachment={(i) => {
        chats.removeDraftAttachment(activeId, i);
      }}
      onPaste={(items) => void chats.addDraftAttachments(activeId, items)}
      onSend={onSend}
      onStop={onStop}
      onClear={() => {
        chats.setDraft(activeId, "", []);
      }}
      onRetry={onRetry}
      streaming={streaming}
      showRetry={showRetry}
      presets={presets}
      presetId={active.presetId}
      onPresetChange={(id) => {
        chats.setChatPreset(activeId, id);
      }}
      thinkingEnabled={active.thinkingEnabled}
      onThinkingChange={(enabled) => {
        chats.setChatThinking(activeId, enabled);
      }}
      model={active.model}
      onModelChange={(model) => {
        chats.setChatModel(activeId, model);
      }}
      webSearch={active.webSearch}
      onWebSearchChange={(enabled) => {
        chats.setChatWebSearch(activeId, enabled);
      }}
      context={active.context}
      onContextChange={(context) => {
        chats.setChatContext(activeId, context);
      }}
      library={library}
      libraryDocIds={active.libraryDocIds}
      onLibraryDocsChange={(ids) => {
        chats.setChatLibraryDocs(activeId, ids);
      }}
      models={models}
      disabled={disabled}
    />
  );
}

interface AppDialogsProps {
  settings: Settings;
  updater: UpdaterApi;
  contextLibrary: ContextLibraryApi;
  settingsOpen: boolean;
  updateOpen: boolean;
  onCheckUpdates: () => Promise<UpdateInfo | null>;
  onRedeem: (code: string) => Promise<string | null>;
  onCloseSettings: () => void;
  onSaveSettings: (next: Settings) => void;
  onCloseUpdate: () => void;
  onSkipUpdate: () => void;
}

function AppDialogs({
  settings,
  updater,
  contextLibrary,
  settingsOpen,
  updateOpen,
  onCheckUpdates,
  onRedeem,
  onCloseSettings,
  onSaveSettings,
  onCloseUpdate,
  onSkipUpdate,
}: AppDialogsProps) {
  return (
    <>
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        appVersion={updater.currentVersion}
        contextLibrary={contextLibrary}
        onCheckUpdates={onCheckUpdates}
        onRedeem={onRedeem}
        onClose={onCloseSettings}
        onSave={onSaveSettings}
      />

      {updater.info && (
        <UpdateDialog
          open={updateOpen}
          info={updater.info}
          status={updater.status}
          progress={updater.progress}
          error={updater.error}
          currentVersion={updater.currentVersion}
          onClose={onCloseUpdate}
          onInstall={updater.install}
          onSkip={onSkipUpdate}
        />
      )}
    </>
  );
}

export default function App() {
  const {
    settings,
    loading: settingsLoading,
    save,
    reload,
    bumpOpacity,
    bumpWindowSize,
    applyNativeWindowSize,
  } = useSettings();
  const state = useRecorder();
  const chats = useChats();
  const models = useModels();
  const updater = useUpdater();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const teleprompterResumeRef = useRef({ text: "", offset: 0 });

  const { permissionOk, requestPermission } = useCapturePermission();
  const keysGate = useMissingKeysGate(settings, settingsLoading, !permissionOk);
  const handleRedeem = useCallback(
    async (code: string): Promise<string | null> => {
      const error = await redeemAccessCode(code);
      if (error === null) await reload();
      return error;
    },
    [reload],
  );
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

  const { dispatchSend, doSend, resendFromMessage } = useSendPipeline(
    chatsRef,
    streamRef,
    presetsRef,
    libraryRef,
    clearError,
    keysGate.keysMissing,
  );

  useTranscription(
    useCallback(
      (incoming: string) => {
        const chat = chatsRef.current.active;
        const merged = appendTranscript(chat.draft, incoming);
        chatsRef.current.setDraft(chat.id, merged, chat.draftAttachments);
        clearFeedback();
        if (settingsRef.current.auto_send) dispatchSend(merged);
      },
      [chatsRef, settingsRef, dispatchSend, clearFeedback],
    ),
  );

  useWindowControls(settings.move_step, doSend, bumpOpacity, bumpWindowSize);
  usePttSuspend(settings.hotkey);
  const connectivity = useConnectivity();

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
        chatsRef.current.setChatUsage(chatId, inputTokens);
      }),
    [chatsRef],
  );

  const active = chats.active;
  const activeId = chats.activeId;
  const activeStreaming = !!stream.streaming[activeId];
  const error = sttError ?? stream.error[activeId] ?? null;
  const partial = activeStreaming ? (stream.partial[activeId] ?? "") : null;
  const reportNetworkError = connectivity.reportNetworkError;
  useEffect(() => {
    if (error?.includes(NO_CONNECTION_TEXT)) reportNetworkError();
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
      if (err) setSttError(settingsSaveErrorText(err));
    });
  };

  const checkUpdatesFromSettings = async (): Promise<UpdateInfo | null> => {
    const found = await updater.checkNow();
    if (found) {
      setSettingsOpen(false);
      setUpdateOpen(true);
    }
    return found;
  };

  const saveSettingsAndCloseDialog = (next: Settings) => {
    saveSettingsReportingError(next);
    setSettingsOpen(false);
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

  return (
    <div
      className="app-shell relative flex h-screen overflow-hidden rounded-[22px]"
      style={{ gap: SHELL_COLUMN_GAP_PX, padding: SHELL_PADDING_PX }}
      onMouseDown={onShellDragStart}
    >
      <div className="flex shrink-0 flex-col gap-2.5" style={{ width: chatColumnWidth }}>
        <AppHeader
          state={state}
          error={error}
          hotkey={settings.hotkey}
          toggleHotkey={settings.toggle_hotkey}
          teleprompterHotkey={settings.teleprompter_hotkey}
          updater={updater}
          chats={chats}
          stream={stream}
          canCopy={canCopy}
          canTeleprompt={canTeleprompt}
          contextUsage={contextUsage}
          onCopy={() => {
            copyLastAssistantMessage(active.messages);
          }}
          onOpenTeleprompter={() => {
            setTeleprompterOpen(true);
          }}
          onOpenSettings={() => {
            setSettingsOpen(true);
          }}
          onOpenUpdate={() => {
            setUpdateOpen(true);
          }}
        />

        {!permissionOk && (
          <WarningBanner
            actionLabel="Открыть настройки"
            onAction={() => void openAudioPermissionSettings()}
          >
            Нет разрешения на запись системного звука
          </WarningBanner>
        )}

        {keysGate.keysMissing && (
          <WarningBanner tone="info" actionLabel="Ввести" onAction={keysGate.openDialog}>
            {missingKeysNotice(keysGate.missingKeys)}
          </WarningBanner>
        )}

        <AnswerPanel
          messages={active.messages}
          chatId={activeId}
          partial={partial}
          streaming={activeStreaming}
          streamStartedAt={stream.startedAt[activeId]}
          scrollStep={settings.scroll_step}
          onTogglePreview={togglePreview}
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
          streaming={activeStreaming}
          showRetry={showRetry}
          disabled={keysGate.keysMissing}
          onSend={doSend}
          onStop={() => {
            stream.stop(activeId);
          }}
          onRetry={retry}
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

      <MissingKeysDialog
        open={keysGate.dialogOpen}
        missing={keysGate.keysMissing ? keysGate.missingKeys : []}
        permissionMissing={!permissionOk}
        onRequestPermission={requestPermission}
        onOpenAudioSettings={() => void openAudioPermissionSettings()}
        onRedeem={handleRedeem}
        onOpenSettings={() => {
          keysGate.closeDialog();
          setSettingsOpen(true);
        }}
        onClose={keysGate.closeDialog}
      />

      <AppDialogs
        settings={settings}
        updater={updater}
        contextLibrary={contextLibrary}
        settingsOpen={settingsOpen}
        updateOpen={updateOpen}
        onCheckUpdates={checkUpdatesFromSettings}
        onRedeem={handleRedeem}
        onCloseSettings={() => {
          setSettingsOpen(false);
        }}
        onSaveSettings={saveSettingsAndCloseDialog}
        onCloseUpdate={() => {
          setUpdateOpen(false);
        }}
        onSkipUpdate={skipUpdate}
      />
    </div>
  );
}
