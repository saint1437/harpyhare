import { cn } from "@/lib/utils";

export function LabeledDivider({ label, className }: { label: string; className?: string }) {
  return (
    <div role="separator" className={cn("flex items-center gap-3", className)}>
      <span className="h-px flex-1 bg-border" />
      <span className="text-hint tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
