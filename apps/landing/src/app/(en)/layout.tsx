import type { ReactNode } from "react";
import { RootHtml } from "@/components/RootHtml";
import "../globals.css";

export { viewport } from "@/lib/viewport";

export default function EnRootLayout({ children }: { children: ReactNode }) {
  return <RootHtml locale="en">{children}</RootHtml>;
}
