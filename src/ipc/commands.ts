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

/** Меняет высоту главного окна, сохраняя текущую ширину (для сворачивания ответа). */
export async function setWindowHeight(height: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_window_height", { height });
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

/** Демо-контент превью для браузера (вне Tauri) — визуальная итерация по ?window=preview. */
const DEMO_PREVIEW_HTML = `<!doctype html>
<html><body style="font-family: system-ui; padding: 24px">
<h2>Демо превью</h2>
<p>В Tauri здесь рендерится HTML из ответа Claude.</p>
<button onclick="this.textContent='живой JS!'">Нажми меня</button>
</body></html>`;

/** Текущий HTML окна превью (пустая строка, если ещё ничего не показывали). */
export async function getPreviewHtml(): Promise<string> {
  if (!isTauri()) return DEMO_PREVIEW_HTML;
  return invoke<string>("get_preview_html");
}

/** Показывает HTML в окне превью (создаёт или переиспользует). focus — отдать ли окну фокус. */
export async function showHtmlPreview(html: string, focus: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("show_html_preview", { html, focus });
}

/** Закрывает текущее окно — для ✕/Esc внутри окна превью. */
export async function closePreviewWindow(): Promise<void> {
  if (!isTauri()) return;
  // Динамический импорт — чтобы api/window не попадал в браузерный путь бандла.
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}
