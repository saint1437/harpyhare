export interface AppMode {
  id: string;
  label: string;
  hint: string;
}

const CHAT_MODE_ID = "chat";
const NOTES_MODE_ID = "notes";

export const APP_MODES = [
  { id: CHAT_MODE_ID, label: "Чат", hint: "Переписка с моделью" },
  { id: NOTES_MODE_ID, label: "Заметки", hint: "Поиск по своим материалам" },
] as const satisfies readonly AppMode[];

export type AppModeEntry = (typeof APP_MODES)[number];
export type AppModeId = AppModeEntry["id"];

export const DEFAULT_MODE: AppModeId = CHAT_MODE_ID;
export const NOTES_MODE: AppModeId = NOTES_MODE_ID;

export function nextMode(current: AppModeId): AppModeId {
  const index = APP_MODES.findIndex((mode) => mode.id === current);
  return (APP_MODES[(index + 1) % APP_MODES.length] ?? APP_MODES[0]).id;
}
