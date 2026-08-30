import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-body font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-btn hover:bg-primary/90 active:bg-primary/80",
        destructive:
          "bg-destructive/75 text-destructive-foreground shadow-btn hover:bg-destructive/65 focus-visible:ring-destructive/40 active:bg-destructive/55",
        outline:
          "border border-input bg-input/20 hover:bg-input/35 focus-visible:border-ring active:bg-input/45",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "hover:bg-surface hover:text-foreground active:bg-surface-active",
      },
      size: {
        default: "h-8 px-3.5 has-[>svg]:px-2.5",
        xs: "h-6 gap-1 rounded-sm px-2 text-caption has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 rounded-md px-2.5 has-[>svg]:px-2",
        compact: "h-6.5 gap-1.5 rounded-md px-2 text-caption",
        lg: "h-9 rounded-md px-5 has-[>svg]:px-4",
        icon: "size-8",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-compact": "size-7",
        "icon-sm": "size-8",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
