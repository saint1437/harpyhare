export type ErrorCode =
  | "network"
  | "badApiKey"
  | "badAccessCode"
  | "retryable"
  | "api"
  | "cancelled"
  | "permission"
  | "silence"
  | "internal";

export interface AppError {
  code: ErrorCode;
  message: string;
}

const RETRYABLE_CODES: readonly ErrorCode[] = ["network", "retryable"];

export function internalError(message: string): AppError {
  return { code: "internal", message };
}

const ERROR_CODES: readonly ErrorCode[] = [
  "network",
  "badApiKey",
  "badAccessCode",
  "retryable",
  "api",
  "cancelled",
  "permission",
  "silence",
  "internal",
];

function isAppError(value: unknown): value is AppError {
  if (typeof value !== "object" || value === null) return false;
  const { code, message } = value as Partial<AppError>;
  return typeof message === "string" && ERROR_CODES.some((known) => known === code);
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

/**
 * A headline for every code — short, fixed, and always the same length class.
 *
 * The message from Rust is a whole sentence and may carry a slab of someone
 * else's JSON inside it (`api_error_message` splices up to 120 characters of a
 * non-JSON body in, and a Tauri `invoke` rejection arrives as raw `String(e)`).
 * Only the code is guaranteed to be short, so only the code may be the headline;
 * the message is the body, and the body is what gets clamped.
 */
const ERROR_TITLES: Record<ErrorCode, string> = {
  network: "Нет соединения",
  badApiKey: "Ключ не принят",
  badAccessCode: "Код доступа не принят",
  retryable: "Сервис перегружен",
  api: "Ошибка сервиса",
  cancelled: "Остановлено",
  permission: "Нет доступа",
  silence: "Тишина",
  internal: "Сбой в приложении",
};

export function errorTitle(code: ErrorCode): string {
  return ERROR_TITLES[code];
}
