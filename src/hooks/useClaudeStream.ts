import { useCallback, useEffect, useRef, useState } from "react";
import { cancelStream, sendToClaude } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import type { ImagePayload } from "@/ipc/types";

export interface ClaudeStream {
  answer: string;
  streaming: boolean;
  error: string | null;
  send: (text: string, images: ImagePayload[]) => Promise<void>;
  stop: () => void;
}

export function useClaudeStream(): ClaudeStream {
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buf = useRef("");
  const pending = useRef(false);
  const raf = useRef(0);
  // Принимаем дельты только между send и done/error/stop. Гасит запоздалую
  // llm-delta после Стоп (бэкенд не гарантирует, что in-flight событие не придёт).
  const active = useRef(false);

  const flush = useCallback(() => {
    pending.current = false;
    setAnswer(buf.current);
  }, []);

  const cancelFrame = useCallback(() => {
    cancelAnimationFrame(raf.current);
    pending.current = false;
  }, []);

  useEffect(() => {
    const offDelta = onEvent("llm-delta", (chunk) => {
      if (!active.current) return;
      buf.current += chunk;
      if (!pending.current) {
        pending.current = true;
        raf.current = requestAnimationFrame(flush);
      }
    });
    const offDone = onEvent("llm-done", () => {
      active.current = false;
      cancelFrame();
      setAnswer(buf.current);
      setStreaming(false);
    });
    const offError = onEvent("llm-error", (msg) => {
      active.current = false;
      cancelFrame();
      setStreaming(false);
      setError(msg);
    });
    return () => {
      offDelta();
      offDone();
      offError();
      cancelFrame(); // не оставляем висящий rAF на размонтированном хуке
    };
  }, [flush, cancelFrame]);

  const send = useCallback(
    async (text: string, images: ImagePayload[]) => {
      cancelFrame();
      buf.current = "";
      active.current = true;
      setAnswer("");
      setError(null);
      setStreaming(true);
      try {
        await sendToClaude(text, images);
      } catch (e) {
        active.current = false;
        setStreaming(false);
        setError(String(e));
      }
    },
    [cancelFrame],
  );

  const stop = useCallback(() => {
    active.current = false;
    cancelFrame();
    void cancelStream();
    setStreaming(false);
  }, [cancelFrame]);

  return { answer, streaming, error, send, stop };
}
