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

  const flush = useCallback(() => {
    pending.current = false;
    setAnswer(buf.current);
  }, []);

  useEffect(() => {
    const offDelta = onEvent("llm-delta", (chunk) => {
      buf.current += chunk;
      if (!pending.current) {
        pending.current = true;
        requestAnimationFrame(flush);
      }
    });
    const offDone = onEvent("llm-done", () => {
      pending.current = false;
      setAnswer(buf.current);
      setStreaming(false);
    });
    const offError = onEvent("llm-error", (msg) => {
      setStreaming(false);
      setError(msg);
    });
    return () => {
      offDelta();
      offDone();
      offError();
    };
  }, [flush]);

  const send = useCallback(async (text: string, images: ImagePayload[]) => {
    buf.current = "";
    pending.current = false;
    setAnswer("");
    setError(null);
    setStreaming(true);
    try {
      await sendToClaude(text, images);
    } catch (e) {
      setStreaming(false);
      setError(String(e));
    }
  }, []);

  const stop = useCallback(() => {
    void cancelStream();
    setStreaming(false);
  }, []);

  return { answer, streaming, error, send, stop };
}
