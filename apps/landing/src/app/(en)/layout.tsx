import type { ReactNode } from "react";
import { RootHtml } from "@/components/RootHtml";
import { FONT_PRELOADS, FONT_VARIABLES } from "@/lib/fonts-latin";
import "../globals.css";

export { viewport } from "@/lib/viewport";

export default function EnRootLayout({ children }: { children: ReactNode }) {
  return (
    <RootHtml locale="en" fontVariables={FONT_VARIABLES} fontPreloads={FONT_PRELOADS}>
      {children}
    </RootHtml>
  );
}
