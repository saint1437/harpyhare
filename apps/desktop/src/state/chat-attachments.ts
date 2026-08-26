import { saveChatImage } from "@/ipc/commands";
import { NOT_PERSISTED_IMAGE_ID } from "@/lib/chats";
import {
  acceptedNewAttachments,
  dataUrlToFile,
  downscaleFactor,
  DOWNSCALE_MEDIA_TYPE,
  downscaleToJpegDataUrl,
  extractImageItems,
  NO_DOWNSCALE,
  readAsDataUrl,
  toImagePayload,
  type Attachment,
  type ImagePayload,
} from "@/lib/composer";
import { appendDraftAttachment, draftAttachmentCount } from "./chats";

/**
 * The one write path into a draft that has to go through the disk, which is
 * exactly why it is not in `state/chats`: the store itself knows nothing about
 * IPC, and an attachment is not fully real until its bytes have a file.
 *
 * **The id is assigned once, here** — the shared entry point for pasting,
 * dropping and screenshots — rather than at send time, which is why a draft
 * with an attachment survives a restart for free.
 *
 * A failed write costs the id and nothing else: the attachment stays in the
 * session (`NOT_PERSISTED_IMAGE_ID`), the request still carries the bytes, and
 * `serializeChats` filters the reference out. Degrading rather than derailing
 * the send is the standard reaction to a storage failure here.
 */
async function storedId(payload: ImagePayload): Promise<string> {
  try {
    return await saveChatImage(payload.media_type, payload.data);
  } catch {
    return NOT_PERSISTED_IMAGE_ID;
  }
}

async function attachmentOf(dataUrl: string, mediaType: string): Promise<Attachment> {
  const payload = toImagePayload(dataUrl, mediaType);
  return { id: await storedId(payload), payload, preview: dataUrl };
}

async function fileToAttachment(file: File): Promise<Attachment> {
  const factor = downscaleFactor(file.size);
  if (factor === NO_DOWNSCALE) {
    return attachmentOf(await readAsDataUrl(file), file.type);
  }
  return attachmentOf(await downscaleToJpegDataUrl(file, factor), DOWNSCALE_MEDIA_TYPE);
}

async function fileToAttachmentOrNull(file: File): Promise<Attachment | null> {
  try {
    return await fileToAttachment(file);
  } catch {
    return null;
  }
}

export async function addDraftAttachments(
  chatId: string,
  items: DataTransferItemList,
): Promise<void> {
  const files = extractImageItems(items);
  if (files.length === 0) return;
  const slots = acceptedNewAttachments(draftAttachmentCount(chatId), files.length);
  for (const file of files.slice(0, slots)) {
    const attachment = await fileToAttachmentOrNull(file);
    if (attachment) appendDraftAttachment(chatId, attachment);
  }
}

export async function addDraftImage(
  chatId: string,
  dataUrl: string,
  mediaType: string,
): Promise<void> {
  if (acceptedNewAttachments(draftAttachmentCount(chatId), 1) < 1) return;
  const attachment = await fileToAttachmentOrNull(dataUrlToFile(dataUrl, mediaType));
  if (attachment) appendDraftAttachment(chatId, attachment);
}
