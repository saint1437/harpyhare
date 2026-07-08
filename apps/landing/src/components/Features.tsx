import { AudioLines, Languages, Sparkles, type LucideIcon } from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  text: string;
}

const FEATURES: Feature[] = [
  {
    icon: AudioLines,
    title: "Системный звук",
    text: "Захватывает аудио из любого приложения через Core Audio process tap — голос из видео, звонка или встречи.",
  },
  {
    icon: Languages,
    title: "Расшифровка на лету",
    text: "Groq Whisper превращает речь в текст за доли секунды. Русский и перевод на английский из коробки.",
  },
  {
    icon: Sparkles,
    title: "Ответ от Claude",
    text: "Стримит ответ модели Anthropic прямо в HUD — с контекстом чата, скриншотами и превью кода.",
  },
];

export function Features() {
  return (
    <section className="px-6 py-8 sm:py-12">
      <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="rounded-2xl border border-border bg-surface/50 p-6 transition-colors hover:border-border-strong hover:bg-surface"
          >
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Icon className="size-[22px]" strokeWidth={2} />
            </span>
            <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
