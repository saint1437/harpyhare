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
import { captureAvailable, openAudioPermissionSettings, retryTranscription } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import { isTauri } from "@/ipc/env";

const RETRYABLE = /перегружен|соединение|VPN|интернет|оборван/i;

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

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const error = sttError ?? stream.error;

  const doSend = useCallback(() => {
    if (stream.streaming) return;
    if (text.trim() === "" && attach.attachments.length === 0) return;
    setSttError(null);
    void stream.send(text, attach.attachments.map((a) => a.payload));
  }, [stream, text, attach.attachments]);

  useTranscription(
    useCallback(
      (incoming: string) => {
        setText(incoming);
        setSttError(null);
        setShowRetry(false);
        if (settingsRef.current.auto_send) {
          void stream.send(incoming, attach.attachments.map((a) => a.payload));
        }
      },
      [stream, attach.attachments],
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

      <StatusBar state={state} error={error} onOpenSettings={() => setSettingsOpen(true)} />

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
        streaming={stream.streaming}
        showRetry={showRetry}
      />

      <AnswerPanel
        answer={stream.answer}
        streaming={stream.streaming}
        onCopy={() => void navigator.clipboard.writeText(stream.answer)}
      />

      <HotkeyHints />

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
