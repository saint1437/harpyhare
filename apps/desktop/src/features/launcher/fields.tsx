import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

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
    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border ring-inset">
      <header className="px-4 pt-3 pb-2.5">
        <h3 className="text-body font-medium text-foreground">{title}</h3>
        {description !== undefined && (
          <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>
        )}
      </header>
      <div className="divide-y divide-border border-t border-border">{children}</div>
    </section>
  );
}

export function SettingRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_14rem] items-center gap-x-5 px-4 py-2.5">
      <div className="min-w-0">
        <Label htmlFor={htmlFor} className="text-body font-normal text-foreground">
          {label}
        </Label>
        {hint !== undefined && <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex min-w-0 items-center justify-end">{children}</div>
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
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="min-w-0">
        <span className="text-body text-foreground">{label}</span>
        {hint !== undefined && <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p>}
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
  onCheckedChange,
}: {
  checked: boolean;
  ariaLabel: string;
  onCheckedChange: (value: boolean) => void;
}) {
  return <Switch checked={checked} aria-label={ariaLabel} onCheckedChange={onCheckedChange} />;
}

export function SettingSlider({
  value,
  min,
  max,
  step,
  ariaLabel,
  readout,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  ariaLabel: string;
  readout: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex w-full items-center gap-3">
      <Slider
        className="min-w-0 flex-1"
        min={min}
        max={max}
        step={step}
        value={[value]}
        aria-label={ariaLabel}
        onValueChange={([next]) => {
          if (next === undefined) return;
          onChange(next);
        }}
      />
      <span className="w-12 shrink-0 text-right font-mono text-caption text-muted-foreground tabular-nums">
        {readout}
      </span>
    </div>
  );
}
