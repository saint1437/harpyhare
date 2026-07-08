import { cn } from "@/lib/cn";

type CloudVariant = "wide" | "puffy" | "small";

const CLOUDS: Record<CloudVariant, { viewBox: string; box: [number, number] }> = {
  wide: { viewBox: "0 0 100 42", box: [100, 42] },
  puffy: { viewBox: "0 0 80 44", box: [80, 44] },
  small: { viewBox: "0 0 64 36", box: [64, 36] },
};

function CloudShape({ variant }: { variant: CloudVariant }) {
  if (variant === "wide") {
    return (
      <g fill="var(--surface)">
        <rect x="14" y="26" width="66" height="15" rx="7.5" />
        <circle cx="30" cy="24" r="13" />
        <circle cx="52" cy="18" r="16" />
        <circle cx="72" cy="25" r="11" />
      </g>
    );
  }
  if (variant === "puffy") {
    return (
      <g fill="var(--surface)">
        <rect x="10" y="28" width="58" height="14" rx="7" />
        <circle cx="28" cy="24" r="14" />
        <circle cx="50" cy="20" r="15" />
      </g>
    );
  }
  return (
    <g fill="var(--surface)">
      <rect x="8" y="22" width="46" height="12" rx="6" />
      <circle cx="22" cy="20" r="11" />
      <circle cx="40" cy="17" r="12" />
    </g>
  );
}

interface CloudProps {
  variant?: CloudVariant;
  width: number;
  drift?: number;
  className?: string;
}

export function Cloud({ variant = "wide", width, drift = 46, className }: CloudProps) {
  const [w, h] = CLOUDS[variant].box;
  return (
    <svg
      viewBox={CLOUDS[variant].viewBox}
      aria-hidden
      style={{ width, height: (width * h) / w, animationDuration: `${drift}s` }}
      className={cn("cloud pointer-events-none absolute select-none", className)}
    >
      <CloudShape variant={variant} />
    </svg>
  );
}

const STAR_PATH =
  "M0 -10 C1.6 -3.2 3.2 -1.6 10 0 C3.2 1.6 1.6 3.2 0 10 C-1.6 3.2 -3.2 1.6 -10 0 C-3.2 -1.6 -1.6 -3.2 0 -10 Z";

export interface StarSpec {
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
}

export const FEATURES_STARS: StarSpec[] = [
  { left: 8, top: 10, size: 12, delay: 0, duration: 3.6 },
  { left: 22, top: 28, size: 8, delay: 1.4, duration: 4.4 },
  { left: 37, top: 7, size: 10, delay: 0.7, duration: 3.1 },
  { left: 55, top: 20, size: 7, delay: 2.2, duration: 4.8 },
  { left: 69, top: 9, size: 13, delay: 1.1, duration: 3.9 },
  { left: 86, top: 24, size: 9, delay: 0.4, duration: 3.4 },
  { left: 14, top: 56, size: 7, delay: 2.8, duration: 4.2 },
  { left: 93, top: 58, size: 11, delay: 1.8, duration: 3.2 },
  { left: 48, top: 72, size: 8, delay: 0.9, duration: 4.6 },
  { left: 77, top: 80, size: 7, delay: 2.5, duration: 3.7 },
];

export const CTA_STARS: StarSpec[] = [
  { left: 11, top: 14, size: 10, delay: 0.5, duration: 3.8 },
  { left: 27, top: 34, size: 7, delay: 1.9, duration: 3.2 },
  { left: 42, top: 10, size: 12, delay: 0, duration: 4.3 },
  { left: 61, top: 26, size: 8, delay: 2.4, duration: 3.5 },
  { left: 78, top: 12, size: 10, delay: 1.2, duration: 4 },
  { left: 91, top: 38, size: 7, delay: 0.8, duration: 3.3 },
  { left: 7, top: 62, size: 8, delay: 2.1, duration: 4.5 },
  { left: 88, top: 70, size: 9, delay: 1.5, duration: 3.6 },
];

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
