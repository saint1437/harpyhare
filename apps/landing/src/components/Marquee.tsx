const SEPARATOR = "  ●  ";

export function Marquee({ items }: { items: string[] }) {
  const line = [...items, ""].join(SEPARATOR);
  return (
    <div
      className="relative -mx-[3%] -rotate-[2.5deg] overflow-hidden bg-ink py-4 sm:py-[18px]"
      aria-hidden
    >
      <div className="marquee-track flex w-max whitespace-nowrap">
        <span className="font-display text-[12px] font-medium tracking-[0.12em] text-fg uppercase sm:text-[17px]">
          {line}
        </span>
        <span className="font-display text-[12px] font-medium tracking-[0.12em] text-fg uppercase sm:text-[17px]">
          {line}
        </span>
      </div>
    </div>
  );
}
