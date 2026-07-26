import { convertFileSrc } from "@tauri-apps/api/core";

const PREVIEW_SCHEME = "preview";
const PREVIEW_VERSION_PARAM = "v";

export function previewUrl(version: number): string {
  return `${convertFileSrc("", PREVIEW_SCHEME)}?${PREVIEW_VERSION_PARAM}=${version}`;
}
