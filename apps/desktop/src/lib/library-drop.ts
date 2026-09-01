import { ROOT_FOLDER_ID } from "./context-library";

const DROP_FOLDER_ATTR = "data-drop-folder";

export function dropFolderProps(folderId: string): Record<string, string> {
  return { [DROP_FOLDER_ATTR]: folderId };
}

export function dropTargetAt(x: number, y: number): string | null {
  const host = document.elementFromPoint(x, y)?.closest(`[${DROP_FOLDER_ATTR}]`);
  return host ? (host.getAttribute(DROP_FOLDER_ATTR) ?? ROOT_FOLDER_ID) : null;
}
