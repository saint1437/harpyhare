import { Copy, Keyboard, Minus, Plus, ScrollText, Square, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { HudChat } from "./HudChat";
import { HudComposer } from "./HudComposer";
import { AppEqBars, AppIconButton, Kbd, SectionLabel } from "./ui";
import type { DemoPhase, DemoRun } from "./useDemoRun";

const CHAT_LIMIT = 6;
const CONTEXT_CHARS_PER_PERCENT = 260;
const CONTEXT_MAX_PERCENT = 96;
const CONTEXT_WARN_PERCENT = 80;

const HOTKEY_GROUPS = [
  {
    title: "Запись",
    rows: [
      { label: "Записать вопрос", combo: "F9" },
      { label: "Отменить запись", combo: "Esc" },
      { label: "Отправить", combo: "⌘ ⏎" },
    ],
  },
  {
    title: "Окно",
    rows: [
      { label: "Показать / скрыть", combo: "⌘⇧ H" },
      { label: "Переместить", combo: "⌘ ←→↑↓" },
      { label: "Размер", combo: "⌘⇧ ←→↑↓" },
      { label: "Прозрачность", combo: "⌘⇧ + −" },
    ],
  },
  {
    title: "Чат",
    rows: [
      { label: "Суфлёр", combo: "F10" },
      { label: "Снимок области", combo: "⌘⇧ S" },
      { label: "Прокрутка", combo: "⌥ ↑↓" },
    ],
  },
];

function indicator(phase: DemoPhase): { animated: boolean; barClass: string } {
  if (phase === "recording") return { animated: true, barClass: "bg-app-recording" };
  if (phase === "transcribing") return { animated: true, barClass: "bg-app-primary" };
  return { animated: false, barClass: "bg-app-muted/50" };
}

function phaseText(phase: DemoPhase): string {
  if (phase === "recording") return "Слушаю…";
  if (phase === "transcribing") return "Расшифровываю…";
  return "";
}

function ContextGauge({ percent }: { percent: number }) {
  return (
    <div className="hidden shrink-0 items-center gap-1.5 px-1 sm:flex">
      <span className="h-1 w-10 overflow-hidden rounded-full bg-app-surface-active">
        <span
          className={cn(
            "block h-full rounded-full",
            percent >= CONTEXT_WARN_PERCENT ? "bg-app-destructive" : "bg-app-muted/60",
          )}
          style={{ width: `${Math.max(3, percent)}%` }}
        />
      </span>
      <span className="text-app-hint text-app-muted">{percent}%</span>
    </div>
  );
}

function HotkeysPopover() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <AppIconButton
        title="Горячие клавиши"
        aria-label="Горячие клавиши"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={cn(open && "bg-app-surface text-app-fg")}
      >
        <Keyboard />
      </AppIconButton>
      {open && (
        <>
          <button
            type="button"
            aria-label="Закрыть справочник"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => {
              setOpen(false);
            }}
          />
          <div className="absolute top-full right-0 z-20 mt-1.5 w-64 rounded-lg border border-app-border bg-app-card p-3 shadow-xl">
            <div className="flex flex-col gap-2.5">
              {HOTKEY_GROUPS.map((group) => (
                <div key={group.title} className="flex flex-col gap-1">
                  <SectionLabel>{group.title}</SectionLabel>
                  {group.rows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-app-caption text-app-muted">
                        {row.label}
                      </span>
                      <Kbd>{row.combo}</Kbd>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ChatTabs({ run }: { run: DemoRun }) {
  return (
    <nav
      aria-label="Чаты"
      className="app-no-scrollbar flex min-w-0 shrink items-center gap-1 overflow-x-auto"
    >
      {run.chats.map((chat, index) => {
        const isActive = chat.id === run.activeId;
        const closeOnClick = isActive && run.chats.length > 1;
        return (
          <button
            key={chat.id}
            type="button"
            title={chat.title}
            aria-label={closeOnClick ? `Закрыть чат ${index + 1}` : `Чат ${index + 1}`}
            onClick={() => {
              if (closeOnClick) run.closeChat(chat.id);
              else run.selectChat(chat.id);
            }}
            className={cn(
              "group relative grid size-7 shrink-0 place-items-center rounded-md font-mono text-app-caption transition-colors",
              isActive
                ? "bg-app-surface-active text-app-fg"
                : "text-app-muted hover:bg-app-surface hover:text-app-fg",
            )}
          >
            <span className={cn(closeOnClick && "group-hover:hidden")}>{index + 1}</span>
            {closeOnClick && <X className="hidden size-4 group-hover:block" />}
            {isActive && run.phase === "streaming" && (
              <span
                className="absolute -top-0.5 -right-0.5 size-1.5 animate-pulse rounded-full bg-app-primary"
                aria-hidden
              />
            )}
          </button>
        );
      })}
      <AppIconButton
        title="Новый чат"
        aria-label="Новый чат"
        className="rounded-md"
        disabled={run.chats.length >= CHAT_LIMIT}
        onClick={run.newChat}
      >
        <Plus />
      </AppIconButton>
    </nav>
  );
}

export function HudWindow({
  run,
  onClose,
  onHide,
}: {
  run: DemoRun;
  onClose: () => void;
  onHide: () => void;
}) {
  const chars =
    run.active.messages.reduce((total, message) => total + message.text.length, 0) +
    (run.partial?.length ?? 0);
  const percent = Math.min(
    CONTEXT_MAX_PERCENT,
    Math.round(chars / CONTEXT_CHARS_PER_PERCENT) + (chars > 0 ? 4 : 0),
  );

  return (
    <div className="flex h-full flex-col gap-2.5 bg-app-bg p-3 text-app-fg">
      <header className="flex min-h-7 items-center gap-2">
        <div className="flex shrink-0 items-center gap-0.5 pr-1">
          <AppIconButton
            title="Закрыть приложение"
            aria-label="Закрыть приложение"
            onClick={onClose}
            className="hover:bg-app-destructive/15 hover:text-app-destructive"
          >
            <X />
          </AppIconButton>
          <AppIconButton
            title="Скрыть окно — вернуть: ⌘⇧H"
            aria-label="Скрыть окно"
            onClick={onHide}
          >
            <Minus />
          </AppIconButton>
        </div>

        <AppEqBars {...indicator(run.phase)} />
        <ChatTabs run={run} />

        <span className="min-w-0 flex-1 truncate text-app-caption text-app-muted">
          {phaseText(run.phase)}
        </span>

        <div className="flex shrink-0 items-center gap-0.5">
          {percent > 0 && <ContextGauge percent={percent} />}
          <AppIconButton title="Суфлёр" aria-label="Суфлёр">
            <ScrollText />
          </AppIconButton>
          <AppIconButton title="Копировать последний ответ" aria-label="Копировать последний ответ">
            <Copy />
          </AppIconButton>
          <HotkeysPopover />
          <AppIconButton
            title="Стоп — вернуться в лаунчер"
            aria-label="Стоп — вернуться в лаунчер"
            onClick={onClose}
          >
            <Square />
          </AppIconButton>
        </div>
      </header>

      <HudChat
        messages={run.active.messages}
        partial={run.partial}
        streaming={run.phase === "streaming"}
        thinkingStartedAt={run.thinkingStartedAt}
        onRemoveMessage={run.removeMessage}
      />

      <HudComposer
        draft={run.active.draft}
        streaming={run.phase === "streaming"}
        onDraftChange={run.setDraft}
        onSend={run.send}
        onStop={run.stopStream}
        onClearHistory={run.clearHistory}
      />
    </div>
  );
}
