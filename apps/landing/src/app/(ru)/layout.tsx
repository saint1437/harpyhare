import type { ReactNode } from "react";
import { RootHtml } from "@/components/RootHtml";
import "../globals.css";

export { viewport } from "@/lib/viewport";

export default function RuRootLayout({ children }: { children: ReactNode }) {
  return <RootHtml locale="ru">{children}</RootHtml>;
}
