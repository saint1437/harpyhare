import type { ReactNode } from "react";
import { SectionLabel } from "@/components/SectionLabel";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function SelectField({
  label,
  value,
  disabled,
  onValueChange,
  children,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <Field label={label}>
      <Select value={value} disabled={disabled} onValueChange={onValueChange}>
        <SelectTrigger className="w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">{children}</SelectContent>
      </Select>
    </Field>
  );
}

export function SectionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card/60 p-4 ring-1 ring-border ring-inset">
      <SectionLabel>{title}</SectionLabel>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function SectionColumns({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3 [&>*]:row-span-2 [&>*]:grid [&>*]:min-w-0 [&>*]:grid-rows-subgrid [&>*]:content-start">
      {children}
    </div>
  );
}

export function SwitchRow({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2.5 text-body">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      {children}
    </label>
  );
}
