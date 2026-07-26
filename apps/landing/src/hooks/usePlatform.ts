"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PLATFORM, detectPlatform, type Platform } from "@/lib/platform";

function currentUserAgent(): string {
  return navigator.userAgentData?.platform ?? navigator.userAgent;
}

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(DEFAULT_PLATFORM);

  useEffect(() => {
    setPlatform(detectPlatform(currentUserAgent()));
  }, []);

  return platform;
}
