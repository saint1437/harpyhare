export const ATTACHMENT_LIMIT = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // лимит Anthropic API на изображение

export const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export interface ImagePayload {
  media_type: string;
  data: string; // base64 без префикса dataURL
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

/** Линейный масштаб стороны, чтобы файл влез в MAX_IMAGE_BYTES (площадь ~ байтам). */
export function downscaleFactor(bytes: number): number {
  if (bytes <= MAX_IMAGE_BYTES) return 1;
  return Math.sqrt(MAX_IMAGE_BYTES / bytes) * 0.95;
}

/**
 * @param mediaType — тип РЕЗУЛЬТИРУЮЩИХ данных, не оригинального файла:
 * после canvas-даунскейла в JPEG передавай "image/jpeg", а не File.type.
 */
export function toImagePayload(dataUrl: string, mediaType: string): ImagePayload {
  const comma = dataUrl.indexOf(",");
  return { media_type: mediaType, data: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl };
}
