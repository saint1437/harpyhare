import { getCurrentWindow } from "@tauri-apps/api/window";
import { normalizeAccessCode } from "@/lib/access-code";
import { type RequestOptions } from "@/lib/chats";
import { commands } from "./bindings";
import { type ChatMessageDto, type SecretsStatus, type Settings, type UpdateInfo } from "./types";

const IDEMPOTENCY_STORAGE_PREFIX = "redeem-idem:";

export const {
  cancelRecording,
  cancelStream,
  captureRegionScreenshot,
  closeApp,
  copyImageToClipboard,
  getAppVersion,
  getOfficialPresets,
  getSecretsStatus,
  setWindowCollapsed,
  installUpdate,
  launchMainWindow,
  listAudioOutputDevices,
  listAudioInputDevices,
  startAutoMode,
  stopAutoMode,
  autoModeActive,
  takeAutoModeError,
  takeSettingsRecovery,
  checkAudioSource,
  listModels,
  loadChatImages,
  loadChats,
  loadContextLibrary,
  openExternal,
  openPermissionSettings,
  permissionsStatus,
  probeConnectivity,
  pruneChatImages,
  readContextImportFile,
  readContextPdfBytes,
  requestPermission,
  retryTranscription,
  saveChatImage,
  saveChats,
  saveContextLibrary,
  setApiKey,
  clearApiKey,
  clearAccessCode,
  setPreviewHtml,
  setPttSuspended,
  setWindowSize,
  stopMainWindow,
} = commands;

export async function startWindowDrag(): Promise<void> {
  await getCurrentWindow().startDragging();
}

export async function sendToClaude(
  messages: ChatMessageDto[],
  chatId: string,
  system: string,
  model: string,
  options: RequestOptions,
): Promise<void> {
  await commands.sendToClaude(messages, chatId, system, model, options);
}

export async function countChatTokens(
  messages: ChatMessageDto[],
  system: string,
  model: string,
  options: RequestOptions,
): Promise<number> {
  return commands.countChatTokens(messages, system, model, options);
}

export async function getSettings(): Promise<Settings> {
  return commands.getSettings() as Promise<Settings>;
}

export async function setSettings(newSettings: Settings): Promise<Settings> {
  return commands.setSettings(newSettings) as Promise<Settings>;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  return commands.checkForUpdate();
}

async function idempotencyStorageKey(normalizedCode: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedCode));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return IDEMPOTENCY_STORAGE_PREFIX + hex.slice(0, 16);
}

/**
 * Both halves of the answer. The command replies with the fresh
 * {@link SecretsStatus} — the token it just wrote is the only thing a redeem
 * changes — and the caller adopts it directly rather than asking again: a second
 * round trip could fail on its own and leave a paid code looking unredeemed.
 */
export type RedeemOutcome = { status: SecretsStatus } | { error: string };

export async function redeemAccessCode(code: string): Promise<RedeemOutcome> {
  const normalized = normalizeAccessCode(code);
  const storageKey = await idempotencyStorageKey(normalized);
  const idempotencyKey = localStorage.getItem(storageKey) ?? crypto.randomUUID();
  localStorage.setItem(storageKey, idempotencyKey);
  try {
    const status = await commands.redeemAccessCode(normalized, idempotencyKey);
    localStorage.removeItem(storageKey);
    return { status };
  } catch (e) {
    return { error: String(e) };
  }
}
