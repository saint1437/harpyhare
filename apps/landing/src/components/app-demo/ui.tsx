/**
 * The mock's primitives, recipe for recipe from the app's own
 * (`apps/desktop/src/components/ui/*` and `src/features/settings/fields.tsx`).
 *
 * They are copied rather than approximated because the app's look is carried by
 * a handful of repeated strings — one button base, four variants, six sizes,
 * one focus outline — and a demo that re-invents them lands in the uncanny
 * valley: the right colours in the wrong shapes. Where a class differs from the
 * app's it is only the token PREFIX (`bg-surface` there, `bg-app-card` here);
 * the geometry, the states and the disabled behaviour are the same text.
 *
 * The one thing the app states globally and this file cannot: `svg.lucide {
 * stroke-width: 1.75 }`. That lives in `globals.css` under `.app-window`,
 * because it has to reach icons this module never renders.
 */
import { Check, ChevronDown, CircleAlert, CircleDot, Loader, TriangleAlert } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { StateTone } from "@/i18n/demo-types";
import { cn } from "@/lib/cn";

/** `SURFACE_CARD_CLASS` in `apps/desktop/src/lib/utils.ts`. */
export const SURFACE_CARD = "rounded-lg bg-app-card ring-1 ring-app-border ring-inset";

/**
 * The app draws focus as an OUTLINE, never a ring, and the reason is structural
 * rather than aesthetic: nearly every card here carries `overflow-hidden`, and
 * a ring is part of the box a parent clips. An outline is not.
 */
const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-app-focus focus-visible:outline-offset-2 focus-visible:outline-solid";

const BUTTON_BASE = cn(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-app-body font-medium whitespace-nowrap transition-colors select-none",
  FOCUS_RING,
  "disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
);

type ButtonVariant = "default" | "destructive" | "outline" | "ghost";
type ButtonSize = "default" | "xs" | "sm" | "compact" | "icon-xs" | "icon-compact";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  default:
    "bg-app-primary text-app-primary-fg hover:bg-app-primary-hover active:bg-app-primary-hover",
  destructive:
    "bg-app-destructive text-app-destructive-fg hover:bg-app-destructive/85 active:bg-app-destructive/75",
  outline:
    "border border-app-border-strong bg-app-code hover:bg-app-surface-active active:bg-app-surface-active",
  ghost: "hover:bg-app-card hover:text-app-fg active:bg-app-surface-active",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  default: "h-8 px-3.5 has-[>svg]:px-2.5",
  xs: "h-6 gap-1 rounded-sm px-2 text-app-caption has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
  sm: "h-7 gap-1.5 rounded-md px-2.5 has-[>svg]:px-2",
  compact: "h-6.5 gap-1.5 rounded-md px-2 text-app-caption",
  "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
  "icon-compact": "size-7",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

export function AppButton({
  variant = "default",
  size = "default",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * `IconButton` in the app: a ghost button pinned to one size, whose `title` is
 * also its accessible name. Every icon in the HUD header is one of these, which
 * is why it is worth a component rather than a repeated pair of props.
 */
export function AppIconButton({
  title,
  size = "icon-compact",
  className,
  children,
  ...props
}: Omit<ButtonProps, "variant"> & { title: string }) {
  return (
    <AppButton
      variant="ghost"
      size={size}
      title={title}
      aria-label={title}
      className={cn("rounded-md text-app-subtle hover:text-app-fg", className)}
      {...props}
    >
      {children}
    </AppButton>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 shrink-0 items-center justify-center gap-0.5 rounded-sm bg-app-card px-1.5 font-mono text-app-hint text-app-fg/90 ring-1 ring-app-border ring-inset">
      {children}
    </kbd>
  );
}

export function SectionLabel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "text-app-hint font-semibold tracking-wider text-app-subtle/80 uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The app's universal state atom, and the rule it exists to enforce: a state is
 * always COLOUR + GLYPH + WORD. Reduce it to a coloured dot and the only person
 * who can still read it is someone who can see the difference between an
 * oxblood and a cyan at 6px.
 */
const STATE_ICONS = {
  success: Check,
  danger: CircleAlert,
  warning: TriangleAlert,
  listening: CircleDot,
  neutral: Loader,
} as const;

const STATE_COLOURS: Record<StateTone, string> = {
  success: "text-app-success",
  danger: "text-app-destructive",
  warning: "text-app-warning",
  listening: "text-app-recording",
  neutral: "text-app-subtle",
};

export function StateBadge({
  tone,
  label,
  labelHidden = false,
}: {
  tone: StateTone;
  label: string;
  labelHidden?: boolean;
}) {
  const Icon = STATE_ICONS[tone];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-app-caption text-app-subtle">
      <span
        className={cn("relative grid size-3.5 shrink-0 place-items-center", STATE_COLOURS[tone])}
      >
        {tone === "listening" && (
          <span
            className="app-breath absolute inset-0 rounded-full ring-2 ring-app-recording"
            aria-hidden
          />
        )}
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className={cn(labelHidden && "sr-only")}>{label}</span>
    </span>
  );
}

/**
 * The capture meter: five bars, the app's exact heights and stagger. It is the
 * one element that has to stay legible over any wallpaper, which is why in the
 * app it sits on an opaque backing rather than on the translucent shell.
 */
const BAR_HEIGHTS_PX = [8, 14, 10, 17, 9];
const BAR_STAGGER_S = 0.12;

export function CaptureMeter({ animated, barClass }: { animated: boolean; barClass: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[2.5px]" aria-hidden>
      {BAR_HEIGHTS_PX.map((height, index) => (
        <span
          key={height.toString() + String(index)}
          className={cn("w-[2.5px] rounded-full", barClass, animated && "eq-bar")}
          style={{
            height: `${String(height)}px`,
            animationDelay: animated ? `${String(index * BAR_STAGGER_S)}s` : undefined,
          }}
        />
      ))}
    </span>
  );
}

export function SettingGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <header className="flex flex-col gap-0.5 px-1">
        <SectionLabel>{title}</SectionLabel>
        {description !== undefined && (
          <p className="text-app-caption text-app-subtle/90">{description}</p>
        )}
      </header>
      <div className={cn("divide-y divide-app-border overflow-hidden", SURFACE_CARD)}>
        {children}
      </div>
    </section>
  );
}

export function SettingRow({
  label,
  hint,
  disabled = false,
  children,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid min-h-9 grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 px-3 py-2 min-[640px]:grid-cols-[minmax(0,1fr)_14rem]",
        disabled && "opacity-50",
      )}
    >
      <div className="min-w-0">
        <span className="text-app-body text-app-fg">{label}</span>
        {hint !== undefined && <p className="mt-0.5 text-app-caption text-app-subtle">{hint}</p>}
      </div>
      <div className="flex min-w-0 items-center justify-end">{children}</div>
    </div>
  );
}

/** The app's second row shape: a full-width control under its own label. */
export function SettingBlock({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="min-w-0">
        <span className="text-app-body text-app-fg">{label}</span>
        {hint !== undefined && <p className="mt-0.5 text-app-caption text-app-subtle">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function AppSwitch({
  checked,
  ariaLabel,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
      className={cn(
        "inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent p-[2px] transition-colors disabled:pointer-events-none disabled:opacity-50",
        FOCUS_RING,
        checked
          ? "bg-app-primary hover:bg-app-primary-hover"
          : "bg-app-border-strong hover:bg-app-subtle",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block size-4 rounded-full transition-transform duration-150 ease-out",
          checked ? "translate-x-[calc(100%-2px)] bg-app-primary-fg" : "translate-x-0 bg-app-fg",
        )}
      />
    </button>
  );
}

/**
 * A real `<select>` under the app's trigger styling.
 *
 * The demo used to cycle through options on click, which reads as a toggle and
 * hides how many options there are — the recognition-language row has seven.
 * A native select also gets keyboard and screen-reader behaviour for free,
 * which matters here because the settings screen is most of the mock's surface.
 */
export function AppSelect({
  value,
  options,
  ariaLabel,
  disabled = false,
  onChange,
}: {
  value: string;
  options: readonly string[];
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative w-full min-w-0">
      <select
        value={value}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={cn(
          "h-7 w-full min-w-0 appearance-none rounded-md border border-app-border-strong bg-app-code py-1 pr-7 pl-2.5 text-app-caption text-app-fg transition-colors hover:bg-app-surface-active disabled:pointer-events-none disabled:opacity-50",
          FOCUS_RING,
        )}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-app-subtle opacity-60"
        aria-hidden
      />
    </div>
  );
}

export function AppSlider({
  value,
  min,
  max,
  step,
  ariaLabel,
  readout,
  disabled = false,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  ariaLabel: string;
  readout: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex w-full items-center gap-2.5">
      <input
        type="range"
        className={cn("app-range min-w-0 flex-1 disabled:opacity-50", FOCUS_RING)}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      />
      <span
        className={cn(
          "w-12 shrink-0 text-right font-mono text-app-caption text-app-subtle tabular-nums",
          disabled && "opacity-50",
        )}
      >
        {readout}
      </span>
    </div>
  );
}
