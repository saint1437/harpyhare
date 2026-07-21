import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function SectionLabel({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("text-hint font-medium text-foreground/55", className)} {...props} />;
}
