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
