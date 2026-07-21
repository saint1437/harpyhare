# Консистентность дизайна: единая система токенов и контролов

Дата: 2026-07-21. Область: `apps/desktop/src` (index.css, ui-примитивы, компоненты).

## Проблема

Многоагентный аудит (7 измерений, 135 сырых находок → 105 после дедупликации → 56 подтверждено
адверсариальной верификацией) показал: одни и те же дизайн-роли решены по-разному без причины.

- 8 сырых размеров шрифта (10–13px) без шкалы; роль «заголовок секции» скопирована строкой в 8 мест.
- Ghost-иконка-кнопка реализована 7+ раз с нуля с расходящимися стилями (размер, радиус, ховер, фокус).
- Три ховера одной роли (bg-accent красноватый / bg-white/5 / bg-white/10) и три системы focus-visible
  (ring / outline / отсутствует).
- `@custom-variant dark` завязан на класс `.dark`, который никогда не ставится — все `dark:`-ветки
  shadcn-примитивов мертвы: unchecked-тумблер Switch рендерится тёмным по тёмному, outline-кнопка —
  сплошной заливкой вместо полупрозрачной.
- `--ring` уже содержит 50% альфы, а утилиты добавляют `ring-ring/50` — фокус-кольца фактически 25%.
- Размер шрифта Input/Textarea зависел от ширины окна (`text-base md:text-sm` при HUD 300–1600px).
- UpdateDialog: `max-w-[400px]` перебивался `sm:max-w-lg` из базы DialogContent — реальная ширина 512px.
- Сырые значения вместо токенов: разделители (white/5, white/10, border), радиусы (`rounded-[12px]`=xl,
  bare `rounded` 4px, 9px в prose), `text-white` при живом `--destructive-foreground`, мёртвый
  `--primary-hover`, `bg-recording` в роли предупреждения.

## Решение

### Токены (index.css)

- `@custom-variant dark (&);` — dark-only приложение, ветки `dark:` активны всегда; ui/* остаются
  стоковыми (совместимость с `npx shadcn add`). Вид примитивов становится канонным shadcn-тёмным
  (thumb Switch светлый, инпуты с заливкой bg-input/30).
- Шкала шрифтов в `@theme inline`: `--text-hint: 10.5px` (микро-подписи, счётчики, заголовки секций),
  `--text-caption: 11.5px` (подписи полей, mono-данные, вторичные подсказки), `--text-body: 12.5px`
  (основной UI-текст: диалоги, табы, строки списков, kbd), `--text-chat: var(--chat-font-size)`
  (всё в потоке сообщений). `text-sm` — кнопки/инпуты/пункты меню; `text-lg` — заголовки диалогов.
  `lib/utils.cn` расширен `extendTailwindMerge` (новые font-size утилиты против `text-sm`).
- Поверхности: `--surface: oklch(1 0 0 / 5%)` (тихая плитка, ховер), `--surface-active: 10%`
  (выбранное/активное, треки), `--code-surface: oklch(0 0 0 / 28%)` (фон код-блоков — полупрозрачный
  чёрный оверлей: следует за прозрачностью окна и темой без per-theme оверрайдов; раньше сырой
  непрозрачный oklch инвертировал глубину в чёрной теме и «глушил» прозрачность).
- `--ring` непрозрачный; альфа живёт в утилите (`ring-ring/50`) — фокус-кольца становятся задуманными 50%.
- `--primary-hover` удалён (мёртвый); канон ховера primary — `hover:bg-primary/90`.
- prose: радиусы `calc(var(--radius) - N)`, размеры заголовков/таблиц в `em` — масштабируются
  настройкой шрифта чата.

### Роли

- Ховер тихих контролов: `hover:bg-surface`; выбранное: `bg-surface-active`; хайрлайны: токен border.
- Карточки-поверхности: `rounded-xl bg-card/60 ring-1 ring-border ring-inset` (Composer, DocEditor,
  PresetEditor); инфо-плитки: `rounded-md bg-surface px-3 py-2.5`; пузырь чата: `rounded-lg` (своя роль).
- Плавающие элементы над чатом: `border bg-popover/95 shadow-md backdrop-blur-sm`.
- Focus-visible один: `outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50`.
- mono только для данных (версии, хоткеи, числа, код); действия и ошибки — обычная гарнитура.
- Иконки: size-4 в size-7 кнопках, size-3.5 в size-6.

### Контролы

- `ui/button`: ghost-ховер нейтральный (`bg-surface`), destructive — `text-destructive-foreground`,
  вариант link удалён (primary-как-текст, не используется; то же в badge). Новые размеры: `compact`
  (h-7, text-caption) и `icon-compact` (size-7) — 28px = стандарт HUD, раньше лепился
  `className="size-7 p-0"` поверх `size="sm"`.
- Новый `components/IconButton` (Button ghost icon-compact rounded-full, muted→foreground) — единая
  реализация ghost-иконки: StatusBar, HotkeysPopover, Teleprompter, экшены сообщений и строк
  библиотеки, превью, новый чат.
- Новые `components/SectionLabel` и `components/LabeledDivider` (копипаста «или свои ключи»).
- `ui/label`: база = канон подписи поля (text-caption font-medium muted); Field и ParamRow без
  переопределений.
- Reveal-по-ховеру кластеры видимы при клавиатурном фокусе (`focus-within:opacity-100`).

### Точечные фиксы

- Input/Textarea: плоский `text-sm` без `md:`; Textarea — `field-sizing-fixed` в базе (WKWebView
  не умеет content, все вызовы и так переопределяли).
- Промпт-поле — `text-chat`: черновик и отправленное сообщение одного размера; ThinkingIndicator тоже.
- UpdateDialog: ширина `max-w-[min(440px,95vw)] sm:max-w-[min(440px,95vw)]`; футер — дефолтные h-9
  кнопки (канон трёх остальных диалогов) + flex-wrap.
- Слайдер: thumb `bg-foreground` (был bg-white), трек `bg-surface-active` (канон треков — white-альфа,
  сохраняет прозрачность шелла).
- Гейдж контекста: предупреждение `bg-destructive` (bg-recording — только про запись).
- Сетки вкладок настроек: единый ритм gap-y-5 / gap-x-10.
- Телесуфлёр: токены foreground/muted-foreground вместо параллельной шкалы white-альф; общий
  IconButton; иконки size-4.
- DialogClose: focus-visible ring вместо focus:ring-2+offset.
- AttachmentChip: size-13 / size-4.5 вместо h-[52px]/h-[18px]; фокус-стиль.
- Шелл App: gap/padding из констант SHELL_* инлайн-стилем (были продублированы классами).

## Вне области

Неиспользуемые ui/tooltip и ui/scroll-area (сток, knip игнорирует), скроллбары, слабая группировка
папок (bg-white/[0.03] — намеренная иерархия), чёрные скримы поверх изображений/оверлеев (не зависят
от темы намеренно), SelectItem focus:bg-accent (тёплая подсветка меню — фирменный акцент).
