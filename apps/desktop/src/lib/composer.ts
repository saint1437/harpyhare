import { getDict } from "@/i18n";
export const ATTACHMENT_LIMIT = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const DOWNSCALE_MEDIA_TYPE = "image/jpeg";

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const DOWNSCALE_SAFETY_MARGIN = 0.95;
const DATA_URL_BASE64_SEPARATOR = ",";
const DATA_URL_SCHEME = "data:";
const DATA_URL_BASE64_MARKER = ";base64";
const TRANSCRIPT_SEPARATOR = " ";
const DOWNSCALE_JPEG_QUALITY = 0.85;
const MIN_CANVAS_SIDE_PX = 1;

const ENDS_WITH_WHITESPACE = /\s$/;

export interface ImagePayload {
  media_type: string;
  data: string;
}

export interface Attachment {
  id: string;
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

export function acceptedNewAttachments(current: number, adding: number): number {
  return Math.max(0, Math.min(adding, ATTACHMENT_LIMIT - current));
}

export const NO_DOWNSCALE = 1;

export function downscaleFactor(bytes: number): number {
  if (bytes <= MAX_IMAGE_BYTES) return NO_DOWNSCALE;
  return Math.sqrt(MAX_IMAGE_BYTES / bytes) * DOWNSCALE_SAFETY_MARGIN;
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      resolve(fr.result as string);
    };
    fr.onerror = () => {
      reject(new Error(fr.error?.message ?? getDict().common.image.fileReadFailed));
    };
    fr.readAsDataURL(file);
  });
}

function scaledSidePx(sidePx: number, factor: number): number {
  return Math.max(MIN_CANVAS_SIDE_PX, Math.round(sidePx * factor));
}

export async function downscaleToJpegDataUrl(file: File, factor: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = scaledSidePx(bitmap.width, factor);
  canvas.height = scaledSidePx(bitmap.height, factor);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(getDict().common.image.canvasUnavailable);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL(DOWNSCALE_MEDIA_TYPE, DOWNSCALE_JPEG_QUALITY);
}

export function appendTranscript(draft: string, transcript: string): string {
  if (draft.trim() === "") return transcript;
  if (ENDS_WITH_WHITESPACE.test(draft)) return draft + transcript;
  return draft + TRANSCRIPT_SEPARATOR + transcript;
}

export function imageDataUrl(image: ImagePayload): string {
  return `${DATA_URL_SCHEME}${image.media_type}${DATA_URL_BASE64_MARKER}${DATA_URL_BASE64_SEPARATOR}${image.data}`;
}

export function toImagePayload(dataUrl: string, resultMediaType: string): ImagePayload {
  const separatorIdx = dataUrl.indexOf(DATA_URL_BASE64_SEPARATOR);
  const base64 =
    separatorIdx >= 0 ? dataUrl.slice(separatorIdx + DATA_URL_BASE64_SEPARATOR.length) : dataUrl;
  return { media_type: resultMediaType, data: base64 };
}
