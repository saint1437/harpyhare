import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./env";
import { DEFAULT_SETTINGS, type ImagePayload, type Settings } from "./types";

export async function sendToClaude(text: string, images: ImagePayload[]): Promise<void> {
  if (!isTauri()) return;
  await invoke("send_to_claude", { text, images });
}

export async function cancelStream(): Promise<void> {
  if (!isTauri()) return;
  await invoke("cancel_stream");
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
  const win = getCurrentWindow();
  const factor = await win.scaleFactor();
  const current = (await win.innerSize()).toLogical(factor);
  await win.setSize(new LogicalSize(current.width, height));
}
