import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerPanel } from "@/components/AnswerPanel";
import { ChatTabs } from "@/components/ChatTabs";
import { Composer } from "@/components/Composer";
import { HotkeyHints } from "@/components/HotkeyHints";
import { PermissionBanner } from "@/components/PermissionBanner";
import { PreviewPanel } from "@/components/PreviewPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { StatusBar } from "@/components/StatusBar";
import { UpdateDialog } from "@/components/UpdateDialog";
import { useChats } from "@/hooks/useChats";
import { useClaudeStream } from "@/hooks/useClaudeStream";
import { useModels } from "@/hooks/useModels";
import { usePttSuspend } from "@/hooks/usePttSuspend";
import { useRecorder } from "@/hooks/useRecorder";
import { useSettings } from "@/hooks/useSettings";
import { useTranscription } from "@/hooks/useTranscription";
import { useUpdater } from "@/hooks/useUpdater";
import { useWindowControls } from "@/hooks/useWindowControls";
import {
  captureAvailable,
  closeApp,
  hideMainWindow,
  openAudioPermissionSettings,
  retryTranscription,
  setWindowWidth,
} from "@/ipc/commands";
import { isTauri } from "@/ipc/env";
import { onEvent } from "@/ipc/events";
import type { ChatMessageDto } from "@/ipc/types";
import { extractHtmlBlocks } from "@/lib/html-blocks";
import { presetText } from "@/lib/presets";

const RETRYABLE = /перегружен|соединение|VPN|интернет|оборван/i;

// Ширина окна: базовая (превью закрыто) и расширенная (превью справа). Прирост =
// ширина панели (570) + зазор между колонками (gap-3 = 12px), чтобы левая колонка
// оставалась пиксельно неподвижной. Числа правятся позже.
const BASE_WIDTH = 1140;
const OPEN_WIDTH = 1722;

export default function App() {
  const { settings, save, bumpOpacity } = useSettings();
  const state = useRecorder();
  const chats = useChats();
  const models = useModels();

  const [sttError, setSttError] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [permissionOk, setPermissionOk] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);

  const updater = useUpdater();

  // Свежие значения для стабильных колбэков (PTT/транскрипция/подписки).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  // Открыть встроенную панель превью с данным HTML.
  const openPreview = useCallback((code: string) => {
    setPreviewHtml(code);
    setPreviewOpen(true);
  }, []);

  // llm-done: дописать ответ в историю; если включено автопревью, чат активен
  // и в ответе есть ```html — открыть панель с последним блоком.
  const onAssistantDone = useCallback(
    (chatId: string, text: string) => {
      if (text === "") return; // ответ без текста не пишем в историю (API отвергает пустой content)
      chatsRef.current.appendAssistantMessage(chatId, text);
      if (!settingsRef.current.auto_preview_html) return;
      if (chatId !== chatsRef.current.activeId) return;
      const blocks = extractHtmlBlocks(text);
      const last = blocks[blocks.length - 1];
      if (last !== undefined) openPreview(last);
    },
    [openPreview],
  );

  const stream = useClaudeStream(onAssistantDone);
  const streamRef = useRef(stream);
  streamRef.current = stream;

  const active = chats.active;
  const activeId = chats.activeId;
  const activeStreaming = !!stream.streaming[activeId];

  const error = sttError ?? stream.error[activeId] ?? null;

  // Единая точка отправки активного чата (ручной ⌘⏎/«Отправить» и авто-send).
  const dispatchSend = useCallback((rawText: string) => {
    const c = chatsRef.current.active;
    if (streamRef.current.streaming[c.id]) return; // не шлём поверх своего активного стрима
    const trimmed = rawText.trim();
    const images = c.draftAttachments.map((a) => a.payload);
    if (trimmed === "" && images.length === 0) return;
    setSttError(null);
    chatsRef.current.appendUserMessage(c.id, trimmed, images);
    const history: ChatMessageDto[] = [
      ...c.messages.map((m) => ({ role: m.role, text: m.text, images: m.images })),
      { role: "user", text: trimmed, images },
    ];
    // system = препромпт чата + его постоянный контекст; оба едут по кэшируемому
    // system-блоку (брейкпоинт prompt-кэша ставит Rust).
    const context = c.context.trim();
    const system = [
      presetText(settingsRef.current.prompt_presets, c.presetId),
      context === "" ? "" : `Контекст от пользователя (справочные материалы):\n${context}`,
    ]
      .filter((s) => s !== "")
      .join("\n\n");
    void streamRef.current.send(c.id, history, system, c.thinkingEnabled, c.model, c.webSearch);
  }, []);

  const doSend = useCallback(() => {
    dispatchSend(chatsRef.current.active.draft);
  }, [dispatchSend]);

  // Ширина окна следует за состоянием панели превью (расширяется вправо).
  useEffect(() => {
    void setWindowWidth(previewOpen ? OPEN_WIDTH : BASE_WIDTH);
  }, [previewOpen]);

  useTranscription(
    useCallback(
      (incoming: string) => {
        const c = chatsRef.current.active;
        chatsRef.current.setDraft(c.id, incoming, c.draftAttachments);
        setSttError(null);
        setShowRetry(false);
        if (settingsRef.current.auto_send) dispatchSend(incoming);
      },
      [dispatchSend],
    ),
  );

  useEffect(
    () =>
      onEvent("stt-error", (msg) => {
        setSttError(msg);
        setShowRetry(RETRYABLE.test(msg));
      }),
    [],
  );

  useEffect(() => {
    if (state === "recording") {
      setSttError(null);
      setShowRetry(false);
    }
  }, [state]);

  useWindowControls(settings.move_step, doSend, bumpOpacity);
  usePttSuspend(settings.hotkey);

  useEffect(() => {
    void captureAvailable().then((ok) => {
      setPermissionOk(ok);
    });
  }, []);

  // Демо-затравка для браузерного превью. Ждём, пока активный чат подгрузится
  // (activeId непустой), и сеем ровно один раз.
  const seededDemo = useRef(false);
  useEffect(() => {
    if (isTauri() || seededDemo.current || activeId === "") return;
    seededDemo.current = true;
    // Ответ с кодом — чтобы в браузерном моке было видно подсветку/markdown-стили.
    chatsRef.current.appendUserMessage(activeId, "Покажи пример хвостовой рекурсии на JS.", []);
    chatsRef.current.appendAssistantMessage(
      activeId,
      "Хвостовая рекурсия — рекурсивный вызов **последним действием**:\n\n" +
        "```js\n" +
        "// обычная: после вызова ещё умножение\n" +
        "function fact(n) {\n" +
        "  if (n <= 1) return 1;\n" +
        "  return n * fact(n - 1);\n" +
        "}\n\n" +
        "// хвостовая: аккумулятор несёт результат\n" +
        "function factTail(n, acc = 1) {\n" +
        "  if (n <= 1) return acc;\n" +
        "  return factTail(n - 1, n * acc);\n" +
        "}\n" +
        "```\n\n" +
        "Движок может заменить кадр стека, а не наращивать его.",
    );
    chatsRef.current.setDraft(
      activeId,
      "Объясни, чем хвостовая рекурсия отличается от обычной.",
      [],
    );
  }, [activeId]);

  const onRetry = () => {
    setShowRetry(false);
    void retryTranscription();
  };

  const partial = activeStreaming ? (stream.partial[activeId] ?? "") : null;

  return (
    <div className="app-shell relative flex h-screen gap-3 overflow-hidden rounded-[22px] p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {!permissionOk && (
          <PermissionBanner onOpenSettings={() => void openAudioPermissionSettings()} />
        )}

        <StatusBar
          state={state}
          error={error}
          hotkey={settings.hotkey}
          toggleHotkey={settings.toggle_hotkey}
          update={
            updater.status !== "idle" && updater.info
              ? {
                  version: updater.info.version,
                  busy: updater.status === "downloading" || updater.status === "restarting",
                  onOpen: () => {
                    setUpdateOpen(true);
                  },
                }
              : null
          }
          onOpenSettings={() => {
            setSettingsOpen(true);
          }}
          onClose={() => void closeApp()}
          onHide={() => void hideMainWindow()}
          tabs={
            <ChatTabs
              chats={chats.chats}
              activeId={activeId}
              streaming={stream.streaming}
              onSelect={chats.selectChat}
              onRemove={(id) => {
                stream.stop(id); // отменяем фоновый стрим удаляемого чата
                chats.removeChat(id);
              }}
              onRename={chats.renameChat}
              onNew={chats.newChat}
            />
          }
        />

        <AnswerPanel
          messages={active.messages}
          chatId={activeId}
          partial={partial}
          streaming={activeStreaming}
          streamStartedAt={stream.startedAt[activeId]}
          onCopy={() => {
            const last = [...active.messages].reverse().find((m) => m.role === "assistant");
            if (last) void navigator.clipboard.writeText(last.text);
          }}
          onOpenPreview={openPreview}
        />

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
          onSend={doSend}
          onStop={() => {
            stream.stop(activeId);
          }}
          onClear={() => {
            chats.setDraft(activeId, "", []);
          }}
          onRetry={onRetry}
          hotkey={settings.hotkey}
          streaming={activeStreaming}
          showRetry={showRetry}
          presets={settings.prompt_presets}
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
          models={models}
        />

        <HotkeyHints hotkey={settings.hotkey} />
      </div>

      {previewOpen && (
        <PreviewPanel
          html={previewHtml}
          onClose={() => {
            setPreviewOpen(false);
          }}
        />
      )}

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        appVersion={updater.currentVersion}
        onCheckUpdates={async () => {
          const found = await updater.checkNow();
          if (found) {
            // не стакаем модалки: настройки закрываются, открывается диалог обновления
            setSettingsOpen(false);
            setUpdateOpen(true);
          }
          return found;
        }}
        onClose={() => {
          setSettingsOpen(false);
        }}
        onSave={(next) => {
          void save(next).then((err) => {
            if (err) setSttError(`Ошибка сохранения настроек: ${err}`);
          });
          setSettingsOpen(false);
        }}
      />

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
          onSkip={() => {
            const skipped = updater.info?.version ?? "";
            setUpdateOpen(false);
            updater.dismiss();
            void save({ ...settingsRef.current, skipped_version: skipped }).then((err) => {
              if (err) setSttError(`Ошибка сохранения настроек: ${err}`);
            });
          }}
        />
      )}
    </div>
  );
}
