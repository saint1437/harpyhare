import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["hint", "caption", "body", "chat", "title"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * The raised surface card — the one recipe behind SettingGroup, the onboarding
 * cards, «Старт» rows and the HUD transcript panel. It was inlined ten times
 * across eight files; a change to the surface treatment (the top inner light,
 * the hairline) must land everywhere at once. Padding and layout stay local.
 */
export const SURFACE_CARD_CLASS = "rounded-lg bg-surface shadow-raise ring-1 ring-inset ring-line";
