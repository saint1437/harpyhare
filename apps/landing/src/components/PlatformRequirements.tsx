"use client";

import { usePlatform } from "@/hooks/usePlatform";
import { PLATFORM_REQUIREMENTS } from "@/lib/platform";

export function PlatformRequirements() {
  return <span>{PLATFORM_REQUIREMENTS[usePlatform()]}</span>;
}
