import type { ChatMessage } from "./chats";
import { imageDataUrl, toImagePayload, type ImagePayload } from "./composer";

const PNG_MEDIA_TYPE = "image/png";
const IMAGE_LOAD_FAILED = "Не удалось прочитать картинку сообщения";
const CANVAS_UNAVAILABLE = "Холст для перекодирования картинки недоступен";

export function messageCopyText(message: ChatMessage): string {
  return message.text.trim();
}

export function messageCopyImage(message: ChatMessage): ImagePayload | null {
  if (messageCopyText(message) !== "") return null;
  return message.images[0] ?? null;
}

export function isMessageCopyable(message: ChatMessage): boolean {
  return messageCopyText(message) !== "" || message.images.length > 0;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error(IMAGE_LOAD_FAILED));
    };
    img.src = src;
  });
}

export async function imagePngBase64(image: ImagePayload): Promise<string> {
  if (image.media_type === PNG_MEDIA_TYPE) return image.data;
  const loaded = await loadImage(imageDataUrl(image));
  const canvas = document.createElement("canvas");
  canvas.width = loaded.naturalWidth;
  canvas.height = loaded.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(CANVAS_UNAVAILABLE);
  context.drawImage(loaded, 0, 0);
  return toImagePayload(canvas.toDataURL(PNG_MEDIA_TYPE), PNG_MEDIA_TYPE).data;
}
