import { cn } from "@/lib/cn";
import type { StarSpec } from "@/lib/stars";

const STAR_PATH =
  "M0 -10 C1.6 -3.2 3.2 -1.6 10 0 C3.2 1.6 1.6 3.2 0 10 C-1.6 3.2 -3.2 1.6 -10 0 C-3.2 -1.6 -1.6 -3.2 0 -10 Z";

export function StarField({ stars, className }: { stars: StarSpec[]; className?: string }) {
  return (
    <div className={cn("stars", className)} aria-hidden>
      {stars.map((star, index) => (
        <svg
          key={index}
          viewBox="-10 -10 20 20"
          className="star"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: star.size,
            height: star.size,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
          }}
        >
          <path d={STAR_PATH} fill="oklch(0.92 0.01 255)" />
        </svg>
      ))}
    </div>
  );
}
