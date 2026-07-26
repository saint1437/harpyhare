"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type HareVariant = "side" | "front";
type HareFrame = "sit" | "front" | "frontEar" | "gather" | "leap";

const FRAME_SRC: Record<HareFrame, string> = {
  sit: "/hare/hare-sit.png",
  front: "/hare/hare-front.png",
  frontEar: "/hare/hare-front-ear.png",
  gather: "/hare/hare-gather.png",
  leap: "/hare/hare-leap.png",
};

const REST_FRAME: Record<HareVariant, HareFrame> = { side: "sit", front: "front" };
const FRAMES: Record<HareVariant, HareFrame[]> = {
  side: ["sit", "front", "frontEar", "gather", "leap"],
  front: ["front", "frontEar"],
};

const FRAME_HEIGHT_RATIO: Partial<Record<HareFrame, number>> = {
  gather: 0.81,
  leap: 0.73,
};

const WIDTH_RATIO = 0.72;
const HOP_LEN = 46;
const HOP_MS = 270;
const HOP_PUSH_MS = 55;
const HOP_AIR_MS = HOP_MS - 2 * HOP_PUSH_MS;
const LOOK_AFTER_FLEE_CHANCE = 0.4;
const DEFAULT_IDLE_MS: [number, number] = [8000, 16000];
const DEFAULT_RANGE: [number, number] = [-90, 90];

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface HareProps {
  variant?: HareVariant;
  height: number;
  idleMs?: [number, number];
  range?: [number, number];
  className?: string;
}

export function Hare({
  variant = "side",
  height,
  idleMs = DEFAULT_IDLE_MS,
  range = DEFAULT_RANGE,
  className,
}: HareProps) {
  const restFrame = REST_FRAME[variant];
  const [frame, setFrame] = useState<HareFrame>(restFrame);
  const [x, setX] = useState(0);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [hop, setHop] = useState<number | null>(null);
  const xRef = useRef(0);
  const busy = useRef(false);
  const alive = useRef(true);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      pending.forEach((id) => {
        clearTimeout(id);
      });
    };
  }, []);

  const delay = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      timers.current.push(window.setTimeout(resolve, ms));
    });
  }, []);

  const show = useCallback((next: HareFrame) => {
    if (alive.current) setFrame(next);
  }, []);

  const earFlicks = useCallback(
    async (count: number) => {
      for (let i = 0; i < count; i += 1) {
        show("frontEar");
        await delay(200);
        show("front");
        await delay(180);
      }
    },
    [delay, show],
  );

  const twitchSeq = useCallback(async () => {
    if (variant === "side") {
      show("front");
      await delay(260);
    }
    await earFlicks(2);
    if (variant === "side") await delay(320);
    show(restFrame);
  }, [variant, restFrame, show, delay, earFlicks]);

  const lookSeq = useCallback(async () => {
    show("front");
    await delay(800 + Math.random() * 600);
    await earFlicks(1);
    await delay(1200 + Math.random() * 1600);
    show(restFrame);
  }, [restFrame, show, delay, earFlicks]);

  const hopSeq = useCallback(
    async (direction: 1 | -1, hops: number) => {
      const [minX, maxX] = range;
      const clamp = (value: number) => Math.min(maxX, Math.max(minX, value));
      let target = clamp(xRef.current + direction * hops * HOP_LEN);
      if (Math.abs(target - xRef.current) < HOP_LEN * 0.7) {
        target = clamp(xRef.current - direction * hops * HOP_LEN);
      }
      const dist = target - xRef.current;
      if (Math.abs(dist) < HOP_LEN * 0.7) return;
      const count = Math.max(1, Math.round(Math.abs(dist) / HOP_LEN));
      const isAlive = () => alive.current;
      if (!isAlive()) return;
      setFacing(dist < 0 ? 1 : -1);
      setHop(count);
      setX(target);
      xRef.current = target;
      for (let i = 0; i < count; i += 1) {
        show("gather");
        await delay(HOP_PUSH_MS);
        show("leap");
        await delay(HOP_AIR_MS);
        show("gather");
        await delay(HOP_PUSH_MS);
      }
      await delay(40);
      if (isAlive()) {
        setHop(null);
        setFrame(restFrame);
      }
    },
    [range, restFrame, delay, show],
  );

  const run = useCallback(async (seq: () => Promise<void>) => {
    if (busy.current || !alive.current) return;
    busy.current = true;
    try {
      await seq();
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (reducedMotion()) return undefined;
    const [min, max] = idleMs;
    let id: number;
    const schedule = () => {
      id = window.setTimeout(
        () => {
          const roll = Math.random();
          if (variant === "front" || roll < 0.4) {
            void run(twitchSeq);
          } else if (roll < 0.65) {
            void run(lookSeq);
          } else {
            const direction: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
            void run(() => hopSeq(direction, 1 + Math.round(Math.random())));
          }
          schedule();
        },
        min + Math.random() * (max - min),
      );
    };
    schedule();
    return () => {
      clearTimeout(id);
    };
  }, [variant, idleMs, run, twitchSeq, lookSeq, hopSeq]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLSpanElement>) => {
      if (variant === "front" || reducedMotion()) {
        void run(twitchSeq);
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const clickedLeftHalf = event.clientX < rect.left + rect.width / 2;
      const direction: 1 | -1 = clickedLeftHalf ? 1 : -1;
      void run(async () => {
        await hopSeq(direction, 2 + Math.round(Math.random()));
        if (Math.random() < LOOK_AFTER_FLEE_CHANCE) {
          await delay(250);
          await lookSeq();
        }
      });
    },
    [variant, run, twitchSeq, hopSeq, lookSeq, delay],
  );

  const frameHeight = (poseFrame: HareFrame) => {
    return Math.round(height * (FRAME_HEIGHT_RATIO[poseFrame] ?? 1));
  };

  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute bottom-0 block select-none", className)}
      style={{ height, width: Math.round(height * WIDTH_RATIO) }}
    >
      <span
        onClick={handleClick}
        className="pointer-events-auto absolute inset-0 block cursor-pointer"
        style={
          {
            transform: `translateX(${x}px)`,
            transition: hop ? `transform ${hop * HOP_MS}ms linear` : undefined,
            "--hop-lift": `${-Math.max(10, Math.round(height * 0.28))}px`,
          } as React.CSSProperties
        }
      >
        <span
          className="absolute inset-0 block"
          style={{
            animation: hop ? `hare-bounce ${HOP_MS}ms ease-in-out ${hop}` : undefined,
          }}
        >
          <span className="absolute inset-0 block" style={{ transform: `scaleX(${facing})` }}>
            {FRAMES[variant].map((poseFrame) => (
              <img
                key={poseFrame}
                src={FRAME_SRC[poseFrame]}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                style={{ height: frameHeight(poseFrame) }}
                className={cn(
                  "absolute bottom-0 left-1/2 max-w-none -translate-x-1/2",
                  frame === poseFrame ? "visible" : "invisible",
                )}
              />
            ))}
          </span>
        </span>
      </span>
    </span>
  );
}
