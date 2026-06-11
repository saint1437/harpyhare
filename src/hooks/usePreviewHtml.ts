import { useEffect, useState } from "react";
import { getPreviewHtml } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";

/** HTML текущего превью: начальная загрузка + живые замены по preview-html. */
export function usePreviewHtml(): string {
  const [html, setHtml] = useState("");

  useEffect(() => {
    let live = true;
    void getPreviewHtml().then((h) => {
      if (live) setHtml(h);
    });
    const off = onEvent("preview-html", setHtml);
    return () => {
      live = false;
      off();
    };
  }, []);

  return html;
}
