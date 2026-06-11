import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./env";
import { DEFAULT_SETTINGS, type ChatMessageDto, type Settings } from "./types";

export async function sendToClaude(messages: ChatMessageDto[], chatId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("send_to_claude", { messages, chatId });
}

export async function cancelStream(chatId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("cancel_stream", { chatId });
}

export async function retryTranscription(): Promise<void> {
  if (!isTauri()) return;
  await invoke("retry_transcription");
}

export async function getSettings(): Promise<Settings> {
  if (!isTauri()) return DEFAULT_SETTINGS;
  return invoke<Settings>("get_settings");
}

export async function setSettings(newSettings: Settings): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_settings", { newSettings });
}

export async function moveWindowBy(dx: number, dy: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("move_window_by", { dx, dy });
}

export async function setPttSuspended(suspended: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_ptt_suspended", { suspended });
}

export async function openAudioPermissionSettings(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_audio_permission_settings");
}

export async function captureAvailable(): Promise<boolean> {
  if (!isTauri()) return true;
  return invoke<boolean>("capture_available");
}

export async function openExternal(url: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_external", { url });
}

/** Плавно меняет ширину главного окна (логические px), сохраняя высоту; растёт вправо. */
export async function setWindowWidth(width: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_window_width", { width });
}

/** Возвращает сохранённую JSON-строку чатов (пустая строка, если файла нет). */
export async function loadChats(): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("load_chats");
}

export async function saveChats(json: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("save_chats", { json });
}

/** Кладёт HTML в бэкенд; следующий запрос к схеме preview:// отдаст его. No-op вне Tauri. */
export async function setPreviewHtml(html: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_preview_html", { html });
}
