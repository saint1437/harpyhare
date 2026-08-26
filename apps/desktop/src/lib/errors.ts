/**
 * The mirror of Rust's `error::ErrorCode` — and, since the app went bilingual,
 * nothing but the mirror: not a word of what the user reads lives here any
 * more. `ERROR_TITLES` used to sit in this file as a `Record<ErrorCode, string>`
 * of Russian headlines; the headlines are `dict.errors.titles` now, and this
 * module keeps only what is language-free — the vocabulary, the shape, and the
 * two predicates the UI branches on.
 *
 * That split is also what keeps the module graph acyclic: `@/i18n` imports these
 * types to build its exhaustive records, so this file must not import `@/i18n`.
 */
export const ERROR_CODES = [
  "network",
  "badApiKey",
  "badAccessCode",
  "retryable",
  "api",
  "cancelled",
  "permission",
  "silence",
  "internal",
  "requestTooLarge",
  "audioTooLong",
  "modelNotAllowed",
  "dailyLimitExceeded",
  "tooManyAttempts",
  "serviceUnavailable",
  "providerUnreachable",
  "contextTooLong",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Machine values for the dictionary's template — a limit in megabytes, a
 * rejected model id, a wait in seconds. Never a finished phrase; the one
 * deliberate exception is `details`, which is somebody else's text (an upstream
 * body, an OS message) quoted verbatim inside a localized frame.
 */
export type ErrorParams = Readonly<Record<string, string>>;

export interface AppError {
  code: ErrorCode;
  /**
   * The Russian sentence Rust wrote. It is NOT what the UI shows any more — it
   * is the log line, and the last resort if a code ever arrives that this build
   * has no phrase for. Rust keeps it for the same reason the proxy worker does:
   * the builds already in users' hands read nothing else.
   */
  message: string;
  params?: ErrorParams;
}

/**
 * The runtime list of codes is READ OFF the exhaustive tuple above rather than
 * written out a second time: a hand-kept copy is invisible to the compiler, so
 * a new variant would pass type-checking while `asAppError` quietly demoted it
 * to `internal`.
 */
const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set(ERROR_CODES);

const RETRYABLE_CODES: readonly ErrorCode[] = ["network", "retryable", "providerUnreachable"];

export function internalError(message: string): AppError {
  return { code: "internal", message };
}

function isAppError(value: unknown): value is AppError {
  if (typeof value !== "object" || value === null) return false;
  const { code, message } = value as Partial<AppError>;
  return typeof message === "string" && typeof code === "string" && KNOWN_ERROR_CODES.has(code);
}

export function asAppError(thrown: unknown): AppError {
  if (isAppError(thrown)) return thrown;
  if (typeof thrown === "string") return internalError(thrown);
  return internalError(String(thrown));
}

export function isRetryable(error: AppError | null): boolean {
  return error !== null && RETRYABLE_CODES.includes(error.code);
}

export function isNetworkError(error: AppError | null): boolean {
  return error?.code === "network";
}
