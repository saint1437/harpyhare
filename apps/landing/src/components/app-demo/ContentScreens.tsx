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
import { AppGhostButton, AppIconButton, SectionLabel } from "./ui";

interface LibraryDoc {
  id: string;
  name: string;
  size: string;
  folder: string;
}

const LIBRARY_FOLDERS = ["Проект Atlas", "Общее"];

const LIBRARY_DOCS: LibraryDoc[] = [
  { id: "d1", name: "Архитектура сервиса.md", size: "18 КБ", folder: "Проект Atlas" },
  { id: "d2", name: "Схема БД и миграции.md", size: "9 КБ", folder: "Проект Atlas" },
  { id: "d3", name: "Договор — SLA.pdf", size: "240 КБ", folder: "Проект Atlas" },
  { id: "d4", name: "Резюме.pdf", size: "86 КБ", folder: "Общее" },
  { id: "d5", name: "Термины и определения.md", size: "4 КБ", folder: "Общее" },
];

export function ContextsScreen() {
  const [selected, setSelected] = useState<string[]>(["d1", "d4"]);
  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <AppGhostButton>
          <FilePlus />
          Добавить файл
        </AppGhostButton>
        <AppGhostButton>
          <FolderPlus />
          Папка
        </AppGhostButton>
        <span className="ml-auto text-app-caption text-app-muted">
          Выбрано: {selected.length} из {LIBRARY_DOCS.length}
        </span>
      </div>

      {LIBRARY_FOLDERS.map((folder) => (
        <section
          key={folder}
          className="overflow-hidden rounded-xl bg-app-card ring-1 ring-app-border ring-inset"
        >
          <header className="px-4 pt-3 pb-2">
            <SectionLabel>{folder}</SectionLabel>
          </header>
          <div className="divide-y divide-app-border border-t border-app-border">
            {LIBRARY_DOCS.filter((doc) => doc.folder === folder).map((doc) => {
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
                    title="Удалить материал"
                    aria-label="Удалить материал"
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

const PRESETS = [
  {
    name: "Расшифровка речи",
    text: "Отвечай кратко и по делу. Текст пользователя — расшифровка чужой речи, в ней возможны ошибки распознавания: восстанавливай смысл, не переспрашивай.",
  },
  {
    name: "Собеседование",
    text: "Ты помогаешь на техническом интервью. Отвечай от первого лица, как кандидат: сначала короткий тезис, затем два-три пункта аргументации. Без воды и вводных фраз.",
  },
  {
    name: "Созвон с клиентом",
    text: "Формулируй ответ так, чтобы его можно было произнести вслух: без списков терминов, простыми предложениями, с конкретными сроками и следующими шагами.",
  },
];

export function PresetsScreen() {
  const [active, setActive] = useState(0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <AppGhostButton>
          <Plus />
          Добавить пресет
        </AppGhostButton>
      </div>
      {PRESETS.map((preset, index) => (
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
            {active === index && <SectionLabel>активен в новых чатах</SectionLabel>}
          </div>
          <p className="mt-1.5 text-app-caption leading-relaxed text-app-muted">{preset.text}</p>
        </button>
      ))}
    </div>
  );
}

interface IdentityTile {
  id: string;
  name: string;
  icon: LucideIcon;
  tint: string;
}

const IDENTITIES: IdentityTile[] = [
  { id: "", name: "Audio System", icon: AudioLines, tint: "bg-app-surface-active" },
  { id: "obsidian", name: "Obsidian", icon: Gem, tint: "bg-[oklch(0.45_0.14_300)]" },
  { id: "spotify", name: "Spotify", icon: Music, tint: "bg-[oklch(0.55_0.16_150)]" },
  { id: "proton", name: "Proton VPN", icon: Shield, tint: "bg-[oklch(0.5_0.13_290)]" },
  { id: "discord", name: "Discord", icon: MessagesSquare, tint: "bg-[oklch(0.52_0.14_275)]" },
  { id: "android", name: "Android Studio", icon: Bot, tint: "bg-[oklch(0.55_0.13_160)]" },
  { id: "steam", name: "Steam", icon: Gamepad2, tint: "bg-[oklch(0.42_0.05_240)]" },
  { id: "display", name: "DisplayBuddy", icon: Monitor, tint: "bg-[oklch(0.5_0.12_230)]" },
  { id: "unarchiver", name: "The Unarchiver", icon: Archive, tint: "bg-[oklch(0.55_0.11_60)]" },
];

export function IdentityScreen() {
  const [current, setCurrent] = useState("");
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {IDENTITIES.map((identity) => {
        const Icon = identity.icon;
        const isActive = identity.id === current;
        return (
          <button
            key={identity.name}
            type="button"
            onClick={() => {
              setCurrent(identity.id);
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl bg-app-card px-2 py-4 ring-1 transition-colors ring-inset",
              isActive ? "ring-app-primary/70" : "ring-app-border hover:bg-app-surface",
            )}
          >
            <span
              className={cn(
                "grid size-10 place-items-center rounded-[10px] text-app-fg",
                identity.tint,
              )}
            >
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 truncate text-app-caption text-app-fg">{identity.name}</span>
          </button>
        );
      })}
    </div>
  );
}
