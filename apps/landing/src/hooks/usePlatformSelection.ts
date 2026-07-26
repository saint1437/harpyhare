import { useState } from "react";
import { detectPlatform, type Platform } from "@/lib/platform";

export interface PlatformSelection {
  platform: Platform;
  onSelectPlatform: (platform: Platform) => void;
}

function currentUserAgent(): string {
  return navigator.userAgentData?.platform ?? navigator.userAgent;
}

export function usePlatformSelection(): PlatformSelection {
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform(currentUserAgent()));
  return { platform, onSelectPlatform: setPlatform };
}
