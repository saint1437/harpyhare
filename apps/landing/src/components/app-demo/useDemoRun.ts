import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DemoCopy, ListeningStateId, OrbStateId, VoicePrompt } from "@/i18n/demo-types";
import type { DemoChat, DemoMessage, DemoNotification, DemoTurn } from "./types";

/**
 * The mock's runtime.
 *
 * It models the app's states rather than its plumbing: there is no audio, no
 * network and no model here, but every state the window can be IN is reachable,
 * and the transitions between them run on the app's own numbers wherever the
 * app has one. Where a number is the demo's own invention it says so.
 *
 * ONE STREAM PER CHAT, not one per window. That is the app's model and it is
 * load-bearing rather than tidy: the tab dot marks a chat that is generating
 * while you are reading a different one, and the orb's `answer` state exists
 * only for an answer that landed somewhere you were not looking. A demo with a
 * single window-wide stream can reach neither, which is what the earlier one
 * did — switching tabs simply killed the answer.
 */
export type DemoPhase = "idle" | "recording" | "transcribing" | "streaming";

/** The capture side of the machine. The stream side is per chat. */
type CapturePhase = "idle" | "recording" | "transcribing";

/**
 * How long a chip-driven "hold" lasts. Demo-only: a real hold is as long as the
 * user's finger, and the chips have to stand in for one.
 */
const RECORDING_MS = 1500;
/** Demo-only. The app's streaming upload lands a transcript in 150–600 ms. */
const TRANSCRIBING_MS = 750;
/** Demo-only: a beat in which the transcript is visibly IN the composer first. */
const AUTOSEND_DELAY_MS = 450;
/** Demo-only, standing in for time-to-first-token (0.4–2 s in the app). */
const THINKING_MS = 900;
/** `MIN_RECORDING_SECS` in `apps/desktop/src-tauri/src/state.rs`, in ms. */
const MIN_RECORDING_MS = 300;

/**
 * The reveal, and why it is three numbers rather than one.
 *
 * The app never renders the text it has; it renders a prefix that CHASES the
 * text it has, at a floor of 100 chars/s and otherwise eating ten times the
 * backlog per second (`lib/stream-reveal.ts`). Fed the whole answer at once
 * that formula would dump it in a frame, so the demo also models the arrival:
 * characters "arrive" at a steady rate and the reveal chases them exactly as
 * the app's does. The visible result — a reveal that lags a little and then
 * catches up — is the app's; a single chars-per-second constant is not.
 */
const REVEAL_MIN_CHARS_PER_SECOND = 100;
const REVEAL_BACKLOG_FRACTION_PER_SECOND = 10;
/** Demo-only: the rate the stand-in provider emits at. */
const ARRIVAL_CHARS_PER_SECOND = 240;
/** A tab that was in the background must not dump the whole answer on return. */
const MAX_FRAME_MS = 100;

/** `CHAT_LIMIT` in `apps/desktop/src/lib/chats.ts`. */
const CHAT_LIMIT = 6;
/** `NOTIFICATION_LIMIT` in `apps/desktop/src/lib/notifications.ts`. */
const NOTIFICATION_LIMIT = 3;

/** The app's notification lifetimes, `notificationLifetime()`. */
const LIFETIME_BASE_MS = { danger: 9000, warning: 7000 } as const;
const READING_FREE_CHARS = 60;
const READING_MS_PER_CHAR = 45;
const MAX_LIFETIME_MS = 25000;

/** `RETRYABLE_CODES` in the app — the codes that leave a Retry button behind. */
const RETRYABLE_NOTIFICATIONS = ["network"];

/** Demo-only: how often the stand-in interviewer says something in auto mode. */
const AUTO_TURN_INTERVAL_MS = 2800;
/** `SUBMIT_DEBOUNCE_MS` in `apps/desktop/src/hooks/useAutoMode.ts`. */
const AUTO_SUBMIT_DEBOUNCE_MS = 900;

/** Demo-only: a model window to measure the context gauge against. */
const CONTEXT_MAX_TOKENS = 200000;
/** Rough enough for a gauge; the app counts for real through the provider. */
const CHARS_PER_TOKEN = 3.6;

export type SettingValue = string | number | boolean;

interface Stream {
  chatId: string;
  full: string;
  arrived: number;
  shown: number;
  last: number;
}

function seedSettings(copy: DemoCopy): Record<string, SettingValue> {
  const seeded: Record<string, SettingValue> = {};
  for (const tab of Object.values(copy.launcher.settings.tabs)) {
    for (const group of tab.groups) {
      for (const row of group.rows) {
        const { control } = row;
        if (control.kind === "switch") seeded[row.id] = control.value;
        else if (control.kind === "select") seeded[row.id] = control.value;
        else if (control.kind === "slider") seeded[row.id] = control.value;
      }
    }
  }
  return seeded;
}

function freshChats(copy: DemoCopy): DemoChat[] {
  return copy.chats.map((chat) => ({
    ...chat,
    messages: [...chat.messages],
    draft: "",
    attachments: 0,
  }));
}

function lifetimeMs(tone: "danger" | "warning", title: string, body: string): number {
  const visible = title.length + Math.min(body.length, 150);
  const overflow = Math.max(0, visible - READING_FREE_CHARS);
  return Math.min(MAX_LIFETIME_MS, LIFETIME_BASE_MS[tone] + overflow * READING_MS_PER_CHAR);
}

export interface DemoRun {
  chats: DemoChat[];
  active: DemoChat;
  activeId: string;
  /** The active chat's phase — capture first, then whether IT is generating. */
  phase: DemoPhase;
  /** Every chat that is generating right now, background ones included. */
  streamingIds: string[];
  partial: string | null;
  thinkingStartedAt: number;

  /** Derived exactly as `apps/desktop/src/lib/listening.ts` derives it. */
  listening: ListeningStateId;
  /** Derived exactly as `apps/desktop/src/lib/orb.ts` derives it. */
  orb: OrbStateId;

  collapsed: boolean;
  unreadAnswer: boolean;
  buffering: boolean;
  autoMode: boolean;
  screenShareVisible: boolean;
  offline: boolean;
  previewOpen: boolean;
  teleprompterOpen: boolean;
  showRetry: boolean;
  notifications: DemoNotification[];
  turns: DemoTurn[];
  usedTokens: number;
  contextMaxTokens: number;
  settings: Record<string, SettingValue>;
  lastAnswer: string | null;

  selectChat: (id: string) => void;
  newChat: () => void;
  duplicateChat: () => void;
  closeChat: (id: string) => void;
  setDraft: (text: string) => void;
  addAttachment: () => void;
  removeAttachment: () => void;
  removeMessage: (index: number) => void;
  resendMessage: (index: number) => void;
  clearHistory: () => void;
  send: () => void;
  runQuickAction: (prompt: string) => void;
  stopStream: () => void;
  askByVoice: (prompt: VoicePrompt) => void;
  startRecording: () => void;
  stopRecording: () => void;
  cancel: () => void;
  retryTranscription: () => void;

  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  toggleBuffering: () => void;
  toggleAutoMode: () => void;
  toggleScreenShare: () => void;
  answerPendingTurns: () => void;
  setPreviewOpen: (open: boolean) => void;
  toggleTeleprompter: () => void;
  setOffline: (offline: boolean) => void;
  raiseNotification: (id: string) => void;
  dismissNotification: (id: string) => void;
  setSetting: (id: string, value: SettingValue) => void;
}

export function useDemoRun(copy: DemoCopy): DemoRun {
  const [chats, setChats] = useState<DemoChat[]>(() => freshChats(copy));
  const [activeId, setActiveId] = useState(() => copy.chats[0]?.id ?? "");
  const [capture, setCapture] = useState<CapturePhase>("idle");
  const [partials, setPartials] = useState<Record<string, string>>({});
  const [streamingIds, setStreamingIds] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<Record<string, number>>({});

  const [collapsed, setCollapsedState] = useState(false);
  const [unreadAnswer, setUnreadAnswer] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [autoMode, setAutoMode] = useState(false);
  const [screenShareVisible, setScreenShareVisible] = useState(false);
  const [offline, setOfflineState] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const [showRetry, setShowRetry] = useState(false);
  const [notifications, setNotifications] = useState<DemoNotification[]>([]);
  const [turns, setTurns] = useState<DemoTurn[]>([]);
  const [settings, setSettings] = useState<Record<string, SettingValue>>(() => seedSettings(copy));

  /** Timers that belong to the machine and are cancelled when it is redirected. */
  const timersRef = useRef<number[]>([]);
  /** Notification expiry, which a new send must NOT cancel — it clears the stack itself. */
  const notifTimersRef = useRef<number[]>([]);
  const frameRef = useRef(0);
  const streamsRef = useRef(new Map<string, Stream>());
  const recordingStartedAtRef = useRef(0);
  const lastTranscriptRef = useRef<string | null>(null);
  const autoTimerRef = useRef(0);
  const autoSubmitRef = useRef(0);
  const notificationSeqRef = useRef(0);

  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const chatSeqRef = useRef(copy.chats.length);
  const copyRef = useRef(copy);
  copyRef.current = copy;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const later = useCallback((delayMs: number, run: () => void) => {
    timersRef.current.push(window.setTimeout(run, delayMs));
  }, []);

  /** Cancels the capture/thinking timers. Streams are cancelled per chat. */
  const cancelTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const patchChat = useCallback((id: string, patch: (chat: DemoChat) => DemoChat) => {
    setChats((prev) => prev.map((chat) => (chat.id === id ? patch(chat) : chat)));
  }, []);

  const appendMessage = useCallback(
    (id: string, message: DemoMessage) => {
      patchChat(id, (chat) => ({ ...chat, messages: [...chat.messages, message] }));
    },
    [patchChat],
  );

  const dropStreamState = useCallback((chatId: string) => {
    streamsRef.current.delete(chatId);
    setStreamingIds((prev) => prev.filter((id) => id !== chatId));
    setPartials((prev) => {
      if (!(chatId in prev)) return prev;
      return Object.fromEntries(Object.entries(prev).filter(([id]) => id !== chatId));
    });
  }, []);

  // ---- notifications -----------------------------------------------------

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
    if (RETRYABLE_NOTIFICATIONS.includes(id)) setShowRetry(false);
  }, []);

  const raiseNotification = useCallback((id: string) => {
    const seed = copyRef.current.hud.notifications.items.find((item) => item.id === id);
    if (seed === undefined) return;
    notificationSeqRef.current += 1;
    const seq = notificationSeqRef.current;
    setNotifications((prev) => {
      const existing = prev.find((item) => item.id === id);
      const next: DemoNotification =
        existing === undefined
          ? { ...seed, count: 1, seq }
          : { ...existing, count: existing.count + 1, seq };
      return [...prev.filter((item) => item.id !== id), next].slice(-NOTIFICATION_LIMIT);
    });
    // A retryable failure also leaves a button behind, because a notification
    // expires and the offer to try again has to outlive it.
    if (RETRYABLE_NOTIFICATIONS.includes(id)) setShowRetry(true);
    notifTimersRef.current.push(
      window.setTimeout(
        () => {
          setNotifications((prev) => prev.filter((item) => item.id !== id || item.seq !== seq));
        },
        lifetimeMs(seed.tone, seed.title, seed.body),
      ),
    );
  }, []);

  // ---- the streams -------------------------------------------------------

  const tick: (now: number) => void = useCallback(
    (now: number) => {
      const streams = streamsRef.current;
      if (streams.size === 0) return;

      const revealed: Record<string, string> = {};
      const finished: Stream[] = [];

      for (const stream of streams.values()) {
        const elapsed = Math.min(MAX_FRAME_MS, now - stream.last);
        stream.last = now;
        const seconds = elapsed / 1000;

        stream.arrived = Math.min(
          stream.full.length,
          stream.arrived + ARRIVAL_CHARS_PER_SECOND * seconds,
        );
        const backlog = stream.arrived - stream.shown;
        const advance = Math.max(
          REVEAL_MIN_CHARS_PER_SECOND * seconds,
          backlog * REVEAL_BACKLOG_FRACTION_PER_SECOND * seconds,
        );
        stream.shown = Math.min(stream.arrived, stream.shown + advance);

        if (Math.floor(stream.shown) >= stream.full.length) finished.push(stream);
        else revealed[stream.chatId] = stream.full.slice(0, Math.floor(stream.shown));
      }

      for (const stream of finished) {
        streams.delete(stream.chatId);
        appendMessage(stream.chatId, { role: "assistant", text: stream.full });
        // `answerArrival` in the app: an answer in the chat you are LOOKING AT
        // brings the window back without stealing focus; one in a background
        // chat only marks the orb, because expanding would interrupt you.
        if (collapsedRef.current) {
          if (stream.chatId === activeIdRef.current) setCollapsedState(false);
          else setUnreadAnswer(true);
        }
      }

      if (finished.length > 0) {
        const done = new Set(finished.map((stream) => stream.chatId));
        setStreamingIds((prev) => prev.filter((id) => !done.has(id)));
      }
      setPartials((prev) => {
        const next: Record<string, string> = {};
        for (const [chatId, text] of Object.entries(prev)) {
          if (streams.has(chatId)) next[chatId] = revealed[chatId] ?? text;
        }
        return next;
      });

      if (streams.size > 0) frameRef.current = requestAnimationFrame(tick);
    },
    [appendMessage],
  );

  const beginStream = useCallback(
    (chatId: string, answer: string) => {
      setPartials((prev) => ({ ...prev, [chatId]: "" }));
      setStreamingIds((prev) => (prev.includes(chatId) ? prev : [...prev, chatId]));
      setStartedAt((prev) => ({ ...prev, [chatId]: Date.now() }));
      later(THINKING_MS, () => {
        streamsRef.current.set(chatId, {
          chatId,
          full: answer,
          arrived: 0,
          shown: 0,
          last: performance.now(),
        });
        if (streamsRef.current.size === 1) frameRef.current = requestAnimationFrame(tick);
      });
    },
    [later, tick],
  );

  const answerFor = useCallback((question: string): string => {
    const current = copyRef.current;
    return current.prompts.find((p) => p.question === question)?.answer ?? current.fallbackAnswer;
  }, []);

  const dispatch = useCallback(
    (chatId: string, text: string, keepDraft = false) => {
      const trimmed = text.trim();
      if (trimmed === "") return;
      // One stream per chat is a hard gate in the app too.
      if (streamingIds.includes(chatId)) return;
      // `dismissAllNotifications()` — the app clears the stack on every send:
      // a new attempt is a new conversation.
      setNotifications([]);
      appendMessage(chatId, { role: "user", text: trimmed });
      if (!keepDraft) patchChat(chatId, (chat) => ({ ...chat, draft: "", attachments: 0 }));
      beginStream(chatId, answerFor(trimmed));
    },
    [streamingIds, appendMessage, patchChat, beginStream, answerFor],
  );

  const send = useCallback(() => {
    const chatId = activeIdRef.current;
    const draft = chats.find((chat) => chat.id === chatId)?.draft ?? "";
    dispatch(chatId, draft);
  }, [chats, dispatch]);

  /**
   * A quick action sends its OWN prompt and leaves the composer's draft alone —
   * the app's rule, and the reason the buttons are usable mid-sentence.
   */
  const runQuickAction = useCallback(
    (prompt: string) => {
      if (collapsedRef.current) return;
      dispatch(activeIdRef.current, prompt, true);
    },
    [dispatch],
  );

  /**
   * Stop. The app KEEPS what was generated and commits it only when it is
   * non-empty, and a cancellation raises no notification at all.
   */
  const stopStream = useCallback(() => {
    const chatId = activeIdRef.current;
    const stream = streamsRef.current.get(chatId);
    cancelTimers();
    if (stream !== undefined && stream.shown >= 1) {
      appendMessage(chatId, {
        role: "assistant",
        text: stream.full.slice(0, Math.floor(stream.shown)),
      });
    }
    dropStreamState(chatId);
  }, [cancelTimers, appendMessage, dropStreamState]);

  // ---- capture -----------------------------------------------------------

  const deliverTranscript = useCallback(
    (chatId: string, text: string) => {
      lastTranscriptRef.current = text;
      setShowRetry(false);
      setCapture("idle");
      patchChat(chatId, (chat) => ({
        ...chat,
        draft: chat.draft === "" ? text : `${chat.draft} ${text}`,
      }));
      const autoSend = settingsRef.current["auto_send"] === true;
      // `transcriptArrival`: collapsed and NOT auto-sending means you have to
      // see the text, so the window comes back — without taking focus.
      if (collapsedRef.current && !autoSend) setCollapsedState(false);
      if (autoSend) {
        later(AUTOSEND_DELAY_MS, () => {
          dispatch(chatId, text);
        });
      }
    },
    [patchChat, later, dispatch],
  );

  const askByVoice = useCallback(
    (prompt: VoicePrompt) => {
      const chatId = activeIdRef.current;
      cancelTimers();
      dropStreamState(chatId);
      setCapture("recording");
      patchChat(chatId, (chat) => ({ ...chat, draft: "" }));
      later(RECORDING_MS, () => {
        setCapture("transcribing");
        later(TRANSCRIBING_MS, () => {
          deliverTranscript(chatId, prompt.question);
          if (settingsRef.current["auto_send"] !== true) {
            later(AUTOSEND_DELAY_MS, () => {
              dispatch(chatId, prompt.question);
            });
          }
        });
      });
    },
    [cancelTimers, dropStreamState, later, patchChat, deliverTranscript, dispatch],
  );

  /** Push-to-talk down. The app's `on_ptt_pressed`, minus the six device guards. */
  const startRecording = useCallback(() => {
    if (capture !== "idle") return;
    recordingStartedAtRef.current = Date.now();
    setCapture("recording");
  }, [capture]);

  /**
   * Push-to-talk up. Under `MIN_RECORDING_SECS` the app DISCARDS the take
   * silently — no transcript, no error. That branch is the reason a stray tap
   * on the record key does not put noise in the composer.
   */
  const stopRecording = useCallback(() => {
    if (capture !== "recording") return;
    const heldMs = Date.now() - recordingStartedAtRef.current;
    const chatId = activeIdRef.current;
    if (heldMs < MIN_RECORDING_MS) {
      setCapture("idle");
      return;
    }
    setCapture("transcribing");
    const prompt = copyRef.current.prompts[0];
    later(TRANSCRIBING_MS, () => {
      if (prompt === undefined) {
        setCapture("idle");
        return;
      }
      deliverTranscript(chatId, prompt.question);
    });
  }, [capture, later, deliverTranscript]);

  /**
   * Escape. `cancellable()` in the app: the recording first, the stream second,
   * and nothing at all when neither is live.
   */
  const cancel = useCallback(() => {
    if (teleprompterOpen) {
      setTeleprompterOpen(false);
      return;
    }
    if (capture === "recording") {
      cancelTimers();
      setCapture("idle");
      return;
    }
    if (streamingIds.includes(activeIdRef.current)) stopStream();
  }, [teleprompterOpen, capture, streamingIds, cancelTimers, stopStream]);

  const retryTranscription = useCallback(() => {
    const text = lastTranscriptRef.current;
    if (text === null) return;
    const chatId = activeIdRef.current;
    setCapture("transcribing");
    later(TRANSCRIBING_MS, () => {
      deliverTranscript(chatId, text);
    });
  }, [later, deliverTranscript]);

  // ---- window ------------------------------------------------------------

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    if (!next) setUnreadAnswer(false);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      if (prev) setUnreadAnswer(false);
      return !prev;
    });
  }, []);

  /**
   * The pause button on the capture pill. It turns off everything PASSIVE — the
   * ring buffer and auto listening — and never touches push-to-talk, which is
   * the app's rule and the reason the control is safe to hit mid-conversation.
   */
  const toggleBuffering = useCallback(() => {
    setBuffering((prev) => {
      if (prev) setAutoMode(false);
      return !prev;
    });
  }, []);

  const toggleAutoMode = useCallback(() => {
    setAutoMode((prev) => {
      if (!prev) setBuffering(true);
      return !prev;
    });
  }, []);

  const toggleScreenShare = useCallback(() => {
    setScreenShareVisible((prev) => !prev);
  }, []);

  const toggleTeleprompter = useCallback(() => {
    setTeleprompterOpen((prev) => !prev);
  }, []);

  const setOffline = useCallback((next: boolean) => {
    setOfflineState(next);
    if (next) setShowRetry(false);
  }, []);

  // ---- auto mode ---------------------------------------------------------

  const submitTurns = useCallback(() => {
    setTurns((prev) => {
      const pending = prev.filter((turn) => !turn.sent);
      if (pending.length === 0) return prev;
      const speakers = copyRef.current.hud.autoTranscript.speakers;
      const text = pending
        .map((turn) => {
          const who = turn.speaker === "interviewer" ? speakers.interviewer : speakers.user;
          return `${who}: ${turn.text}`;
        })
        .join("\n");
      dispatch(activeIdRef.current, text, true);
      return prev.map((turn) => ({ ...turn, sent: true }));
    });
  }, [dispatch]);

  const answerPendingTurns = useCallback(() => {
    window.clearTimeout(autoSubmitRef.current);
    submitTurns();
  }, [submitTurns]);

  useEffect(() => {
    if (!autoMode) {
      window.clearInterval(autoTimerRef.current);
      window.clearTimeout(autoSubmitRef.current);
      setTurns([]);
      return;
    }
    const seeds = copyRef.current.hud.autoTranscript.turns;
    let index = 0;
    autoTimerRef.current = window.setInterval(() => {
      const seed = seeds[index % seeds.length];
      index += 1;
      if (seed === undefined) return;
      setTurns((prev) => [...prev, { ...seed, sent: false }]);
      // `planSubmission`: only a turn from the INTERVIEWER starts a request.
      // Your own speech rides along as context and never triggers one.
      if (seed.speaker === "interviewer" && settingsRef.current["auto_reply_instant"] === true) {
        window.clearTimeout(autoSubmitRef.current);
        autoSubmitRef.current = window.setTimeout(submitTurns, AUTO_SUBMIT_DEBOUNCE_MS);
      }
    }, AUTO_TURN_INTERVAL_MS);
    return () => {
      window.clearInterval(autoTimerRef.current);
      window.clearTimeout(autoSubmitRef.current);
    };
  }, [autoMode, submitTurns]);

  // ---- chats -------------------------------------------------------------

  /**
   * Switching chats does NOT stop what the one you are leaving is generating.
   * That is the app's behaviour, and it is the whole reason a tab can carry a
   * busy dot at all.
   */
  const selectChat = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const newChat = useCallback(() => {
    if (chats.length >= CHAT_LIMIT) return;
    chatSeqRef.current += 1;
    const id = `chat-${String(chatSeqRef.current)}`;
    setChats((prev) => [
      ...prev,
      { id, title: copyRef.current.newChatTitle, messages: [], draft: "", attachments: 0 },
    ]);
    setActiveId(id);
  }, [chats.length]);

  /** The app copies the chat's SETTINGS and not its history or its draft. */
  const duplicateChat = useCallback(() => {
    if (chats.length >= CHAT_LIMIT) return;
    chatSeqRef.current += 1;
    const id = `chat-${String(chatSeqRef.current)}`;
    setChats((prev) => [
      ...prev,
      { id, title: copyRef.current.newChatTitle, messages: [], draft: "", attachments: 0 },
    ]);
    setActiveId(id);
  }, [chats.length]);

  const closeChat = useCallback(
    (id: string) => {
      if (chats.length <= 1) return;
      dropStreamState(id);
      const rest = chats.filter((chat) => chat.id !== id);
      setChats(rest);
      const fallback = rest[0];
      if (fallback !== undefined && id === activeIdRef.current) setActiveId(fallback.id);
    },
    [chats, dropStreamState],
  );

  const setDraft = useCallback(
    (text: string) => {
      patchChat(activeIdRef.current, (chat) => ({ ...chat, draft: text }));
    },
    [patchChat],
  );

  const addAttachment = useCallback(() => {
    patchChat(activeIdRef.current, (chat) => ({
      ...chat,
      attachments: Math.min(5, chat.attachments + 1),
    }));
  }, [patchChat]);

  const removeAttachment = useCallback(() => {
    patchChat(activeIdRef.current, (chat) => ({
      ...chat,
      attachments: Math.max(0, chat.attachments - 1),
    }));
  }, [patchChat]);

  const removeMessage = useCallback(
    (index: number) => {
      patchChat(activeIdRef.current, (chat) => ({
        ...chat,
        messages: chat.messages.filter((_, i) => i !== index),
      }));
    },
    [patchChat],
  );

  /**
   * Resend from a message: everything below it is replaced by the new answer,
   * which is what the app's tooltip promises.
   */
  const resendMessage = useCallback(
    (index: number) => {
      const chatId = activeIdRef.current;
      const message = chats.find((item) => item.id === chatId)?.messages[index];
      if (message?.role !== "user") return;
      cancelTimers();
      dropStreamState(chatId);
      patchChat(chatId, (item) => ({ ...item, messages: item.messages.slice(0, index + 1) }));
      beginStream(chatId, answerFor(message.text));
    },
    [chats, cancelTimers, dropStreamState, patchChat, beginStream, answerFor],
  );

  const clearHistory = useCallback(() => {
    const chatId = activeIdRef.current;
    cancelTimers();
    dropStreamState(chatId);
    setPreviewOpen(false);
    patchChat(chatId, (chat) => ({ ...chat, messages: [] }));
  }, [cancelTimers, dropStreamState, patchChat]);

  const setSetting = useCallback((id: string, value: SettingValue) => {
    setSettings((prev) => ({ ...prev, [id]: value }));
    // Two settings have a second home in the window chrome, and the app keeps
    // them in step: the buffer switch IS the pause button, and the screen-share
    // switch IS the eye in the header.
    if (id === "buffer_enabled") setBuffering(value === true);
    if (id === "screen_share_visible") setScreenShareVisible(value === true);
  }, []);

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
      notifTimersRef.current.forEach(clearTimeout);
      cancelAnimationFrame(frameRef.current);
      streamsRef.current.clear();
    },
    [],
  );

  // ---- derived -----------------------------------------------------------

  const active = chats.find((chat) => chat.id === activeId) ?? chats[0];
  const hasError = notifications.length > 0;
  const activeStreaming = streamingIds.includes(activeId);
  const partial = partials[activeId] ?? null;

  const phase: DemoPhase = capture === "idle" ? (activeStreaming ? "streaming" : "idle") : capture;

  const listening: ListeningStateId = useMemo(() => {
    if (capture === "recording") return "recording";
    if (capture === "transcribing") return "transcribing";
    if (autoMode) return "auto";
    if (hasError) return "error";
    return buffering ? "armed" : "off";
  }, [capture, autoMode, hasError, buffering]);

  const orb: OrbStateId = useMemo(() => {
    if (listening === "recording" || listening === "auto" || listening === "transcribing") {
      return listening;
    }
    if (streamingIds.length > 0) return "transcribing";
    if (unreadAnswer) return "answer";
    return listening;
  }, [listening, streamingIds, unreadAnswer]);

  const usedTokens = useMemo(() => {
    const chars =
      (active?.messages.reduce((total, message) => total + message.text.length, 0) ?? 0) +
      (partial?.length ?? 0);
    return Math.round(chars / CHARS_PER_TOKEN);
  }, [active, partial]);

  const lastAnswer = useMemo(() => {
    const messages = active?.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role === "assistant") return message.text;
    }
    return partial === null || partial === "" ? null : partial;
  }, [active, partial]);

  return {
    chats,
    active: active ?? { id: "", title: "", messages: [], draft: "", attachments: 0 },
    activeId,
    phase,
    streamingIds,
    partial,
    thinkingStartedAt: startedAt[activeId] ?? 0,
    listening,
    orb,
    collapsed,
    unreadAnswer,
    buffering,
    autoMode,
    screenShareVisible,
    offline,
    previewOpen,
    teleprompterOpen,
    showRetry,
    notifications,
    turns,
    usedTokens,
    contextMaxTokens: CONTEXT_MAX_TOKENS,
    settings,
    lastAnswer,

    selectChat,
    newChat,
    duplicateChat,
    closeChat,
    setDraft,
    addAttachment,
    removeAttachment,
    removeMessage,
    resendMessage,
    clearHistory,
    send,
    runQuickAction,
    stopStream,
    askByVoice,
    startRecording,
    stopRecording,
    cancel,
    retryTranscription,

    setCollapsed,
    toggleCollapsed,
    toggleBuffering,
    toggleAutoMode,
    toggleScreenShare,
    answerPendingTurns,
    setPreviewOpen,
    toggleTeleprompter,
    setOffline,
    raiseNotification,
    dismissNotification,
    setSetting,
  };
}
