import { useCallback, useState } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";

export interface PreviewPanelState {
  previewHtml: string;
  previewOpen: boolean;
  openPreview: (code: string) => void;
  togglePreview: (code: string) => void;
  closePreview: () => void;
}

/**
 * The right-hand HTML column. `togglePreview` is what the chip in a message
 * calls: pressing the chip of the block already on screen closes the panel,
 * pressing another block's chip swaps the content instead of closing it.
 * The current pair is read through a ref so the callbacks stay stable — they
 * go into props of a tree that re-renders on every frame of the stream.
 */
export function usePreviewPanel(): PreviewPanelState {
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const currentRef = useLatestRef({ html: previewHtml, open: previewOpen });

  const openPreview = useCallback((code: string) => {
    setPreviewHtml(code);
    setPreviewOpen(true);
  }, []);

  const togglePreview = useCallback(
    (code: string) => {
      if (currentRef.current.open && currentRef.current.html === code) {
        setPreviewOpen(false);
      } else {
        setPreviewHtml(code);
        setPreviewOpen(true);
      }
    },
    [currentRef],
  );

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
  }, []);

  return { previewHtml, previewOpen, openPreview, togglePreview, closePreview };
}
