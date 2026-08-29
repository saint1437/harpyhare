import { format, getDict } from "@/i18n";
import { errorBody, errorTitle } from "@/i18n/errors";
import type { AppError, ErrorCode } from "./errors";

/**
 * Every transient message in both windows — one model, one store, one surface.
 *
 * Before this the app had six error surfaces and each of them printed the raw
 * message in place: the HUD truncated it to 64 characters inside the status
 * object, the launcher grew a full-width banner, the update dialog stretched
 * itself around a `whitespace-pre-wrap` block. An API error carrying a slab of
 * someone else's JSON therefore either did not fit at all or wrecked the layout
 * around it. A notification splits the message in two — a headline that always
 * fits and a body that is clamped, expandable and copyable — and takes itself
 * away afterwards, which is the part no in-place surface could do.
 *
 * The store lives at module scope on purpose: the two windows are two React
 * roots that share no state, so a module singleton IS per-window state, and a
 * notification can be raised from anywhere (`AccessCodeForm` sits four levels
 * down in both of them) without threading a callback through the tree.
 */
export type NotificationTone = "danger" | "warning" | "success";

export interface AppNotification {
  id: string;
  tone: NotificationTone;
  /** One line, never clamped. */
  title: string;
  /** The whole message; the card clamps and expands it. */
  detail: string;
  /** How many identical notifications collapsed into this one. */
  count: number;
  lifetimeMs: number;
}

export interface NotificationInput {
  tone: NotificationTone;
  title: string;
  detail?: string;
}

/** Beyond this the card offers «Подробнее» instead of the whole body. */
export const DETAIL_CLAMP_CHARS = 150;

/** Three at once is the most the HUD's column can carry without hiding the chat. */
export const NOTIFICATION_LIMIT = 3;

const BASE_LIFETIME_MS: Record<NotificationTone, number> = {
  danger: 9000,
  warning: 7000,
  success: 3500,
};

/**
 * Reading time is bought per character, but only for the characters actually on
 * screen: the body is clamped, so a 4 KB stack trace must not buy 3 minutes of
 * screen time for the three lines of it anyone will read.
 */
const READING_FREE_CHARS = 60;
const READING_MS_PER_CHAR = 45;
const MAX_LIFETIME_MS = 25000;

export function notificationLifetime(
  tone: NotificationTone,
  title: string,
  detail: string,
): number {
  const visible = title.length + Math.min(detail.length, DETAIL_CLAMP_CHARS);
  const overflow = Math.max(0, visible - READING_FREE_CHARS);
  return Math.min(MAX_LIFETIME_MS, BASE_LIFETIME_MS[tone] + overflow * READING_MS_PER_CHAR);
}

export function isDetailClamped(detail: string): boolean {
  return detail.length > DETAIL_CLAMP_CHARS || detail.includes("\n");
}

/**
 * A body that opens with the very words the code already put in the headline
 * leaves the reader with a stutter, so the headline is never repeated in the
 * body. It matters less than it did — the dictionary writes the two halves
 * together — but a `{details}` slice quoted from an upstream can still start
 * with them, and `notifyError` takes a free-form title from its caller.
 */
export function notificationBody(title: string, detail: string): string {
  if (!detail.toLowerCase().startsWith(title.toLowerCase())) return detail;
  return detail.slice(title.length).replace(/^[\s—–:-]+/u, "");
}

/**
 * A screen reader hears exactly what the card shows: the headline and as much
 * of the body as fits before «Подробнее». There is no expanding a card by voice,
 * and reading four kilobytes of someone else's JSON aloud helps nobody.
 */
export function notificationAnnouncement(item: AppNotification): string {
  const body = notificationBody(item.title, item.detail);
  // The count is part of the announcement so a collapsed repeat CHANGES the
  // string: with aria-atomic an identical text is not re-announced, and the
  // silent ×N bump left a screen reader thinking nothing had happened.
  const heading =
    item.count > 1
      ? `${item.title} (${format(getDict().common.notifications.repeat, { count: String(item.count) })})`
      : item.title;
  if (body === "") return heading;
  const visible = body.length > DETAIL_CLAMP_CHARS ? `${body.slice(0, DETAIL_CLAMP_CHARS)}…` : body;
  return `${heading}. ${visible}`;
}

/**
 * The same failure repeated is one notification with a counter, not a stack of
 * three: `llm-error` fires once per chat and the HUD runs several at a time, so
 * a dead proxy used to arrive three times over.
 */
export function stackNotifications(
  list: readonly AppNotification[],
  incoming: AppNotification,
): AppNotification[] {
  const twin = list.find(
    (n) => n.tone === incoming.tone && n.title === incoming.title && n.detail === incoming.detail,
  );
  if (twin !== undefined) {
    return [...list.filter((n) => n !== twin), { ...twin, count: twin.count + 1 }];
  }
  return [...list, incoming].slice(-NOTIFICATION_LIMIT);
}

/**
 * The user asked for the cancellation, so there is nothing to report — and the
 * two "wait and try again" codes are not failures of the app, which is why they
 * get the warning tone rather than the alarm one.
 */
export const TONE_BY_CODE: Record<ErrorCode, NotificationTone | null> = {
  cancelled: null,
  network: "warning",
  retryable: "warning",
  silence: "warning",
  providerUnreachable: "warning",
  tooManyAttempts: "warning",
  badApiKey: "danger",
  badAccessCode: "danger",
  api: "danger",
  permission: "danger",
  internal: "danger",
  requestTooLarge: "danger",
  audioTooLong: "danger",
  modelNotAllowed: "danger",
  dailyLimitExceeded: "danger",
  serviceUnavailable: "danger",
  contextTooLong: "danger",
};

/* ── store ────────────────────────────────────────────────────────────────── */

interface Entry {
  item: AppNotification;
  remainingMs: number;
}

/**
 * One interval for the whole stack rather than a timeout per card: pausing is
 * then a single flag, and the countdown never has to be reconciled with the
 * wall clock after a pause.
 */
const TICK_MS = 200;

let entries: readonly Entry[] = [];
let snapshot: readonly AppNotification[] = [];
let paused = false;
let ticker: ReturnType<typeof setInterval> | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

function syncTicker(): void {
  const wanted = !paused && entries.length > 0;
  if (wanted && ticker === null) ticker = setInterval(tick, TICK_MS);
  if (!wanted && ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
}

function publish(next: readonly Entry[]): void {
  entries = next;
  snapshot = next.map((entry) => entry.item);
  syncTicker();
  listeners.forEach((listener) => {
    listener();
  });
}

function tick(): void {
  let expired = false;
  // The countdown is entry-private — nothing outside this module reads it and
  // `snapshot` holds the items, not the entries — so ageing in place is
  // invisible, and it keeps the common branch free of allocation.
  for (const entry of entries) {
    entry.remainingMs -= TICK_MS;
    if (entry.remainingMs <= 0) expired = true;
  }
  // Nothing expired: the countdown moved but the snapshot did not, and a
  // notified listener five times a second would re-render both windows for
  // nothing.
  if (expired) publish(entries.filter((entry) => entry.remainingMs > 0));
}

export function subscribeNotifications(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNotifications(): readonly AppNotification[] {
  return snapshot;
}

/**
 * «Что-то сломалось?» — вопрос строки захвата и клубка, и ответ на него не
 * зависит от того, насколько громко об этом сказано: перегруженный провайдер
 * такой же отказ, как неверный ключ. Мимо проходит только подтверждение.
 */
export function hasFailureNotification(items: readonly AppNotification[]): boolean {
  return items.some((item) => item.tone !== "success");
}

export function notify(input: NotificationInput): void {
  const detail = input.detail ?? "";
  sequence += 1;
  const incoming: AppNotification = {
    id: `notification-${String(sequence)}`,
    tone: input.tone,
    title: input.title,
    detail,
    count: 1,
    lifetimeMs: notificationLifetime(input.tone, input.title, detail),
  };
  const items = stackNotifications(snapshot, incoming);
  publish(
    items.map((item) => {
      const previous = entries.find((entry) => entry.item.id === item.id);
      // A repeat restarts the clock: the notification is about the failure that
      // just happened, not the one that happened eight seconds ago.
      const carriesOver = previous?.item.count === item.count;
      return { item, remainingMs: carriesOver ? previous.remainingMs : item.lifetimeMs };
    }),
  );
}

export function notifyError(title: string, detail?: string): void {
  notify({ tone: "danger", title, detail });
}

/**
 * The typed code decides the headline, the tone AND the body — the last one is
 * what changed when the app went bilingual. `error.message` used to be printed
 * verbatim; it is a Russian log line now, and `errorBody` renders the phrase
 * from the code and the machine parameters beside it, falling back to `message`
 * only for a code this build has nothing to say about.
 */
export function notifyAppError(error: AppError): void {
  const tone = TONE_BY_CODE[error.code];
  if (tone === null) return;
  const dict = getDict();
  notify({ tone, title: errorTitle(error.code, dict), detail: errorBody(error, dict) });
}

export function notifySuccess(title: string, detail?: string): void {
  notify({ tone: "success", title, detail });
}

export function dismissNotification(id: string): void {
  publish(entries.filter((entry) => entry.item.id !== id));
}

export function dismissAllNotifications(): void {
  paused = false;
  publish([]);
}

/** Held while the pointer is over the stack or a body is expanded — nothing
 *  vanishes out from under someone who is reading it. */
export function pauseNotifications(): void {
  paused = true;
  syncTicker();
}

export function resumeNotifications(): void {
  paused = false;
  syncTicker();
}
