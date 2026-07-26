import {
  Archive,
  AudioLines,
  Bot,
  Check,
  FilePlus,
  FileText,
  FolderPlus,
  Gamepad2,
  Gem,
  MessagesSquare,
  Monitor,
  Music,
  Plus,
  Shield,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useCopy } from "./copy";
import { AppGhostButton, AppIconButton, SectionLabel } from "./ui";

export function ContextsScreen() {
  const copy = useCopy().launcher.contexts;
  const [selected, setSelected] = useState<string[]>(["d1", "d4"]);
  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <AppGhostButton>
          <FilePlus />
          {copy.addFile}
        </AppGhostButton>
        <AppGhostButton>
          <FolderPlus />
          {copy.addFolder}
        </AppGhostButton>
        <span className="ml-auto text-app-caption text-app-muted">
          {copy.selectedCount}: {selected.length} / {copy.docs.length}
        </span>
      </div>

      {copy.folders.map((folder) => (
        <section
          key={folder}
          className="overflow-hidden rounded-xl bg-app-card ring-1 ring-app-border ring-inset"
        >
          <header className="px-4 pt-3 pb-2">
            <SectionLabel>{folder}</SectionLabel>
          </header>
          <div className="divide-y divide-app-border border-t border-app-border">
            {copy.docs
              .filter((doc) => doc.folder === folder)
              .map((doc) => {
                const isSelected = selected.includes(doc.id);
                return (
                  <div key={doc.id} className="group/doc flex items-center gap-2.5 px-4 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        toggle(doc.id);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded-[4px] border",
                          isSelected
                            ? "border-transparent bg-app-primary text-app-primary-fg"
                            : "border-app-border",
                        )}
                      >
                        {isSelected && <Check className="size-3" />}
                      </span>
                      <FileText className="size-3.5 shrink-0 text-app-muted" />
                      <span className="min-w-0 truncate text-app-body text-app-fg">{doc.name}</span>
                    </button>
                    <span className="shrink-0 font-mono text-app-caption text-app-muted">
                      {doc.size}
                    </span>
                    <AppIconButton
                      title={copy.remove}
                      aria-label={copy.remove}
                      className="size-6 rounded-md opacity-0 group-hover/doc:opacity-100 [&_svg]:size-3.5"
                    >
                      <Trash2 />
                    </AppIconButton>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function PresetsScreen() {
  const copy = useCopy().launcher.presets;
  const [active, setActive] = useState(0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <AppGhostButton>
          <Plus />
          {copy.add}
        </AppGhostButton>
      </div>
      {copy.items.map((preset, index) => (
        <button
          key={preset.name}
          type="button"
          onClick={() => {
            setActive(index);
          }}
          className={cn(
            "rounded-xl bg-app-card p-4 text-left ring-1 transition-colors ring-inset",
            active === index ? "ring-app-primary/60" : "ring-app-border hover:ring-app-border",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-app-body font-medium text-app-fg">{preset.name}</span>
            {active === index && <SectionLabel>{copy.activeBadge}</SectionLabel>}
          </div>
          <p className="mt-1.5 text-app-caption leading-relaxed text-app-muted">{preset.text}</p>
        </button>
      ))}
    </div>
  );
}

const IDENTITY_ICONS: LucideIcon[] = [
  AudioLines,
  Gem,
  Music,
  Shield,
  MessagesSquare,
  Bot,
  Gamepad2,
  Monitor,
  Archive,
];

const IDENTITY_TINTS = [
  "bg-app-surface-active",
  "bg-[oklch(0.45_0.14_300)]",
  "bg-[oklch(0.55_0.16_150)]",
  "bg-[oklch(0.5_0.13_290)]",
  "bg-[oklch(0.52_0.14_275)]",
  "bg-[oklch(0.55_0.13_160)]",
  "bg-[oklch(0.42_0.05_240)]",
  "bg-[oklch(0.5_0.12_230)]",
  "bg-[oklch(0.55_0.11_60)]",
];

export function IdentityScreen() {
  const copy = useCopy().launcher.identity;
  const [current, setCurrent] = useState(0);
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {copy.names.map((name, index) => {
        const Icon = IDENTITY_ICONS[index] ?? AudioLines;
        const isActive = index === current;
        return (
          <button
            key={name}
            type="button"
            onClick={() => {
              setCurrent(index);
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl bg-app-card px-2 py-4 ring-1 transition-colors ring-inset",
              isActive ? "ring-app-primary/70" : "ring-app-border hover:bg-app-surface",
            )}
          >
            <span
              className={cn(
                "grid size-10 place-items-center rounded-[10px] text-app-fg",
                IDENTITY_TINTS[index] ?? IDENTITY_TINTS[0],
              )}
            >
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 truncate text-app-caption text-app-fg">{name}</span>
          </button>
        );
      })}
    </div>
  );
}
