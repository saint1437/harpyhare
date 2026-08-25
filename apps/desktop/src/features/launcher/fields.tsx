import { useId, type ReactNode } from "react";
import { SectionLabel } from "@/components/SectionLabel";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

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
          <p className="text-caption text-fg-subtle/90">{description}</p>
        )}
      </header>
      <div className="divide-y divide-line overflow-hidden rounded-lg bg-surface shadow-raise ring-1 ring-inset ring-line">
        {children}
      </div>
    </section>
  );
}

/**
 * `htmlFor` was a prop no caller ever passed, so every visible label in every
 * settings row was a floating text node: clicking it did nothing and nothing tied
 * it to its control. The id is generated here instead of asked for, and handed
 * back through `controlId` so the row cannot be wired up half-way.
 *
 * Below 640px the fixed 14rem control column stops fitting beside the label, so
 * the row stacks. The column itself is not negotiable above that: it is what
 * lines the controls of neighbouring screens up on one vertical.
 */
export function SettingRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode | ((controlId: string) => ReactNode);
}) {
  const generated = useId();
  const controlId = htmlFor ?? generated;
  return (
    <div className="grid min-h-9 grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 px-3 py-2 min-[640px]:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="min-w-0">
        <Label htmlFor={controlId} className="text-body font-normal text-fg">
          {label}
        </Label>
        {hint !== undefined && <p className="mt-0.5 text-caption text-fg-subtle">{hint}</p>}
      </div>
      <div className="flex min-w-0 items-center justify-end">
        {typeof children === "function" ? children(controlId) : children}
      </div>
    </div>
  );
}

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
        <span className="text-body text-fg">{label}</span>
        {hint !== undefined && <p className="mt-0.5 text-caption text-fg-subtle">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function SettingSelect({
  value,
  ariaLabel,
  disabled,
  onValueChange,
  children,
}: {
  value: string;
  ariaLabel: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <Select value={value} disabled={disabled} onValueChange={onValueChange}>
      <SelectTrigger size="sm" aria-label={ariaLabel} className="w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">{children}</SelectContent>
    </Select>
  );
}

export function SettingSwitch({
  checked,
  ariaLabel,
  id,
  onCheckedChange,
}: {
  checked: boolean;
  ariaLabel: string;
  id?: string;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <Switch id={id} checked={checked} aria-label={ariaLabel} onCheckedChange={onCheckedChange} />
  );
}

export function SettingSlider({
  value,
  min,
  max,
  step,
  ariaLabel,
  readout,
  disabled,
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
      <Slider
        className="min-w-0 flex-1"
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        aria-label={ariaLabel}
        onValueChange={([next]) => {
          if (next === undefined) return;
          onChange(next);
        }}
      />
      <span
        className={cn(
          "w-12 shrink-0 text-right font-mono text-caption text-fg-subtle tabular-nums",
          disabled && "opacity-50",
        )}
      >
        {readout}
      </span>
    </div>
  );
}
