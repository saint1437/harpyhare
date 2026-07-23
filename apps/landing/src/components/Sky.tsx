import { cn } from "@/lib/cn";
import type { StarSpec } from "@/lib/stars";

type CloudVariant = "wide" | "puffy" | "small";

interface CloudSpec {
  box: [number, number];
  rect: { x: number; y: number; width: number; height: number; rx: number };
  circles: [number, number, number][];
}

const CLOUDS: Record<CloudVariant, CloudSpec> = {
  wide: {
    box: [100, 42],
    rect: { x: 14, y: 26, width: 66, height: 15, rx: 7.5 },
    circles: [
      [30, 24, 13],
      [52, 18, 16],
      [72, 25, 11],
    ],
  },
  puffy: {
    box: [80, 44],
    rect: { x: 10, y: 28, width: 58, height: 14, rx: 7 },
    circles: [
      [28, 24, 14],
      [50, 20, 15],
    ],
  },
  small: {
    box: [64, 36],
    rect: { x: 8, y: 22, width: 46, height: 12, rx: 6 },
    circles: [
      [22, 20, 11],
      [40, 17, 12],
    ],
  },
};

interface CloudProps {
  variant?: CloudVariant;
  width: number;
  drift?: number;
  className?: string;
}

export function Cloud({ variant = "wide", width, drift = 46, className }: CloudProps) {
  const {
    box: [w, h],
    rect,
    circles,
  } = CLOUDS[variant];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      style={{ width, height: (width * h) / w, animationDuration: `${drift}s` }}
      className={cn("cloud pointer-events-none absolute select-none", className)}
    >
      <g fill="var(--surface)">
        <rect {...rect} />
        {circles.map(([cx, cy, r], index) => (
          <circle key={index} cx={cx} cy={cy} r={r} />
        ))}
      </g>
    </svg>
  );
}

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
