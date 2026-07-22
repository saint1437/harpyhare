import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { normalizeAccessCode } from "@/lib/access-code";
import { type ModelInfo } from "@/lib/models";
import { type PromptPreset } from "@/lib/presets";
import {
  type AudioOutputDevice,
  type ChatMessageDto,
  type IdentityInfo,
  type Settings,
  type UpdateInfo,
} from "./types";

const IDEMPOTENCY_STORAGE_PREFIX = "redeem-idem:";

export async function startWindowDrag(): Promise<void> {
  await getCurrentWindow().startDragging();
}

export async function sendToClaude(
  messages: ChatMessageDto[],
  chatId: string,
  system: string,
  thinking: boolean,
  model: string,
  webSearch: boolean,
): Promise<void> {
  await invoke("send_to_claude", {
    messages,
    chatId,
    system,
    thinking,
    model,
    webSearch,
  });
}

export async function listModels(): Promise<ModelInfo[]> {
  return invoke<ModelInfo[]>("list_models");
}

export async function cancelStream(chatId: string): Promise<void> {
  await invoke("cancel_stream", { chatId });
}

export async function countChatTokens(
  messages: ChatMessageDto[],
  system: string,
  thinking: boolean,
  model: string,
  webSearch: boolean,
): Promise<number> {
  return invoke<number>("count_chat_tokens", {
    messages,
    system,
    thinking,
    model,
    webSearch,
  });
}

export async function probeConnectivity(): Promise<boolean> {
  return invoke<boolean>("probe_connectivity");
}

export async function retryTranscription(): Promise<void> {
  await invoke("retry_transcription");
}

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export async function setSettings(newSettings: Settings): Promise<void> {
  await invoke("set_settings", { newSettings });
}

export async function listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
  return invoke<AudioOutputDevice[]>("list_audio_output_devices");
}

async function idempotencyStorageKey(normalizedCode: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedCode));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return IDEMPOTENCY_STORAGE_PREFIX + hex.slice(0, 16);
}

export async function redeemAccessCode(code: string): Promise<string | null> {
  const normalized = normalizeAccessCode(code);
  const storageKey = await idempotencyStorageKey(normalized);
  const idempotencyKey = localStorage.getItem(storageKey) ?? crypto.randomUUID();
  localStorage.setItem(storageKey, idempotencyKey);
  try {
    await invoke("redeem_access_code", { code: normalized, idempotencyKey });
    localStorage.removeItem(storageKey);
    return null;
  } catch (e) {
    return String(e);
  }
}

export async function getOfficialPresets(): Promise<PromptPreset[]> {
  return invoke<PromptPreset[]>("get_official_presets");
}

export async function moveWindowBy(dx: number, dy: number): Promise<void> {
  await invoke("move_window_by", { dx, dy });
}

export async function setPttSuspended(suspended: boolean): Promise<void> {
  await invoke("set_ptt_suspended", { suspended });
}

export async function closeApp(): Promise<void> {
  await invoke("close_app");
}

export async function hideMainWindow(): Promise<void> {
  await invoke("hide_main_window");
}

export async function openAudioPermissionSettings(): Promise<void> {
  await invoke("open_audio_permission_settings");
}

export async function captureAvailable(): Promise<boolean> {
  return invoke<boolean>("capture_available");
}

export async function requestAudioCapturePermission(): Promise<boolean> {
  return invoke<boolean>("request_audio_capture_permission");
}

export async function openExternal(url: string): Promise<void> {
  await invoke("open_external", { url });
}

export async function setWindowSize(width: number, height: number): Promise<void> {
  await invoke("set_window_size", { width, height });
}

export async function loadChats(): Promise<string> {
  return invoke<string>("load_chats");
}

export async function saveChats(json: string): Promise<void> {
  await invoke("save_chats", { json });
}

export async function loadContextLibrary(): Promise<string> {
  return invoke<string>("load_context_library");
}

export async function saveContextLibrary(json: string): Promise<void> {
  await invoke("save_context_library", { json });
}

export async function readContextImportFile(path: string): Promise<string> {
  return invoke<string>("read_context_import_file", { path });
}

export async function readContextPdfBytes(dataBase64: string): Promise<string> {
  return invoke<string>("read_context_pdf_bytes", { dataBase64 });
}

export async function setPreviewHtml(html: string): Promise<void> {
  await invoke("set_preview_html", { html });
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  return invoke<UpdateInfo | null>("check_for_update");
}

export async function installUpdate(): Promise<void> {
  await invoke("install_update");
}

export async function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}

export async function listIdentities(): Promise<IdentityInfo[]> {
  return invoke<IdentityInfo[]>("list_identities");
}

export async function setAppIdentity(identityId: string): Promise<void> {
  await invoke("set_app_identity", { identityId });
}
