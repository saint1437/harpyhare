export const ATTACHMENT_LIMIT = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const DOWNSCALE_SAFETY_MARGIN = 0.95;
const DATA_URL_BASE64_SEPARATOR = ",";
const DATA_URL_SCHEME = "data:";
const DATA_URL_BASE64_MARKER = ";base64";
const TRANSCRIPT_SEPARATOR = " ";
const ENDS_WITH_WHITESPACE = /\s$/;

export interface ImagePayload {
  media_type: string;
  data: string;
}

export interface Attachment {
  payload: ImagePayload;
  preview: string;
}

export function extractImageItems(items: ArrayLike<DataTransferItem>): File[] {
  const files: File[] = [];
  for (const it of Array.from(items)) {
    if (it.kind === "file" && SUPPORTED_IMAGE_TYPES.has(it.type)) {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

export function hasFileItems(items: ArrayLike<DataTransferItem>): boolean {
  return Array.from(items).some((it) => it.kind === "file");
}

export function acceptedNewAttachments(current: number, adding: number): number {
  return Math.max(0, Math.min(adding, ATTACHMENT_LIMIT - current));
}

export const NO_DOWNSCALE = 1;

export function downscaleFactor(bytes: number): number {
  if (bytes <= MAX_IMAGE_BYTES) return NO_DOWNSCALE;
  return Math.sqrt(MAX_IMAGE_BYTES / bytes) * DOWNSCALE_SAFETY_MARGIN;
}

export function appendTranscript(draft: string, transcript: string): string {
  if (draft.trim() === "") return transcript;
  if (ENDS_WITH_WHITESPACE.test(draft)) return draft + transcript;
  return draft + TRANSCRIPT_SEPARATOR + transcript;
}

const dataUrlByPayload = new WeakMap<ImagePayload, string>();

export function imageDataUrl(image: ImagePayload): string {
  const cached = dataUrlByPayload.get(image);
  if (cached !== undefined) return cached;
  const url = `${DATA_URL_SCHEME}${image.media_type}${DATA_URL_BASE64_MARKER}${DATA_URL_BASE64_SEPARATOR}${image.data}`;
  dataUrlByPayload.set(image, url);
  return url;
}

export function toImagePayload(dataUrl: string, resultMediaType: string): ImagePayload {
  const separatorIdx = dataUrl.indexOf(DATA_URL_BASE64_SEPARATOR);
  const base64 =
    separatorIdx >= 0 ? dataUrl.slice(separatorIdx + DATA_URL_BASE64_SEPARATOR.length) : dataUrl;
  return { media_type: resultMediaType, data: base64 };
}
