import { useCallback, useState } from "react";
import {
  acceptedNewAttachments,
  ATTACHMENT_LIMIT,
  downscaleFactor,
  extractImageItems,
  toImagePayload,
  type ImagePayload,
} from "@/lib/composer";

export interface Attachment {
  payload: ImagePayload;
  preview: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

async function fileToAttachment(file: File): Promise<Attachment> {
  const factor = downscaleFactor(file.size);
  if (factor === 1) {
    const dataUrl = await readAsDataUrl(file);
    return { payload: toImagePayload(dataUrl, file.type), preview: dataUrl };
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * factor));
  canvas.height = Math.max(1, Math.round(bitmap.height * factor));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { payload: toImagePayload(dataUrl, "image/jpeg"), preview: dataUrl };
}

export interface AttachmentsApi {
  attachments: Attachment[];
  addFromPaste: (items: DataTransferItemList) => Promise<void>;
  remove: (index: number) => void;
  clear: () => void;
}

export function useAttachments(): AttachmentsApi {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const addFromPaste = useCallback(async (items: DataTransferItemList) => {
    const files = extractImageItems(items);
    if (files.length === 0) return;
    let current = 0;
    setAttachments((prev) => {
      current = prev.length;
      return prev;
    });
    const slots = acceptedNewAttachments(current, files.length);
    for (const file of files.slice(0, slots)) {
      try {
        const att = await fileToAttachment(file);
        setAttachments((prev) =>
          prev.length >= ATTACHMENT_LIMIT ? prev : [...prev, att],
        );
      } catch {
        /* битый кадр пропускаем */
      }
    }
  }, []);

  const remove = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setAttachments([]), []);

  return { attachments, addFromPaste, remove, clear };
}
