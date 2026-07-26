import { cn } from "@/lib/utils";
import { screenGroup, type ScreenId } from "./screens";

interface SidebarProps {
  active: ScreenId;
  attention: ScreenId[];
  onSelect: (id: ScreenId) => void;
}

function SidebarItem({
  id,
  label,
  icon: Icon,
  active,
  attention,
  onSelect,
}: {
  id: ScreenId;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  active: boolean;
  attention: boolean;
  onSelect: (id: ScreenId) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={label}
      onClick={() => {
        onSelect(id);
      }}
      className={cn(
        "group relative flex items-center justify-center gap-2.5 rounded-lg px-0 py-2 text-left text-body whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring md:justify-start md:px-2.5",
        active
          ? "bg-surface-active text-foreground"
          : "text-muted-foreground hover:bg-surface hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="hidden truncate md:inline">{label}</span>
      {attention && (
        <span
          className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary md:static md:ml-auto"
          aria-hidden
        />
      )}
    </button>
  );
}

export function Sidebar({ active, attention, onSelect }: SidebarProps) {
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      className="no-scrollbar flex w-12 shrink-0 flex-col gap-4 overflow-y-auto md:w-52"
    >
      {(["content", "system"] as const).map((group) => (
        <div key={group} className={cn("flex flex-col gap-0.5", group === "system" && "mt-auto")}>
          {screenGroup(group).map((screen) => (
            <SidebarItem
              key={screen.id}
              id={screen.id}
              label={screen.label}
              icon={screen.icon}
              active={active === screen.id}
              attention={attention.includes(screen.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
