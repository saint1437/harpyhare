/**
 * The demo's Russian copy — a transcription of the desktop app's own
 * dictionary (`apps/desktop/src/i18n/*-ru.ts`), not a paraphrase of it.
 *
 * Anything below that reads like an odd phrasing is almost certainly the app's
 * odd phrasing, and changing it here would put the page and the product out of
 * step. The exceptions are marked in place: seeded user data (quick actions,
 * presets, context materials, chat history) is invented, because it stands in
 * for something a user typed.
 */
import type { DemoCopy } from "./demo-types";

const ANSWER_ISOLATION = `**Уровни изоляции** — это про то, какие аномалии транзакция готова увидеть.

- \`READ UNCOMMITTED\` — видно чужие незакоммиченные изменения. В PostgreSQL этого уровня фактически нет.
- \`READ COMMITTED\` — дефолт в PostgreSQL. Каждый запрос видит свой снимок, поэтому два одинаковых \`SELECT\` в одной транзакции могут разойтись.
- \`REPEATABLE READ\` — снимок берётся один раз на транзакцию. В PostgreSQL сюда же попадает защита от фантомов.
- \`SERIALIZABLE\` — сериализуемость через SSI: конфликтующая транзакция откатывается с \`40001\`.

На собеседовании обычно ждут одну фразу: **чем выше уровень, тем меньше аномалий и тем чаще откаты** — и что выбор упирается в то, готов ли код ретраить.`;

const ANSWER_GOROUTINES = `Горутина — не поток ОС. Рантайм Go мультиплексирует их на \`GOMAXPROCS\` системных потоков планировщиком M:N.

\`\`\`go
func worker(ctx context.Context, jobs <-chan Job) error {
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case job, ok := <-jobs:
            if !ok {
                return nil
            }
            handle(job)
        }
    }
}
\`\`\`

Три вещи, которые спрашивают следом:

1. Стек начинается с 2 КиБ и растёт копированием — поэтому их можно держать сотнями тысяч.
2. Горутина, которую никто не остановит, живёт до конца процесса: утечка выглядит как ровно растущий \`runtime.NumGoroutine()\`.
3. \`context\` — единственный принятый способ сказать «заканчивай»: канал отмены передаётся вниз, а не наружу.`;

const ANSWER_FALLBACK = `Коротко — да, но с оговоркой.

Ответ приходит потоком, поэтому первые строки видно раньше, чем модель закончит. Если ответ длинный, откройте **суфлёр**: тот же текст крупно и с автопрокруткой, чтобы читать с экрана, не отводя взгляд.`;

export const demoRu: DemoCopy = {
  frameLabel: "Интерактивный макет приложения",
  ask: "Спросить голосом",
  controls: {
    label: "Показать состояние",
    offline: "Нет сети",
    error: "Ошибка",
    keysHint: "Клавиши работают, когда макет в фокусе: {combos}.",
  },
  caption:
    "Макет живой: клавиши, состояния и сворачивание в клубок работают так же, как в приложении.",
  disclosure: "Ответы в макете заготовлены заранее — сеть не задействована.",
  depth: {
    label: "Фон макета",
    options: [
      { id: "default", label: "Обычный" },
      { id: "black", label: "Глубокий" },
    ],
  },
  newChatTitle: "Чат",
  version: "0.12.0",

  chats: [
    {
      id: "chat-1",
      title: "Расскажи про уровни изоляции",
      messages: [
        { role: "user", text: "Расскажи про уровни изоляции транзакций" },
        { role: "assistant", text: ANSWER_ISOLATION },
      ],
    },
    {
      id: "chat-2",
      title: "Чат 2",
      messages: [],
    },
  ],

  prompts: [
    {
      chip: "Уровни изоляции",
      question: "Расскажи про уровни изоляции транзакций",
      answer: ANSWER_ISOLATION,
    },
    {
      chip: "Горутины",
      question: "Чем горутина отличается от потока ОС?",
      answer: ANSWER_GOROUTINES,
    },
  ],
  fallbackAnswer: ANSWER_FALLBACK,

  // Verbatim from `apps/desktop/src/i18n/hotkeys-ru.ts` + the macOS defaults in
  // `src-tauri/src/hotkeys.rs`. The demo shows the mac shape: four screens of
  // the launcher and the permissions screen exist only there.
  hotkeys: [
    {
      id: "record",
      label: "Записать системный звук",
      hint: "Удерживайте, пока говорит собеседник.",
      combo: "⌘R",
    },
    {
      id: "auto_mode",
      label: "Автослушание",
      hint: "Слушает собеседника и вас, пока включено.",
      combo: "⌘⇧L",
    },
    {
      id: "cancel_recording",
      label: "Отменить запись или ответ",
      hint: "Пока идёт запись — отменяет её, пока генерируется ответ — останавливает его.",
      combo: "Esc",
    },
    {
      id: "send",
      label: "Отправить",
      hint: "Работает из любого места окна, не только из поля ввода.",
      combo: "⌘⏎",
    },
    {
      id: "auto_answer",
      label: "Ответить на услышанное",
      hint: "Отправляет накопленную расшифровку. Слушается и когда окно не в фокусе.",
      combo: "⌘⇧⏎",
    },
    {
      id: "screenshot",
      label: "Снимок области экрана",
      hint: "Выделенная область уходит вложением в чат.",
      combo: "⌘⇧A",
    },
    {
      id: "quick_action",
      label: "Быстрые действия",
      hint: "Модификатор с цифрой: 1…9 по порядку кнопок.",
      combo: "⌘ 1…9",
    },
    {
      id: "focus_prompt",
      label: "Сфокусировать поле ввода",
      hint: "Поднимает окно и ставит каретку в конец текста.",
      combo: "⌘⇧D",
    },
    {
      id: "toggle_window",
      label: "Скрыть или показать",
      hint: "Работает, даже когда окно спрятано.",
      combo: "⌘⇧H",
    },
    {
      id: "move_window",
      label: "Передвинуть окно",
      hint: "Модификатор со стрелками двигает окно.",
      combo: "⌘ ←→↑↓",
    },
    {
      id: "resize_window",
      label: "Изменить размер окна",
      hint: "Модификатор со стрелками меняет ширину и высоту.",
      combo: "⌘⇧ ←→↑↓",
    },
    {
      id: "scroll_chat",
      label: "Скролл переписки",
      hint: "Прокрутка переписки стрелками вверх и вниз.",
      combo: "⌥ ←→↑↓",
    },
    {
      id: "duplicate_chat",
      label: "Дубликат чата",
      hint: "Новый чат с параметрами текущего, без сообщений.",
      combo: "⌘⇧N",
    },
    {
      id: "teleprompter",
      label: "Суфлёр",
      hint: "Крупный текст ответа поверх экрана.",
      combo: "⌘⇧T",
    },
    {
      id: "teleprompter_close",
      label: "Закрыть суфлёр",
      hint: "Слушается только пока суфлёр открыт.",
      combo: "Esc",
    },
    {
      id: "teleprompter_pause",
      label: "Пауза суфлёра",
      hint: "Останавливает автопрокрутку.",
      combo: "␣",
    },
  ],
  hotkeyGroups: [
    { title: "Запись", ids: ["record", "auto_mode", "cancel_recording"] },
    {
      title: "Отправка",
      ids: ["send", "auto_answer", "screenshot", "quick_action", "focus_prompt"],
    },
    { title: "Окно", ids: ["toggle_window", "move_window", "resize_window"] },
    { title: "Чат", ids: ["scroll_chat", "duplicate_chat", "teleprompter"] },
    { title: "Суфлёр", ids: ["teleprompter_close", "teleprompter_pause"] },
  ],
  hotkeyFieldHints: [
    { combo: "⏎", label: "отправить из поля ввода" },
    { combo: "⇧⏎", label: "перенос строки" },
    { combo: "⌘V", label: "вставить скриншот" },
  ],

  launcher: {
    wordmark: "harpyhare.ai",
    skipToContent: "К содержимому экрана",
    launch: "Запустить",
    launching: "Запускаю…",
    search: {
      placeholder: "Поиск по настройкам",
      empty: "Ничего не найдено",
      breadcrumbSeparator: " → ",
    },
    status: {
      launching: "Запускаю окно",
      checking: "Проверяю доступы",
      ready: { line: "Всё готово", detail: "к запуску" },
      saving: "Сохраняю",
      saved: "Сохранено",
    },
    states: { done: "готово", todo: "нужно сделать", checking: "проверяю…" },
    screens: {
      start: {
        label: "Старт",
        description: "Что нужно сделать до запуска. Остальное уже настроено по умолчанию.",
      },
      contexts: {
        label: "Контексты",
        description: "Справочные материалы, которые можно подмешать в системный промпт чата.",
      },
      presets: {
        label: "Пресеты",
        description: "Препромпты: текст, который встаёт в начало системного промпта.",
      },
      settings: {
        label: "Настройки",
        description: "Доступ к API, распознавание речи, клавиши, поведение и вид.",
      },
      permissions: {
        label: "Доступы",
        description: "Системные разрешения, без которых часть приложения не работает.",
      },
      updates: { label: "Обновления", description: "Версия приложения и установка новой." },
    },
    start: {
      stepsTitle: "Что нужно для запуска",
      summaryReady: "Всё готово — можно запускать.",
      steps: [
        {
          id: "access",
          title: "Доступ к API",
          hint: "Запросы уходят от вашего имени — ключи или код уже приняты.",
        },
        {
          id: "audio",
          title: "Запись системного звука",
          hint: "Приложение слышит собеседника и расшифровывает речь. Без него запускать нечего.",
        },
        {
          id: "microphone",
          title: "Микрофон",
          hint: "Нужен автослушанию, чтобы отделить вашу речь от речи собеседника.",
        },
      ],
      audioCheck: {
        title: "Проверка звука",
        description:
          "Выданный доступ ещё не значит, что звук идёт. Проверка слушает пять секунд и показывает, что расслышала.",
        run: "Проверить",
        running: "Слушаю…",
        sources: [
          {
            id: "system",
            label: "Системный звук",
            hint: "Голос собеседника: включите видео или музыку и нажмите проверку.",
          },
          {
            id: "microphone",
            label: "Микрофон",
            hint: "Ваша речь для автослушания: скажите пару слов после нажатия.",
          },
        ],
        heard: "Расслышала: «{text}»",
        heardText: "проверка связи, раз, два, три",
        silence:
          "Тишина — звук не дошёл. Проверьте устройство и что источник действительно звучит.",
      },
      usageTitle: "Как пользоваться",
      usageNote:
        "Отпустите — расшифровка попадёт в поле ввода. Остальные сочетания перечислены в основном окне по кнопке с клавиатурой.",
      defaultsNote:
        "Клавиши, быстрые действия, размеры окна и вид уже заданы по умолчанию — их можно не трогать.",
      allSettings: "Все настройки",
    },
    settings: {
      saveKey: "Сохранить",
      deleteKey: "Удалить",
      whereToGetKey: "Где взять",
      accessCode: {
        label: "Код доступа",
        hint: "Быстрый путь: заводить ключи не нужно.",
        placeholder: "XXXXX-XXXXX-XXXXX-XXXXX",
        submit: "Активировать",
      },
      quickActions: {
        title: "Быстрые действия",
        description: "Кнопки над полем ввода: каждая отправляет в чат свой заготовленный промпт.",
        modifierLabel: "Сочетание",
        modifierHint: "Модификатор с цифрой: 1…9 по порядку кнопок.",
        modifierOption: "{combo} + цифра",
        attachLabel: "Прикреплять вложения",
        attachHint:
          "Быстрое действие отправит картинки из поля ввода вместе с заготовленным промптом.",
        namePlaceholder: "Название — его видно на кнопке, в чат оно не уходит",
        promptPlaceholder: "Промпт — именно он уходит в чат вместо названия",
        remove: "Удалить быстрое действие",
        add: "Добавить",
        // Seeded user data — the three the app ships with.
        items: [
          { id: "detail", title: "Подробнее", prompt: "Расскажи более подробно." },
          { id: "brief", title: "Короче", prompt: "Ответь короче, только суть." },
          { id: "code", title: "Пример кода", prompt: "Покажи пример кода." },
        ],
      },
      tabs: {
        access: {
          label: "Ключи",
          description: "Ключи Anthropic и Groq либо код доступа вместо них.",
          groups: [
            {
              title: "Доступ к API",
              description: "Нужен код доступа либо пара своих ключей API — иначе запускать нечего.",
              rows: [
                {
                  id: "anthropic_key",
                  label: "Ключ Anthropic",
                  hint: "Нужен для ответов Claude.",
                  control: { kind: "secret", placeholder: "sk-ant-…", stored: "…4f2a" },
                },
                {
                  id: "groq_key",
                  label: "Ключ Groq",
                  hint: "Нужен для распознавания речи.",
                  control: { kind: "secret", placeholder: "gsk_…", stored: "…9c1d" },
                },
              ],
            },
          ],
        },
        speech: {
          label: "Речь",
          description: "Устройства захвата, язык расшифровки, фоновый буфер и автослушание.",
          groups: [
            {
              title: "Распознавание речи",
              description: "Что именно слушает приложение и на каком языке расшифровывает.",
              rows: [
                {
                  id: "capture_device_uid",
                  label: "Устройство захвата",
                  hint: "Снимается звук только этого выхода. Что играет в другие устройства — в захват не попадёт.",
                  control: {
                    kind: "select",
                    value: "Системный вывод",
                    options: ["Системный вывод", "MacBook Pro Speakers", "AirPods Pro"],
                  },
                },
                {
                  id: "stt_language",
                  label: "Язык распознавания",
                  hint: "Whisper распознаёт точнее, когда язык задан явно.",
                  control: {
                    kind: "select",
                    value: "Русский",
                    options: [
                      "Русский",
                      "English",
                      "Українська",
                      "Deutsch",
                      "Español",
                      "Français",
                      "Автоопределение",
                    ],
                  },
                  disabledBy: { row: "stt_translate", when: true },
                },
                {
                  id: "stt_translate",
                  label: "Перевод на английский",
                  hint: "Речь на любом языке приходит в чат по-английски.",
                  control: { kind: "switch", value: false },
                },
                {
                  id: "buffer_enabled",
                  label: "Фоновый буфер",
                  hint: "Подхватывает сказанное за секунды до нажатия записи.",
                  control: { kind: "switch", value: true },
                },
                {
                  id: "buffer_seconds",
                  label: "Глубина буфера",
                  hint: "Сколько секунд звука держится в памяти.",
                  control: {
                    kind: "slider",
                    value: 4,
                    min: 4,
                    max: 10,
                    step: 1,
                    unit: "{value} с",
                  },
                  disabledBy: { row: "buffer_enabled", when: false },
                },
              ],
            },
            {
              title: "Автослушание",
              description:
                "Слушает обе стороны разговора и отвечает на реплики собеседника без нажатий.",
              rows: [
                {
                  id: "auto_mode_enabled",
                  label: "Включать при запуске",
                  hint: "Иначе включается кнопкой в шапке окна или сочетанием клавиш.",
                  control: { kind: "switch", value: false },
                },
                {
                  id: "auto_reply_instant",
                  label: "Отвечать без нажатия",
                  hint: "Иначе ответ уходит по клавише — вы решаете, на что отвечать.",
                  control: { kind: "switch", value: false },
                },
                {
                  id: "auto_mic_device_uid",
                  label: "Микрофон",
                  hint: "С него берётся ваша речь — вторая сторона разговора.",
                  control: {
                    kind: "select",
                    value: "Системный микрофон",
                    options: ["Системный микрофон", "MacBook Pro Microphone", "AirPods Pro"],
                  },
                },
                {
                  id: "auto_silence_ms",
                  label: "Пауза до конца реплики",
                  hint: "Столько тишины считается концом фразы.",
                  control: {
                    kind: "slider",
                    value: 700,
                    min: 300,
                    max: 2000,
                    step: 50,
                    unit: "{value} мс",
                  },
                },
                {
                  id: "auto_min_utterance_ms",
                  label: "Минимальная реплика",
                  hint: "Всё короче считается шумом и не распознаётся.",
                  control: {
                    kind: "slider",
                    value: 400,
                    min: 200,
                    max: 3000,
                    step: 50,
                    unit: "{value} мс",
                  },
                },
                {
                  id: "auto_max_utterance_secs",
                  label: "Максимальная реплика",
                  hint: "Монолог длиннее режется на части.",
                  control: {
                    kind: "slider",
                    value: 30,
                    min: 5,
                    max: 120,
                    step: 5,
                    unit: "{value} с",
                  },
                },
              ],
            },
          ],
        },
        hotkeys: {
          label: "Клавиши",
          description:
            "Сочетания записи, отправки, снимка и суфлёра. Работают, пока запущено основное окно.",
          groups: [],
        },
        "quick-actions": {
          label: "Действия",
          description: "Кнопки над полем ввода и цифровые сочетания к ним.",
          groups: [],
        },
        window: {
          label: "Окно",
          description: "Модификаторы со стрелками: сдвиг, размер и скролл чата.",
          groups: [
            {
              title: "Сдвиг, размер и скролл",
              description:
                "Модификатор и его шаг настраиваются вместе — они работают только в паре.",
              rows: [
                {
                  id: "move_step",
                  label: "Передвинуть",
                  hint: "Модификатор со стрелками двигает окно, шаг — на сколько пикселей за нажатие.",
                  control: {
                    kind: "slider",
                    value: 20,
                    min: 1,
                    max: 200,
                    step: 5,
                    unit: "{value}px",
                  },
                },
                {
                  id: "resize_step",
                  label: "Изменить размер",
                  hint: "Модификатор со стрелками меняет ширину и высоту окна.",
                  control: {
                    kind: "slider",
                    value: 20,
                    min: 1,
                    max: 200,
                    step: 5,
                    unit: "{value}px",
                  },
                },
                {
                  id: "scroll_step",
                  label: "Скролл переписки",
                  hint: "Прокрутка переписки стрелками вверх и вниз.",
                  control: {
                    kind: "slider",
                    value: 120,
                    min: 10,
                    max: 1000,
                    step: 5,
                    unit: "{value}px",
                  },
                },
              ],
            },
          ],
        },
        behavior: {
          label: "Поведение",
          description: "Демонстрация экрана, автоотправка, превью HTML, суфлёр и буфер обмена.",
          groups: [
            {
              title: "Поведение",
              description: "Как приложение ведёт себя во время работы.",
              rows: [
                {
                  id: "screen_share_visible",
                  label: "Показывать окно при демонстрации экрана",
                  hint: "По умолчанию окно вырезано из захвата — собеседники его не видят. Включите, только если хотите показать его намеренно.",
                  control: { kind: "switch", value: false },
                },
                {
                  id: "auto_send",
                  label: "Отправлять сразу после распознавания",
                  hint: "Расшифровка уходит в чат без нажатия отправки.",
                  control: { kind: "switch", value: false },
                },
                {
                  id: "copy_results_to_clipboard",
                  label: "Копировать в буфер обмена",
                  hint: "Расшифровки и снимки экрана.",
                  control: { kind: "switch", value: true },
                },
                {
                  id: "auto_preview_html",
                  label: "Открывать превью HTML",
                  hint: "Если в ответе есть HTML-блок, рядом с чатом открывается панель просмотра.",
                  control: { kind: "switch", value: true },
                },
                {
                  id: "teleprompter_resume",
                  label: "Суфлёр продолжает с места остановки",
                  hint: "Иначе текст каждый раз начинается сверху.",
                  control: { kind: "switch", value: true },
                },
              ],
            },
          ],
        },
        appearance: {
          label: "Вид",
          description: "Язык, тема, прозрачность окна и размер шрифта чата.",
          groups: [
            {
              title: "Вид",
              description: "Оформление основного окна с чатом.",
              rows: [
                {
                  id: "theme",
                  label: "Тема",
                  hint: "«Как в системе» переключается вместе с оформлением macOS или Windows.",
                  control: {
                    kind: "select",
                    value: "Тёмная",
                    options: ["Как в системе", "Светлая", "Тёмная"],
                  },
                },
                {
                  id: "language",
                  label: "Язык интерфейса",
                  hint: "«Как в системе» берёт язык из настроек macOS или Windows.",
                  control: {
                    kind: "select",
                    value: "Русский",
                    options: ["Как в системе", "Русский", "English"],
                  },
                },
                {
                  id: "chat_font_size",
                  label: "Размер шрифта чата",
                  hint: "Влияет на текст переписки и код в ответах.",
                  control: {
                    kind: "slider",
                    value: 13.5,
                    min: 10,
                    max: 20,
                    step: 0.5,
                    unit: "{value}px",
                  },
                },
                {
                  id: "window_opacity",
                  label: "Прозрачность окна",
                  hint: "Сквозь окно видно то, что под ним.",
                  control: {
                    kind: "slider",
                    value: 90,
                    min: 75,
                    max: 100,
                    step: 5,
                    unit: "{value}%",
                  },
                },
              ],
            },
          ],
        },
      },
    },
    contexts: {
      summary: "матер.: {docs} · папок: {folders}",
      addDoc: "Материал",
      addFolder: "Папка",
      import: "Импорт",
      edit: "Редактировать",
      remove: "Удалить материал",
      folders: ["Вакансия", "О себе"],
      // Seeded user data.
      docs: [
        { id: "jd", name: "Описание вакансии.md", size: "4.2 тыс. симв.", folder: "Вакансия" },
        { id: "stack", name: "Стек команды.txt", size: "1.1 тыс. симв.", folder: "Вакансия" },
        { id: "cv", name: "Резюме.md", size: "6.8 тыс. симв.", folder: "О себе" },
        { id: "stories", name: "Истории проектов.md", size: "12 тыс. симв.", folder: "О себе" },
      ],
    },
    presets: {
      ownTitle: "Свои пресеты",
      ownDescription:
        "Препромпт подставляется в начало системного промпта чата и выбирается в тулбаре под полем ввода.",
      add: "Добавить пресет",
      edit: "Изменить пресет",
      remove: "Удалить пресет",
      length: "{count} симв.",
      builtInTitle: "Встроенные",
      builtInDescription:
        "Приходят вместе с приложением и обновляются сами — их видно в том же списке в чате.",
      // Seeded user data.
      items: [
        {
          name: "Кратко и по делу",
          text: "Отвечай по делу, без вступлений. Максимум пять предложений, если не просят подробнее.",
        },
        {
          name: "Собеседование по Go",
          text: "Ты кандидат на позицию Go-разработчика. Отвечай от первого лица, приводи короткие примеры кода.",
        },
      ],
      builtIn: [
        "Golang",
        "Hr Interview",
        "System Design",
        "Frontend",
        "Java",
        "Python",
        "C#",
        "DevOps",
      ],
    },
    permissions: {
      title: "Разрешения macOS",
      description:
        "Система выдаёт их только по запросу. Нажмите «Выдать» — macOS спросит подтверждение; если окно не появилось, доступ уже решён и меняется в системных настройках.",
      recheck: "Проверить заново",
      grant: "Выдать",
      openSettings: "Настройки",
      states: { granted: "выдан", denied: "нет доступа", unknown: "не выдан" },
      items: [
        {
          id: "audio",
          label: "Запись системного звука",
          purpose:
            "Приложение слышит собеседника и расшифровывает речь. Без него запускать нечего.",
          need: "обязателен",
          granted: true,
        },
        {
          id: "microphone",
          label: "Микрофон",
          purpose: "Нужен автослушанию, чтобы отделить вашу речь от речи собеседника.",
          need: "нужен автослушанию",
          granted: true,
        },
        {
          id: "screen",
          label: "Запись экрана",
          purpose: "Нужна снимку области экрана. Без неё работает всё остальное.",
          need: "необязателен",
          granted: false,
        },
      ],
    },
    updates: {
      versionTitle: "Версия",
      versionDescription: "Установленная сборка harpyhare.ai.",
      check: "Проверить",
      upToDate: "Установлена последняя версия",
      autoCheckNote: "Проверка идёт автоматически при запуске и раз в шесть часов.",
      notesLabel: "Что нового",
      notes: [
        "Суфлёр запоминает место остановки.",
        "Автослушание отделяет вашу речь от речи собеседника.",
        "Окно сворачивается в клубок и не мешает демонстрации экрана.",
      ],
    },
  },

  hud: {
    frameLabel: "Основное окно",
    listeningLabel: "Состояние захвата",
    listening: {
      recording: { word: "Пишу", announcement: "Идёт запись системного звука" },
      auto: { word: "Слушаю", announcement: "Автослушание включено, звук пишется" },
      armed: {
        word: "Наготове",
        announcement: "Фоновый буфер держит последние секунды звука",
      },
      transcribing: { word: "Распознаю", announcement: "Распознаю речь" },
      off: { word: "Не слушает", announcement: "Ничего не пишется" },
      error: { word: "Ошибка", announcement: "Ошибка" },
    },
    pauseTitle: "Пауза — выключить фоновый буфер и автослушание",
    resumeTitle: "Слушать — включить фоновый буфер",
    orbLabels: {
      recording: "Идёт запись — нажмите, чтобы развернуть",
      auto: "Автослушание — нажмите, чтобы развернуть",
      armed: "Наготове — нажмите, чтобы развернуть",
      transcribing: "Распознаю — нажмите, чтобы развернуть",
      answer: "Ответ готов — нажмите, чтобы развернуть",
      off: "Не слушает — нажмите, чтобы развернуть",
      error: "Ошибка — нажмите, чтобы развернуть",
    },
    orbAnswerAnnouncement: "Ответ готов",
    contextUsage: "Контекст чата: {used} из {max} токенов (по последнему запросу)",
    collapse: "Свернуть в клубок",
    collapseRestore: "{label} — вернуть: {combo}",
    stop: "Стоп — вернуться в лаунчер",
    quit: "Выйти из приложения",
    teleprompter: "Суфлёр",
    copyLast: "Копировать последний ответ",
    copied: "Скопировано",
    hotkeys: "Горячие клавиши",
    closeHotkeys: "Закрыть",
    autoMode: {
      active: { label: "Автослушание включено", action: "нажмите, чтобы выключить" },
      idle: {
        label: "Автослушание выключено",
        action: "нажмите, чтобы слушать собеседника и себя",
      },
    },
    screenShare: {
      visible: { label: "Видно при демонстрации экрана", action: "нажмите, чтобы скрыть" },
      hidden: { label: "Скрыто при демонстрации экрана", action: "нажмите, чтобы показывать" },
    },
    chats: {
      nav: "Чаты",
      chat: "Чат {number}",
      closeChat: "Закрыть чат {number}",
      newChat: "Новый чат",
      duplicate: "Дубликат чата — те же параметры, без сообщений",
    },
    answer: {
      emptyHint: "Удерживайте, пока говорит собеседник.",
      emptyNoCombo: "Клавиша записи не назначена — задайте её в настройках.",
      copyMessage: "Копировать сообщение",
      resendMessage: "Переотправить (всё, что ниже, будет заменено новым ответом)",
      removeMessage: "Удалить сообщение",
      jumpToBottom: "↓ Вниз",
    },
    thinking: { label: "Думает…", seconds: "{seconds}с", minutes: "{minutes}м {seconds}с" },
    autoTranscript: {
      title: "Расшифровка",
      empty: "Слушаю — реплики появятся здесь.",
      instant: "Отвечаю на реплики собеседника сама.",
      answer: "Ответить",
      answered: "Всё услышанное уже ушло в чат.",
      pending: "Не отправлено реплик: {count}.",
      speakers: { interviewer: "Интервьюер", user: "Я" },
      turns: [
        {
          speaker: "interviewer",
          text: "Расскажите, как вы разруливаете гонки в конкурентном коде.",
        },
        { speaker: "user", text: "Обычно начинаю с того, что делаю состояние неизменяемым." },
        { speaker: "interviewer", text: "А если состояние всё-таки общее — что тогда?" },
      ],
    },
    composer: {
      placeholder: "Расшифровка появится здесь — или напиши вопрос сам",
      quickActionsLabel: "Быстрые действия",
      clearHistory: "Очистить историю чата",
      context: "Контекст чата",
      captureRegion: "Снимок области экрана",
      requestParams: "Параметры запроса",
      closeRequestParams: "Закрыть параметры запроса",
      retryTranscription: "Повторить распознавание",
      stopAnswer: "Остановить ответ",
      send: "Отправить",
      sendTitle: "Отправить (⏎)",
      params: {
        model: "Модель",
        preset: "Препромпт",
        thinking: "Thinking",
        webSearch: "Веб-поиск",
      },
      noPreset: "Без препромпта",
      models: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
      attachmentAlt: "Вложение",
      removeAttachment: "Удалить вложение",
    },
    preview: {
      title: "Превью",
      copyCode: "Копировать код",
      close: "Закрыть",
      body: "Панель превью открывается сама, когда в ответе есть HTML-блок.",
    },
    teleprompterPanel: {
      restart: "Сначала",
      play: "Воспроизвести (Пробел)",
      pause: "Пауза (Пробел)",
      speed: "Скорость",
      font: "Шрифт",
      close: "Закрыть (Esc)",
      empty: "Нет ответа для суфлёра",
    },
    connectivity: {
      title: "Ожидается подключение к интернету",
      hint: "Приложению нужен интернет. Проверь сеть или VPN — экран пропадёт автоматически.",
    },
    notifications: {
      details: "Подробнее",
      collapse: "Свернуть",
      copy: "Копировать",
      copied: "Скопировано",
      dismiss: "Закрыть уведомление",
      items: [
        {
          id: "silence",
          tone: "warning",
          title: "Тишина",
          body: "Нечего распознавать. Если звук играл — проверьте право «Запись системного звука» и устройство захвата.",
        },
        {
          id: "network",
          tone: "warning",
          title: "Нет соединения",
          body: "Проверьте интернет или VPN.",
        },
        {
          id: "contextTooLong",
          tone: "danger",
          title: "Слишком длинный контекст",
          body: "Переписка не помещается в окно модели. Начните новый чат или уберите материалы.",
        },
      ],
    },
    htmlBlock: { lines: "{count} строк", openPreview: "Открыть превью" },
  },
};
