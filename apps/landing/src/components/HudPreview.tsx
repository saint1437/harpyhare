import { EqBars } from "./EqBars";

const QUESTION = "А как вы будете масштабировать сервис до миллиона пользователей?";
const ANSWER =
  "Начну с разделения нагрузки: реплики базы на чтение, кэш для горячих данных, очередь для тяжёлых операций. Когда упрёмся в запись — шардирование по пользователям";

export function HudPreview() {
  return (
    <div className="fade-rise fade-rise-late relative mx-auto mt-16 w-full max-w-xl sm:mt-20">
      <div
        className="overflow-hidden rounded-2xl border border-border-strong bg-bg-elevated/85 shadow-[0_28px_50px_-14px_var(--hud-shadow)] backdrop-blur-xl"
        aria-hidden
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <span className="flex items-center gap-2.5 text-xs font-medium text-fg-muted">
            <EqBars animated />
            Слушаю…
          </span>
          <kbd className="rounded-md border border-border-strong bg-surface px-2 py-1 font-mono text-[11px] text-fg-muted">
            ⌥ Space
          </kbd>
        </div>

        <div className="px-5 py-4">
          <p className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
            Распознано
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-fg">«{QUESTION}»</p>
        </div>

        <div className="border-t border-border px-5 py-4">
          <p className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Claude</p>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            {ANSWER}
            <span
              className="caret ml-1 inline-block h-3.5 w-0.5 translate-y-0.5 rounded-full bg-primary"
              aria-hidden
            />
          </p>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-balance text-fg-subtle">
        Плавающее окно поверх всех приложений. При демонстрации экрана его видите только вы.
      </p>
    </div>
  );
}
