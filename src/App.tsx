import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBar } from "@/components/StatusBar";
import { PermissionBanner } from "@/components/PermissionBanner";
import { Composer } from "@/components/Composer";
import { AnswerPanel } from "@/components/AnswerPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { HotkeyHints } from "@/components/HotkeyHints";
import { useSettings } from "@/hooks/useSettings";
import { useRecorder } from "@/hooks/useRecorder";
import { useTranscription } from "@/hooks/useTranscription";
import { useClaudeStream } from "@/hooks/useClaudeStream";
import { useAttachments } from "@/hooks/useAttachments";
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

const RETRYABLE = /перегружен|соединение|VPN|интернет|оборван/i;

// Высоты окна: компактное (ответ свёрнут) и полное (ответ раскрыт).
const COMPACT_HEIGHT = 290;
const FULL_HEIGHT = 660;

export default function App() {
  const { settings, save } = useSettings();
  const state = useRecorder();
  const stream = useClaudeStream();
  const attach = useAttachments();

  const [text, setText] = useState("");
  const [sttError, setSttError] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [permissionOk, setPermissionOk] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false); // ответ свёрнут по умолчанию

  // Свежие значения для стабильных колбэков — чтобы send-логика и подписки
  // не пересоздавались на каждый keystroke/вставку (и не было окна переподписки).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const textRef = useRef(text);
  textRef.current = text;
  const attachmentsRef = useRef(attach.attachments);
  attachmentsRef.current = attach.attachments;
  const streamingRef = useRef(stream.streaming);
  streamingRef.current = stream.streaming;

  const error = sttError ?? stream.error;

  // Единая точка отправки: и ручной ⌘⏎/«Отправить», и авто-send после распознавания.
  // stream.send стабилен (useCallback внутри хука), поэтому dispatchSend тоже стабилен.
  const send = stream.send;
  const dispatchSend = useCallback(
    (raw: string) => {
      if (streamingRef.current) return; // не шлём поверх активного стрима
      const trimmed = raw.trim();
      const images = attachmentsRef.current.map((a) => a.payload);
      if (trimmed === "" && images.length === 0) return;
      setSttError(null);
      void send(trimmed, images);
    },
    [send],
  );

  // Авто-раскрытие — в момент, когда от Claude приходит успешный ответ (первая
  // непустая дельта), а не при отправке. Срабатывает один раз на стрим:
  // ручное сворачивание во время стрима не перебивается. Ошибка до контента не
  // раскрывает (answer остаётся пустым).
  const prevAnswerEmpty = useRef(true);
  useEffect(() => {
    if (stream.answer.length > 0 && prevAnswerEmpty.current) {
      setAnswerOpen(true);
    }
    prevAnswerEmpty.current = stream.answer.length === 0;
  }, [stream.answer]);

  // Высота окна следует за состоянием ответа: компактное ↔ полное.
  useEffect(() => {
    void setWindowHeight(answerOpen ? FULL_HEIGHT : COMPACT_HEIGHT);
  }, [answerOpen]);

  const doSend = useCallback(() => dispatchSend(textRef.current), [dispatchSend]);

  useTranscription(
    useCallback(
      (incoming: string) => {
        setText(incoming);
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

  useWindowControls(settings.move_step, doSend);
  usePttSuspend();

  useEffect(() => {
    void captureAvailable().then((ok) => setPermissionOk(ok));
  }, []);

  useEffect(() => {
    if (isTauri()) return;
    setText("Объясни, чем хвостовая рекурсия отличается от обычной.");
  }, []);

  const onRetry = () => {
    setShowRetry(false);
    void retryTranscription();
  };

  return (
    <div className="app-shell relative flex flex-col gap-3 h-screen p-4 rounded-[22px] overflow-hidden">
      {!permissionOk && <PermissionBanner onOpenSettings={() => void openAudioPermissionSettings()} />}

      <StatusBar
        state={state}
        error={error}
        hotkey={settings.hotkey}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <Composer
        value={text}
        onChange={setText}
        attachments={attach.attachments}
        onRemoveAttachment={attach.remove}
        onPaste={(items) => void attach.addFromPaste(items)}
        onSend={doSend}
        onStop={stream.stop}
        onClear={() => {
          setText("");
          attach.clear();
        }}
        onRetry={onRetry}
        hotkey={settings.hotkey}
        streaming={stream.streaming}
        showRetry={showRetry}
      />

      <AnswerPanel
        answer={stream.answer}
        streaming={stream.streaming}
        expanded={answerOpen}
        onToggle={() => setAnswerOpen((o) => !o)}
        onCopy={() => void navigator.clipboard.writeText(stream.answer)}
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
