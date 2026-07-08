import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FALLBACK_MODELS, type ModelInfo } from "@/lib/models";
import { isTauri } from "./env";
import { DEFAULT_SETTINGS, type ChatMessageDto, type Settings, type UpdateInfo } from "./types";

async function invokeOrNoopInBrowser(command: string, args?: InvokeArgs): Promise<void> {
  if (!isTauri()) return;
  await invoke(command, args);
}

export async function startWindowDrag(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().startDragging();
}

async function invokeOrFallbackInBrowser<T>(
  command: string,
  browserFallback: T,
  args?: InvokeArgs,
): Promise<T> {
  if (!isTauri()) return browserFallback;
  return invoke<T>(command, args);
}

export async function sendToClaude(
  messages: ChatMessageDto[],
  chatId: string,
  system: string,
  thinking: boolean,
  model: string,
  webSearch: boolean,
): Promise<void> {
  await invokeOrNoopInBrowser("send_to_claude", {
    messages,
    chatId,
    system,
    thinking,
    model,
    webSearch,
  });
}

export async function listModels(): Promise<ModelInfo[]> {
  return invokeOrFallbackInBrowser("list_models", FALLBACK_MODELS);
}

export async function cancelStream(chatId: string): Promise<void> {
  await invokeOrNoopInBrowser("cancel_stream", { chatId });
}

export async function retryTranscription(): Promise<void> {
  await invokeOrNoopInBrowser("retry_transcription");
}

export async function getSettings(): Promise<Settings> {
  return invokeOrFallbackInBrowser("get_settings", DEFAULT_SETTINGS);
}

export async function setSettings(newSettings: Settings): Promise<void> {
  await invokeOrNoopInBrowser("set_settings", { newSettings });
}

export async function moveWindowBy(dx: number, dy: number): Promise<void> {
  await invokeOrNoopInBrowser("move_window_by", { dx, dy });
}

export async function setPttSuspended(suspended: boolean): Promise<void> {
  await invokeOrNoopInBrowser("set_ptt_suspended", { suspended });
}

export async function closeApp(): Promise<void> {
  await invokeOrNoopInBrowser("close_app");
}

export async function hideMainWindow(): Promise<void> {
  await invokeOrNoopInBrowser("hide_main_window");
}

export async function openAudioPermissionSettings(): Promise<void> {
  await invokeOrNoopInBrowser("open_audio_permission_settings");
}

export async function captureAvailable(): Promise<boolean> {
  return invokeOrFallbackInBrowser("capture_available", true);
}

export async function openExternal(url: string): Promise<void> {
  await invokeOrNoopInBrowser("open_external", { url });
}

export async function setWindowWidth(width: number): Promise<void> {
  await invokeOrNoopInBrowser("set_window_width", { width });
}

export async function loadChats(): Promise<string> {
  return invokeOrFallbackInBrowser("load_chats", "");
}

export async function saveChats(json: string): Promise<void> {
  await invokeOrNoopInBrowser("save_chats", { json });
}

export async function setPreviewHtml(html: string): Promise<void> {
  await invokeOrNoopInBrowser("set_preview_html", { html });
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  return invokeOrFallbackInBrowser<UpdateInfo | null>("check_for_update", null);
}

export async function installUpdate(): Promise<void> {
  await invokeOrNoopInBrowser("install_update");
}

export async function getAppVersion(): Promise<string> {
  return invokeOrFallbackInBrowser("get_app_version", "");
}
