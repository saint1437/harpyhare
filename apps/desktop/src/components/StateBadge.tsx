import {
  Check,
  CircleAlert,
  CircleDot,
  Loader,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Colour is never the only carrier.
 *
 * Every state in the app is a colour AND a glyph AND a word. That is not a
 * nicety: `success` and `danger` have to clear 3:1 against the same surfaces, so
 * they necessarily land at similar luminance and are indistinguishable to a
 * red-green colour-blind user at any luminance we could pick. The glyph is what
 * actually separates them — and it is also what survives
 * `prefers-reduced-motion`, which silences every animation in the app.
 */
export type StateTone = "success" | "danger" | "warning" | "listening" | "neutral";

interface ToneStyle {
  icon: LucideIcon;
  colour: string;
  /** The listening glyph is the only one that moves, and only while capturing. */
  breathes?: boolean;
}

const TONE: Record<StateTone, ToneStyle> = {
  success: { icon: Check, colour: "text-success" },
  danger: { icon: CircleAlert, colour: "text-danger" },
  warning: { icon: TriangleAlert, colour: "text-warning" },
  listening: { icon: CircleDot, colour: "text-listening", breathes: true },
  neutral: { icon: Loader, colour: "text-fg-subtle" },
};

export interface StateBadgeProps {
  tone: StateTone;
  label: string;
  /** Hide the word where the surrounding row already carries it. */
  labelHidden?: boolean;
  className?: string;
}

export function StateBadge({ tone, label, labelHidden = false, className }: StateBadgeProps) {
  const { icon: Icon, colour, breathes } = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-caption text-fg-subtle",
        className,
      )}
    >
      <span className={cn("relative grid size-3.5 shrink-0 place-items-center", colour)}>
        {breathes === true && (
          <span
            className="listening-breath absolute inset-0 rounded-full ring-2 ring-listening"
            aria-hidden
          />
        )}
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className={cn(labelHidden && "sr-only")}>{label}</span>
    </span>
  );
}
