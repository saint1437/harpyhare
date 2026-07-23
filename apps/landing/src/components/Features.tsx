import {
  AudioLines,
  EyeOff,
  KeyRound,
  Languages,
  ScrollText,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { FEATURES_STARS } from "@/lib/stars";
import { Hare } from "./Hare";
import { Bush } from "./Scenery";
import { StarField } from "./Sky";

interface Feature {
  icon: LucideIcon;
  title: string;
  text: string;
}

const FEATURES: Feature[] = [
  {
    icon: AudioLines,
    title: "Системный звук, не микрофон",
    text: "Захватывает то, что вы слышите: собеседника в звонке, голос из видео, запись вебинара. Виртуальные аудиоустройства не нужны.",
  },
  {
    icon: Languages,
    title: "Расшифровка на лету",
    text: "Whisper распознаёт речь за доли секунды — на русском, английском и десятках других языков. Отдельный режим сразу переводит всё на английский.",
  },
  {
    icon: Sparkles,
    title: "Ответы от Claude",
    text: "Модели Anthropic отвечают потоком прямо в окне. История чата, скриншоты и подсветка кода — всё в одном месте.",
  },
  {
    icon: EyeOff,
    title: "Невидим для собеседников",
    text: "Окно не попадает в захват экрана: во время демонстрации в Zoom или Meet его видите только вы.",
  },
  {
    icon: ScrollText,
    title: "Режим суфлёра",
    text: "Одна клавиша — и ответ разворачивается в крупный текст с плавной автопрокруткой. Скорость и размер шрифта настраиваются.",
  },
  {
    icon: KeyRound,
    title: "Свои ключи, свои данные",
    text: "Работает напрямую с API Groq и Anthropic по вашим ключам — без сторонних серверов, аккаунтов и подписок.",
  },
];

export function Features() {
  return (
    <section id="features" className="relative border-t border-border px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-fg-subtle uppercase">
          Возможности
        </p>
        <h2 className="mt-3 max-w-lg text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Что умеет harpyhare
        </h2>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-surface/40 p-6">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Icon className="size-5" strokeWidth={2} />
              </span>
              <h3 className="mt-5 text-base font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{text}</p>
            </div>
          ))}
        </div>
      </div>

      <StarField stars={FEATURES_STARS} />
      <Bush width={90} className="left-[6%]" />
      <Hare
        height={52}
        idleMs={[7000, 14000]}
        range={[-24, 150]}
        className="left-[calc(6%+98px)]"
      />
      <Bush variant="front" width={64} className="right-[10%] hidden sm:block" />
    </section>
  );
}
