"use client";

import { createContext, use, type ReactNode } from "react";
import { demoRu } from "@/i18n/demo-ru";
import type { DemoCopy } from "@/i18n/demo-types";

const CopyContext = createContext<DemoCopy>(demoRu);

export function DemoCopyProvider({ copy, children }: { copy: DemoCopy; children: ReactNode }) {
  return <CopyContext value={copy}>{children}</CopyContext>;
}

export function useCopy(): DemoCopy {
  return use(CopyContext);
}
