import { useCallback, useEffect } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import { captureRegionScreenshot } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import { notifyAppError } from "@/lib/notifications";

export interface RegionScreenshotApi {
  capture: () => void;
}

/**
 * `screenshot-ready` hands over a REFERENCE into the chat-image store, not the
 * picture: the backend has already written the shot, and the composer resolves
 * the id through `load_chat_images` like it does for any image restored from
 * disk. The hook used to glue a data URL out of the event's base64, which was
 * the first of the copies that path made of a multi-megabyte buffer.
 */
export function useRegionScreenshot(
  onImage: (id: string, mediaType: string) => void,
): RegionScreenshotApi {
  const onImageRef = useLatestRef(onImage);

  useEffect(
    () =>
      onEvent("screenshot-ready", (p) => {
        onImageRef.current(p.id, p.mediaType);
      }),
    [onImageRef],
  );

  useEffect(() => onEvent("screenshot-error", notifyAppError), []);

  const capture = useCallback(() => {
    void captureRegionScreenshot();
  }, []);

  return { capture };
}
