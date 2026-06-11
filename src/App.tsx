import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBar } from "@/components/StatusBar";
import { ChatTabs } from "@/components/ChatTabs";
import { PermissionBanner } from "@/components/PermissionBanner";
import { Composer } from "@/components/Composer";
import { AnswerPanel } from "@/components/AnswerPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { HotkeyHints } from "@/components/HotkeyHints";
import { useSettings } from "@/hooks/useSettings";
import { useRecorder } from "@/hooks/useRecorder";
import { useTranscription } from "@/hooks/useTranscription";
import { useClaudeStream } from "@/hooks/useClaudeStream";
import { useChats } from "@/hooks/useChats";
import { useWindowControls } from "@/hooks/useWindowControls";
import { usePttSuspend } from "@/hooks/usePttSuspend";
import {
  captureAvailable,
  openAudioPermissionSettings,
  retryTranscription,
  setWindowHeight,
} from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import { isTauri } from "@/ipc/env";
import type { ChatMessageDto } from "@/ipc/types";

const RETRYABLE = /перегружен|соединение|VPN|интернет|оборван/i;

const COMPACT_HEIGHT = 290;
const FULL_HEIGHT = 660;

export default function App() {
  const { settings, save } = useSettings();
  const state = useRecorder();
  const chats = useChats();
  const stream = useClaudeStream(chats.appendAssistantMessage);

  const [sttError, setSttError] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [permissionOk, setPermissionOk] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);

  const active = chats.active;
  const activeId = chats.activeId;
  const activeStreaming = !!stream.streaming[activeId];

  // Свежие значения для стабильных колбэков (PTT/транскрипция/подписки).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const streamRef = useRef(stream);
  streamRef.current = stream;

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

  const doSend = useCallback(() => dispatchSend(chatsRef.current.active.draft), [dispatchSend]);

  // Авто-раскрытие при появлении контента в активном чате (стрим/история).
  const hasContent = active.messages.length > 0 || activeStreaming;
  const prevEmpty = useRef(true);
  useEffect(() => {
    if (hasContent && prevEmpty.current) setAnswerOpen(true);
    prevEmpty.current = !hasContent;
  }, [hasContent]);

  // При переключении чата панель раскрыта, если в нём есть переписка.
  useEffect(() => {
    setAnswerOpen(active.messages.length > 0 || !!stream.streaming[activeId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Высота окна следует за состоянием панели.
  useEffect(() => {
    void setWindowHeight(answerOpen ? FULL_HEIGHT : COMPACT_HEIGHT);
  }, [answerOpen]);

  useTranscription(
    useCallback((incoming: string) => {
      const c = chatsRef.current.active;
      chatsRef.current.setDraft(c.id, incoming, c.draftAttachments);
      setSttError(null);
      setShowRetry(false);
      if (settingsRef.current.auto_send) dispatchSend(incoming);
    }, [dispatchSend]),
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

  useWindowControls(settings.move_step, doSend);
  usePttSuspend();

  useEffect(() => {
    void captureAvailable().then((ok) => setPermissionOk(ok));
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
    <div className="app-shell relative flex flex-col gap-3 h-screen p-4 rounded-[22px] overflow-hidden">
      {!permissionOk && <PermissionBanner onOpenSettings={() => void openAudioPermissionSettings()} />}

      <StatusBar
        state={state}
        error={error}
        hotkey={settings.hotkey}
        onOpenSettings={() => setSettingsOpen(true)}
        tabs={
          <ChatTabs
            chats={chats.chats}
            activeId={activeId}
            streaming={stream.streaming}
            onSelect={chats.selectChat}
            onRemove={(id) => {
              stream.stop(id); // отменяем фоновый стрим удаляемого чата (иначе запрос дорабатывает впустую)
              chats.removeChat(id);
            }}
            onNew={chats.newChat}
          />
        }
      />

      <Composer
        value={active.draft}
        onChange={(v) => chats.setDraft(activeId, v, active.draftAttachments)}
        attachments={active.draftAttachments}
        onRemoveAttachment={(i) => chats.removeDraftAttachment(activeId, i)}
        onPaste={(items) => void chats.addDraftAttachments(activeId, items)}
        onSend={doSend}
        onStop={() => stream.stop(activeId)}
        onClear={() => chats.setDraft(activeId, "", [])}
        onRetry={onRetry}
        hotkey={settings.hotkey}
        streaming={activeStreaming}
        showRetry={showRetry}
      />

      <AnswerPanel
        messages={active.messages}
        partial={partial}
        streaming={activeStreaming}
        expanded={answerOpen}
        onToggle={() => setAnswerOpen((o) => !o)}
        onCopy={() => {
          const last = [...active.messages].reverse().find((m) => m.role === "assistant");
          if (last) void navigator.clipboard.writeText(last.text);
        }}
      />

      <HotkeyHints hotkey={settings.hotkey} />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
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
