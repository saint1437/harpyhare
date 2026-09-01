import type { ReactNode } from "react";
import { openExternal } from "@/ipc/commands";

const EXTERNAL_HTTP_URL = /^https?:\/\//;

export function ExternalLinkAnchor({ href, children }: { href?: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href && EXTERNAL_HTTP_URL.test(href)) void openExternal(href);
      }}
      className="text-foreground underline decoration-foreground/40 underline-offset-2 hover:decoration-foreground"
    >
      {children}
    </a>
  );
}
