"use client";

import { useEffect, useRef } from "react";

const BEAM_SWEEP_DEG = 26;

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
      <img src="/hare/moon.png" alt="" className="moon-disc" />
    </div>
  );
}
