import { cn } from "@/lib/cn";
import { Hare } from "./Hare";

interface BushProps {
  variant?: "back" | "front";
  width: number;
  className?: string;
}

export function Bush({ variant = "back", width, className }: BushProps) {
  return (
    <img
      src={variant === "back" ? "./hare/bush-back.png" : "./hare/bush-front.png"}
      alt=""
      aria-hidden
      style={{ width }}
      className={cn("pointer-events-none absolute bottom-0 select-none", className)}
    />
  );
}

export function BushWatcher({ className }: { className?: string }) {
  return (
    <div className={cn("absolute bottom-0 select-none", className)} aria-hidden>
      <Hare
        variant="front"
        height={68}
        idleMs={[9000, 18000]}
        className="bottom-3 left-1/2 -translate-x-1/2"
      />
      <img
        src="./hare/bush-front.png"
        alt=""
        className="pointer-events-none relative block w-[100px]"
      />
    </div>
  );
}
