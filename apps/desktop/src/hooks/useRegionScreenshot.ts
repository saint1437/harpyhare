import { useCallback, useEffect, useRef } from "react";
import { captureRegionScreenshot } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import { notifyAppError } from "@/lib/notifications";

export interface RegionScreenshotApi {
  capture: () => void;
}

export function useRegionScreenshot(
  onImage: (dataUrl: string, mediaType: string) => void,
): RegionScreenshotApi {
  const onImageRef = useRef(onImage);
  useEffect(() => {
    onImageRef.current = onImage;
  }, [onImage]);

  useEffect(
    () =>
      onEvent("screenshot-ready", (p) => {
        onImageRef.current(`data:${p.mediaType};base64,${p.dataBase64}`, p.mediaType);
      }),
    [],
  );

  useEffect(() => onEvent("screenshot-error", notifyAppError), []);

  const capture = useCallback(() => {
    void captureRegionScreenshot();
  }, []);

  return { capture };
}
