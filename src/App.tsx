import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerPanel } from "@/components/AnswerPanel";
import { ChatTabs } from "@/components/ChatTabs";
import { Composer } from "@/components/Composer";
import { HotkeyHints } from "@/components/HotkeyHints";
import { PermissionBanner } from "@/components/PermissionBanner";
import { PreviewPanel } from "@/components/PreviewPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { StatusBar } from "@/components/StatusBar";
import { useChats } from "@/hooks/useChats";
import { useClaudeStream } from "@/hooks/useClaudeStream";
import { usePttSuspend } from "@/hooks/usePttSuspend";
import { useRecorder } from "@/hooks/useRecorder";
import { useSettings } from "@/hooks/useSettings";
import { useTranscription } from "@/hooks/useTranscription";
import { useWindowControls } from "@/hooks/useWindowControls";
import {
  captureAvailable,
  openAudioPermissionSettings,
  retryTranscription,
  setWindowWidth,
} from "@/ipc/commands";
import { isTauri } from "@/ipc/env";
import { onEvent } from "@/ipc/events";
import type { ChatMessageDto } from "@/ipc/types";
import { extractHtmlBlocks } from "@/lib/html-blocks";

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

  const [sttError, setSttError] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [permissionOk, setPermissionOk] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

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
    void streamRef.current.send(c.id, history);
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
  usePttSuspend();

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
          onOpenSettings={() => {
            setSettingsOpen(true);
          }}
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
    </div>
  );
}
