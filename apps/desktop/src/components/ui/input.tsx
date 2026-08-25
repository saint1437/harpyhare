import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-line-strong bg-inset px-2.5 py-1 text-body transition-[color,box-shadow,border-color] outline-none selection:bg-accent selection:text-accent-on file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-body file:font-medium file:text-fg placeholder:text-fg-subtle disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid",
        "aria-invalid:border-danger aria-invalid:ring-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
