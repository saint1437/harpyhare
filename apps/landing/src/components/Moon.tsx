"use client";

import { useEffect, useRef } from "react";

const BEAM_SWEEP_DEG = 26;
const DUSK_START = 0.25;
const DUSK_END = 0.6;
const RAY_COUNT = 12;
const RAY_COLOR = "#e0bd67";

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function Moon() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.setProperty("--beam-angle", `${(progress * BEAM_SWEEP_DEG).toFixed(2)}deg`);
      const day = 1 - smoothstep(DUSK_START, DUSK_END, progress);
      document.documentElement.style.setProperty("--day", day.toFixed(3));
    };
    const request = () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request, { passive: true });
    return () => {
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="moon" aria-hidden>
      <span className="moon-mist" />
      <svg className="sun-rays" viewBox="-70 -70 140 140">
        {Array.from({ length: RAY_COUNT }, (_, index) => (
          <rect
            key={index}
            x="-3.1"
            y="-64"
            width="6.2"
            height="17"
            rx="3.1"
            transform={`rotate(${index * (360 / RAY_COUNT)})`}
            fill={RAY_COLOR}
          />
        ))}
      </svg>
      <img src="/hare/moon.png" alt="" className="moon-disc" />
      <span className="sun-disc" />
    </div>
  );
}
