import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function SectionLabel({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "text-hint font-semibold tracking-wider text-fg-subtle/80 uppercase",
        className,
      )}
      {...props}
    />
  );
}
