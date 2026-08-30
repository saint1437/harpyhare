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

export function isRetryable(error: AppError | null): boolean {
  return error !== null && RETRYABLE_CODES.includes(error.code);
}

export function isNetworkError(error: AppError | null): boolean {
  return error?.code === "network";
}
