import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IconButtonProps = ComponentProps<typeof Button> & { title: string };

export function IconButton({ title, className, ...props }: IconButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-compact"
      title={title}
      // Defaulted, not forced: the spread below lets a caller override it where
      // the visible tooltip and the announced name must differ.
      aria-label={title}
      className={cn("rounded-md text-fg-subtle hover:text-fg", className)}
      {...props}
    />
  );
}
