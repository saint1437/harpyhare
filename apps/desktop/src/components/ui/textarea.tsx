import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-fixed min-h-16 w-full rounded-md border border-line-strong bg-inset px-2.5 py-1.5 text-body transition-[color,box-shadow,border-color] outline-none placeholder:text-fg-subtle focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
