"use client";

import { createContext, use, type ReactNode } from "react";
import type { DemoCopy } from "@/i18n/demo-types";

/**
 * `null` and not `demoRu`: a default value here is a hard dependency on the
 * Russian demo dictionary, so a chunk of 40 KB (13.5 KB gzip) shipped to every
 * visitor — `/en` included — for a value no consumer can ever read, since
 * `AppDemo` is the only mount point and it always supplies the provider.
 */
const CopyContext = createContext<DemoCopy | null>(null);

export function DemoCopyProvider({ copy, children }: { copy: DemoCopy; children: ReactNode }) {
  return <CopyContext value={copy}>{children}</CopyContext>;
}

export function useCopy(): DemoCopy {
  const copy = use(CopyContext);
  if (copy === null) throw new Error("useCopy() outside <DemoCopyProvider>");
  return copy;
}
