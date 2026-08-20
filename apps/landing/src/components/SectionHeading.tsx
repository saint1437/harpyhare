export function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-5 sm:gap-7">
      <h2 className="font-display text-xl font-bold tracking-wide uppercase sm:text-3xl sm:whitespace-nowrap">
        {title}
      </h2>
      <div className="grow border-t-2 border-border-strong/60" aria-hidden />
      {hint !== undefined && (
        <span className="hidden font-display text-[11px] font-medium tracking-[0.12em] text-fg-subtle uppercase sm:block">
          {hint}
        </span>
      )}
    </div>
  );
}
