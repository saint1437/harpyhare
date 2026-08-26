import { useEffect, useRef, useState } from "react";
import { setPreviewHtml } from "@/ipc/commands";
import { previewUrl } from "@/ipc/preview";

/**
 * Hands the HTML to Rust and returns the `preview://` URL to point an iframe at.
 *
 * The nonce is what makes the iframe reload: the custom protocol serves whatever
 * the backend holds, so the URL of a second preview would be identical to the
 * first and the webview would keep showing the cached document. It also drops a
 * late answer — the version check discards a resolve that lost the race to a
 * newer html.
 */
export function usePreviewSrc(html: string): string {
  const [src, setSrc] = useState("");
  const nonce = useRef(0);

  useEffect(() => {
    if (html === "") {
      setSrc("");
      return;
    }
    nonce.current += 1;
    const version = nonce.current;
    void setPreviewHtml(html).then(() => {
      if (version === nonce.current) setSrc(previewUrl(version));
    });
  }, [html]);

  return src;
}
