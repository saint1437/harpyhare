import { loadChatImages, saveChatImage } from "@/ipc/commands";
import { NOT_PERSISTED_IMAGE_ID } from "@/lib/chats";
import {
  acceptedNewAttachments,
  downscaleFactor,
  DOWNSCALE_MEDIA_TYPE,
  downscaleToJpegDataUrl,
  extractImageItems,
  imageDataUrl,
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
  // The decode, the canvas downscale and the `save_chat_image` round trip are
  // independent per file, so a paste of five costs the slowest one rather than
  // the sum — a serial loop froze the composer for the whole run. `Promise.all`
  // settles in the order the user dropped them, and the per-file `null` keeps
  // one unreadable image from taking the rest with it.
  const attachments = await Promise.all(
    files.slice(0, slots).map((file) => fileToAttachmentOrNull(file)),
  );
  for (const attachment of attachments) {
    if (attachment) appendDraftAttachment(chatId, attachment);
  }
}

/**
 * The bytes behind a reference, or nothing. `load_chat_images` skips an id it
 * cannot resolve rather than failing, so an empty answer is the ordinary "no
 * file behind that id"; the catch is for the transport underneath it.
 */
async function storedBase64(id: string): Promise<string | undefined> {
  try {
    return (await loadChatImages([id]))[0]?.dataBase64;
  } catch {
    return undefined;
  }
}

/**
 * The screenshot path — the only caller that starts from an id rather than from
 * bytes, because the backend has already written the shot into the image store
 * (`screenshot::deliver`) and `screenshot-ready` carries the reference.
 *
 * **The bytes come back the way a restored chat's do**, through
 * `load_chat_images`, instead of riding the event as base64 only to be decoded
 * into a `File`, re-encoded by a `FileReader` and shipped back to
 * `save_chat_image` — the store they had just come out of. That round trip was
 * three base64 conversions and a dozen live copies of a multi-megabyte buffer.
 *
 * The lifecycle is the paste/drop path's, unchanged: the id is assigned before
 * the attachment enters the draft, so a draft holding a screenshot survives a
 * restart, and a shot the user throws away is collected by the single
 * `prune_chat_images` that runs once per load. One case is new — a shot taken
 * with the composer already full reaches the store before the draft refuses it,
 * so its file is unreferenced from birth — and it is the same prune that takes
 * it.
 */
export async function addDraftStoredImage(
  chatId: string,
  id: string,
  mediaType: string,
): Promise<void> {
  if (acceptedNewAttachments(draftAttachmentCount(chatId), 1) < 1) return;
  const data = await storedBase64(id);
  // Without the file there are no bytes at all, and the request needs them as
  // much as the thumbnail does — there is nothing to degrade to.
  if (data === undefined) return;
  const payload: ImagePayload = { media_type: mediaType, data };
  appendDraftAttachment(chatId, { id, payload, preview: imageDataUrl(payload) });
}
