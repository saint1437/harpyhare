interface Step {
  number: string;
  title: string;
  text: string;
}

const STEPS: Step[] = [
  {
    number: "01",
    title: "Зажмите клавишу",
    text: "harpyhare начнёт слушать системный звук — голос собеседника в звонке или дорожку видео.",
  },
  {
    number: "02",
    title: "Отпустите",
    text: "Речь расшифровывается ещё во время записи, поэтому текст готов почти мгновенно.",
  },
  {
    number: "03",
    title: "Читайте ответ",
    text: "Claude отвечает потоком в плавающем окне. Задайте уточняющий вопрос — контекст диалога сохраняется.",
  },
];

import { BushWatcher } from "./Scenery";
import { Cloud } from "./Sky";

export function HowItWorks() {
  return (
    <section id="how" className="relative border-t border-border px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-fg-subtle uppercase">
          Как это работает
        </p>
        <h2 className="mt-3 max-w-md text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Три шага до ответа
        </h2>

        <div className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {STEPS.map(({ number, title, text }) => (
            <div key={number}>
              <span className="font-mono text-sm font-medium text-primary">{number}</span>
              <h3 className="mt-3 text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{text}</p>
            </div>
          ))}
        </div>
      </div>

      <Cloud
        variant="small"
        width={92}
        drift={54}
        className="top-[52px] right-[12%] hidden sm:block"
      />
      <BushWatcher className="right-[8%]" />
    </section>
  );
}
