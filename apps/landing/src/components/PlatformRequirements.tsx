"use client";

import { PLATFORM_REQUIREMENTS } from "@/lib/platform";
import { PlatformText } from "./PlatformText";

export function PlatformRequirements() {
  return <PlatformText render={(platform) => PLATFORM_REQUIREMENTS[platform]} />;
}
