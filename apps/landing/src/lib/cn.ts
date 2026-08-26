import { extendTailwindMerge } from "tailwind-merge";

/**
 * The same name as the desktop app's `cn`, and now the same semantics.
 *
 * It used to be `filter().join()`, which is not a merge at all: `cn("p-2", "p-4")`
 * emitted both classes and the winner was decided by their order inside the
 * generated stylesheet, not by the call. Every component here takes a `className`
 * override on top of a base recipe, so that difference was load-bearing —
 * `<AppIconButton className="rounded-md" />` sat on a base `rounded-full` and lost.
 *
 * The custom `text-app-*` sizes have to be declared explicitly: tailwind-merge only
 * knows its own scale, so it would file `text-app-chat` under text-colour and drop
 * it the moment a `text-app-fg/80` showed up in the same call.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["app-hint", "app-caption", "app-body", "app-chat", "app-title"] }],
    },
  },
});

export function cn(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
