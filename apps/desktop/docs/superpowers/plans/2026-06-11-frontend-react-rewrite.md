# Frontend → React 19 + shadcn/ui Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переписать frontend itech с vanilla TS на React 19 + Vite + Tailwind v4 + shadcn/ui + react-markdown, со слоями ipc/lib/hooks/components и тёмной графит-оксблад темой, сохранив контракт бэкенда 1:1.

**Architecture:** Только слой `src/ipc/` знает про Tauri (типизированные команды/события + браузерный мок). `src/lib/` — чистая протестированная логика. `src/hooks/` — по хуку на слайс контракта (mocked-IPC-тесты). `src/components/` на shadcn-примитивах, тонкий `App.tsx`. Rust не трогаем.

**Tech Stack:** React 19, Vite 6, TypeScript strict, Tailwind v4, shadcn/ui (new-york), lucide-react, react-markdown + remark-gfm, vitest + @testing-library/react.

**Спека:** `docs/superpowers/specs/2026-06-11-frontend-react-rewrite-design.md` — читать перед началом.

**Команда тестов:** `npx vitest run`. **Сборка фронта:** `npm run build` (tsc + vite, строгий). Рабочий каталог: `/Users/mark/i.tech`.

---

## Структура файлов

```
i.tech/
├── index.html                 # <div id="root"> + main.tsx (MODIFY)
├── overlay.html               # перекрасить в чёрный+красный (MODIFY)
├── components.json            # конфиг shadcn (CREATE)
├── vite.config.ts             # +react +tailwind +alias (MODIFY)
├── tsconfig.json              # +jsx +paths (MODIFY)
├── package.json               # деп-свопы (MODIFY через npm)
└── src/
    ├── main.tsx               # React root (CREATE)
    ├── App.tsx                # композиция (CREATE)
    ├── index.css              # Tailwind + @theme токены (CREATE)
    ├── vite-env.d.ts          # типы (CREATE)
    ├── ipc/
    │   ├── types.ts           # Settings, RecorderState, payloads (CREATE)
    │   ├── env.ts             # isTauri() (CREATE)
    │   ├── commands.ts        # типизированные invoke (CREATE)
    │   ├── events.ts          # типизированные listen (CREATE)
    │   └── commands.test.ts   # браузерные заглушки (CREATE)
    ├── lib/
    │   ├── composer.ts        # перенос из src/ (MOVE)
    │   ├── composer.test.ts   # перенос (MOVE)
    │   ├── window-controls.ts # перенос (MOVE)
    │   ├── window-controls.test.ts # перенос (MOVE)
    │   └── utils.ts           # cn() (CREATE)
    ├── hooks/
    │   ├── useClaudeStream.ts + .test.ts
    │   ├── useAttachments.ts  + .test.ts
    │   ├── useSettings.ts     + .test.ts
    │   ├── useRecorder.ts
    │   ├── useTranscription.ts
    │   ├── useWindowControls.ts
    │   └── usePttSuspend.ts
    └── components/
        ├── ui/                # shadcn-примитивы (через CLI)
        ├── StatusBar.tsx
        ├── PermissionBanner.tsx
        ├── HotkeyHints.tsx
        ├── AttachmentChip.tsx
        ├── Composer.tsx
        ├── AnswerPanel.tsx
        └── SettingsDialog.tsx
```

Удаляются в конце: `src/main.ts`, `src/styles.css`, `src/markdown.ts`; деп `marked`, `dompurify`.

---

### Task 1: Тулинг — React + Tailwind v4 + конфиги, рендерится «hello root»

**Files:**
- Modify: `package.json` (через npm), `vite.config.ts`, `tsconfig.json`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`, `tsconfig.node.json`

- [ ] **Step 1: Поставить зависимости**

```bash
npm i react@^19 react-dom@^19 react-markdown remark-gfm lucide-react clsx tailwind-merge class-variance-authority
npm i -D @vitejs/plugin-react @types/react @types/react-dom tailwindcss@^4 @tailwindcss/vite tw-animate-css @testing-library/react @testing-library/dom
```

- [ ] **Step 2: `vite.config.ts`** — заменить целиком:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // Multi-page build: оверлей — отдельное окно (overlay.html).
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        overlay: "overlay.html",
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
```

- [ ] **Step 3: `tsconfig.json`** — заменить целиком (добавлен jsx, paths, references):

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: `tsconfig.node.json`** — создать (для vite.config):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

(если `@types/node` не стоит — `npm i -D @types/node`)

- [ ] **Step 5: `src/index.css`** — создать (Tailwind v4 + графит/оксблад токены, dark-only):

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/* Прозрачность окна Tauri управляется слайдером настроек. */
:root {
  --app-opacity: 1;

  --radius: 0.625rem;

  /* Графит-канвас */
  --background: oklch(0.145 0.004 285);     /* #0A0A0B near-black */
  --foreground: oklch(0.94 0 0);            /* #EDEDED */
  --card: oklch(0.18 0.003 285);            /* #121214 приподнятые панели */
  --card-foreground: oklch(0.94 0 0);
  --popover: oklch(0.18 0.003 285);
  --popover-foreground: oklch(0.94 0 0);
  --muted: oklch(0.22 0.003 285);
  --muted-foreground: oklch(0.62 0.006 285);/* #8A8A92 */

  /* Оксблад-акцент */
  --primary: oklch(0.45 0.16 18);           /* #9B1C2E */
  --primary-foreground: oklch(0.97 0.01 30);
  --secondary: oklch(0.22 0.004 285);
  --secondary-foreground: oklch(0.94 0 0);
  --accent: oklch(0.24 0.02 18);
  --accent-foreground: oklch(0.94 0 0);
  --destructive: oklch(0.55 0.2 18);

  --border: oklch(1 0 0 / 8%);
  --input: oklch(1 0 0 / 10%);
  --ring: oklch(0.45 0.16 18 / 50%);

  /* Доп. токены приложения */
  --primary-hover: oklch(0.5 0.18 20);      /* #B5233A */
  --recording: oklch(0.62 0.2 18);          /* #E23B4E */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-recording: var(--recording);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
}

html,
body {
  margin: 0;
  height: 100%;
  background: transparent !important; /* окно Tauri прозрачное */
}

#root {
  height: 100vh;
}

* {
  border-color: var(--border);
}
```

- [ ] **Step 6: `src/vite-env.d.ts`** — создать:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 7: `src/App.tsx`** — временная заглушка (заменится в Task 13):

```tsx
export default function App() {
  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground font-mono">
      itech
    </div>
  );
}
```

- [ ] **Step 8: `src/main.tsx`** — создать:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: `index.html`** — заменить `<body>` и script:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>itech</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 10: Проверка сборки**

Run: `npm run build`
Expected: tsc без ошибок; vite собирает `dist/` с `main` и `overlay`. (Старые `src/main.ts`/`styles.css`/`markdown.ts` ещё лежат, но не импортируются из index.html — на сборку main не влияют; они уедут в Task 14. Если tsc ругается на старый `src/main.ts` из-за `include:["src"]` — это ожидаемо и чинится в Task 3, где он переезжает; на этом шаге достаточно, чтобы vite-сборка main прошла. Если tsc блокирует — временно проверь только `npx vite build`, полноценный `npm run build` зелёным станет после Task 3.)

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "chore: React 19 + Vite + Tailwind v4 каркас (графит/оксблад токены)"
```

---

### Task 2: shadcn/ui — init и примитивы

**Files:**
- Create: `components.json`, `src/lib/utils.ts`, `src/components/ui/*`

- [ ] **Step 1: `src/lib/utils.ts`** — создать (нужен shadcn-компонентам):

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: `components.json`** — создать (конфиг shadcn для Tailwind v4 + Vite):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 3: Добавить примитивы через CLI**

```bash
npx shadcn@latest add button textarea dialog select switch slider input scroll-area badge tooltip label --yes
```

Это сгенерирует `src/components/ui/{button,textarea,dialog,select,switch,slider,input,scroll-area,badge,tooltip,label}.tsx` и может дописать в `src/index.css`. Если CLI прервётся на интерактивном вопросе — повторить с уже существующим `components.json` (он отвечает на большинство). Если не сработает совсем — компоненты копируются вручную со страниц `https://ui.shadcn.com/docs/components/<name>` (это и есть канонический источник этих vendored-файлов).

- [ ] **Step 4: Проверка**

Run: `npx tsc --noEmit && npx vite build`
Expected: примитивы компилируются, сборка зелёная. (Полный `npm run build` — после Task 3.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: shadcn/ui init + примитивы (button/textarea/dialog/select/switch/slider/input/scroll-area/badge/tooltip/label)"
```

---

### Task 3: Перенос чистой логики в `src/lib/`

**Files:**
- Move: `src/composer.ts` → `src/lib/composer.ts`, `src/composer.test.ts` → `src/lib/composer.test.ts`, `src/window-controls.ts` → `src/lib/window-controls.ts`, `src/window-controls.test.ts` → `src/lib/window-controls.test.ts`

- [ ] **Step 1: Переместить файлы (логика без изменений)**

```bash
git mv src/composer.ts src/lib/composer.ts
git mv src/composer.test.ts src/lib/composer.test.ts
git mv src/window-controls.ts src/lib/window-controls.ts
git mv src/window-controls.test.ts src/lib/window-controls.test.ts
```

- [ ] **Step 2: Временно исключить старый main.ts из импорт-графа**

Старый `src/main.ts` импортирует `./composer` и `./window-controls`, которых больше нет на старом месте → tsc упадёт. `src/main.ts` удаляется в Task 14, но чтобы `npm run build` был зелёным уже сейчас, удалим его импорт-зависимость прямо сейчас: переименуем старый монолит, чтобы tsc его не видел.

```bash
git mv src/main.ts src/main.legacy.ts.txt
```

(`.txt` не попадёт в tsc/vite; финально удалится в Task 14 вместе со styles.css/markdown.ts)

- [ ] **Step 3: Проверка тестов и сборки**

Run: `npx vitest run`
Expected: 12 тестов проходят (composer 7 + window-controls ... — фактическое число как было).

Run: `npm run build`
Expected: tsc + vite зелёные (легаси-монолит больше не в графе).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: чистая логика composer/window-controls → src/lib/ (тесты без изменений)"
```

---

### Task 4: Слой ipc — типы, env, команды, события (+тест браузерных заглушек)

**Files:**
- Create: `src/ipc/types.ts`, `src/ipc/env.ts`, `src/ipc/commands.ts`, `src/ipc/events.ts`, `src/ipc/commands.test.ts`

- [ ] **Step 1: `src/ipc/types.ts`** — создать:

```ts
import type { ImagePayload } from "@/lib/composer";

export type { ImagePayload };

export interface Settings {
  anthropic_api_key: string;
  groq_api_key: string;
  model: string;
  system_prompt: string;
  hotkey: string;
  auto_send: boolean;
  window_opacity: number;
  move_step: number;
}

export const DEFAULT_SETTINGS: Settings = {
  anthropic_api_key: "",
  groq_api_key: "",
  model: "claude-opus-4-8",
  system_prompt: "",
  hotkey: "V",
  auto_send: false,
  window_opacity: 1,
  move_step: 20,
};

export const MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"] as const;

export type RecorderState = "idle" | "recording" | "transcribing";

/** Карта имя-события → тип payload (для типобезопасного listen). */
export interface EventMap {
  "state-changed": RecorderState;
  "transcript-ready": string;
  "stt-error": string;
  "llm-delta": string;
  "llm-done": void;
  "llm-error": string;
}
```

- [ ] **Step 2: `src/ipc/env.ts`** — создать:

```ts
/** Вне Tauri (обычный браузер для визуальной проверки) invoke/listen недоступны. */
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
```

- [ ] **Step 3: `src/ipc/commands.ts`** — создать (в браузере — безопасные заглушки):

```ts
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./env";
import { DEFAULT_SETTINGS, type ImagePayload, type Settings } from "./types";

export async function sendToClaude(text: string, images: ImagePayload[]): Promise<void> {
  if (!isTauri()) return;
  await invoke("send_to_claude", { text, images });
}

export async function cancelStream(): Promise<void> {
  if (!isTauri()) return;
  await invoke("cancel_stream");
}

export async function retryTranscription(): Promise<void> {
  if (!isTauri()) return;
  await invoke("retry_transcription");
}

export async function getSettings(): Promise<Settings> {
  if (!isTauri()) return DEFAULT_SETTINGS;
  return invoke<Settings>("get_settings");
}

export async function setSettings(newSettings: Settings): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_settings", { newSettings });
}

export async function moveWindowBy(dx: number, dy: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("move_window_by", { dx, dy });
}

export async function setPttSuspended(suspended: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_ptt_suspended", { suspended });
}

export async function openAudioPermissionSettings(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_audio_permission_settings");
}

export async function captureAvailable(): Promise<boolean> {
  if (!isTauri()) return true;
  return invoke<boolean>("capture_available");
}

export async function openExternal(url: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_external", { url });
}
```

- [ ] **Step 4: `src/ipc/events.ts`** — создать (типизированный listen; в браузере — no-op):

```ts
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./env";
import type { EventMap } from "./types";

export type Unlisten = () => void;

/**
 * Подписка на событие Rust. Возвращает функцию отписки.
 * В браузере (не Tauri) — no-op с пустой отпиской.
 */
export function onEvent<K extends keyof EventMap>(
  name: K,
  handler: (payload: EventMap[K]) => void,
): Unlisten {
  if (!isTauri()) return () => {};
  let live = true;
  let off: Unlisten = () => {};
  void listen<EventMap[K]>(name, (e) => handler(e.payload)).then((un) => {
    if (live) off = un;
    else un(); // успели отписаться до резолва
  });
  return () => {
    live = false;
    off();
  };
}
```

- [ ] **Step 5: `src/ipc/commands.test.ts`** — создать (failing-тест браузерных заглушек):

```ts
import { describe, expect, it } from "vitest";
import { captureAvailable, getSettings, moveWindowBy, sendToClaude } from "./commands";
import { DEFAULT_SETTINGS } from "./types";

// jsdom — не Tauri (нет __TAURI_INTERNALS__) → команды-заглушки безопасны.
describe("commands в браузерном режиме", () => {
  it("getSettings отдаёт дефолты", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });
  it("captureAvailable → true (нет баннера в превью)", async () => {
    expect(await captureAvailable()).toBe(true);
  });
  it("мутации не бросают и резолвятся в undefined", async () => {
    await expect(sendToClaude("hi", [])).resolves.toBeUndefined();
    await expect(moveWindowBy(10, 0)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Прогон → красный**

Run: `npx vitest run src/ipc/commands.test.ts`
Expected: красный (модули `commands`/`types` ещё не существовали бы — но мы их создали в шагах 1-4, поэтому здесь тест ЗЕЛЁНЫЙ сразу). Это допустимо: слой ipc — обёртки без собственной нетривиальной логики; тест фиксирует контракт заглушек. Если хочется честного красного — закоммить тест до шага 3 и убедись в падении на отсутствии `commands`.

- [ ] **Step 7: Прогон → зелёный**

Run: `npx vitest run src/ipc/commands.test.ts && npm run build`
Expected: 3 теста проходят; сборка зелёная.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: слой ipc — типы, env, типизированные команды/события + тест заглушек"
```

---

### Task 5: Хук `useClaudeStream` (стрим ответа)

**Files:**
- Create: `src/hooks/useClaudeStream.ts`, `src/hooks/useClaudeStream.test.ts`

- [ ] **Step 1: `src/hooks/useClaudeStream.test.ts`** — создать (failing):

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventMap } from "@/ipc/types";

// Мок IPC: ловим обработчики событий и команды.
const handlers = new Map<string, (p: unknown) => void>();
const sendToClaude = vi.fn(async () => {});
const cancelStream = vi.fn(async () => {});

vi.mock("@/ipc/commands", () => ({
  sendToClaude: (...a: unknown[]) => sendToClaude(...a),
  cancelStream: (...a: unknown[]) => cancelStream(...a),
}));
vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, h: (p: unknown) => void) => {
    handlers.set(name, h);
    return () => handlers.delete(name);
  },
}));

function emit<K extends keyof EventMap>(name: K, payload: EventMap[K]): void {
  handlers.get(name)?.(payload);
}

import { useClaudeStream } from "./useClaudeStream";

beforeEach(() => {
  handlers.clear();
  sendToClaude.mockClear();
  cancelStream.mockClear();
  // rAF → синхронно, чтобы дельты рендерились детерминированно в тесте
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("useClaudeStream", () => {
  it("send запускает стрим и копит дельты до llm-done", async () => {
    const { result } = renderHook(() => useClaudeStream());
    await act(async () => {
      await result.current.send("вопрос", []);
    });
    expect(sendToClaude).toHaveBeenCalledWith("вопрос", []);
    expect(result.current.streaming).toBe(true);
    act(() => emit("llm-delta", "При"));
    act(() => emit("llm-delta", "вет"));
    expect(result.current.answer).toBe("Привет");
    act(() => emit("llm-done", undefined));
    expect(result.current.streaming).toBe(false);
  });

  it("llm-error останавливает стрим и отдаёт ошибку", async () => {
    const { result } = renderHook(() => useClaudeStream());
    await act(async () => {
      await result.current.send("q", []);
    });
    act(() => emit("llm-error", "Anthropic перегружен"));
    expect(result.current.streaming).toBe(false);
    expect(result.current.error).toBe("Anthropic перегружен");
  });

  it("stop отменяет стрим", async () => {
    const { result } = renderHook(() => useClaudeStream());
    await act(async () => {
      await result.current.send("q", []);
    });
    act(() => result.current.stop());
    expect(cancelStream).toHaveBeenCalled();
    expect(result.current.streaming).toBe(false);
  });

  it("повторный send очищает прошлый ответ", async () => {
    const { result } = renderHook(() => useClaudeStream());
    await act(async () => result.current.send("q1", []));
    act(() => emit("llm-delta", "старый"));
    await act(async () => result.current.send("q2", []));
    expect(result.current.answer).toBe("");
    await waitFor(() => expect(result.current.streaming).toBe(true));
  });
});
```

- [ ] **Step 2: Прогон → красный**

Run: `npx vitest run src/hooks/useClaudeStream.test.ts`
Expected: FAIL — нет `./useClaudeStream`.

- [ ] **Step 3: `src/hooks/useClaudeStream.ts`** — создать:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelStream, sendToClaude } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import type { ImagePayload } from "@/ipc/types";

export interface ClaudeStream {
  answer: string;
  streaming: boolean;
  error: string | null;
  send: (text: string, images: ImagePayload[]) => Promise<void>;
  stop: () => void;
}

export function useClaudeStream(): ClaudeStream {
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Буфер дельт + rAF-коалессинг: один setState на кадр, без O(n²) рендеров.
  const buf = useRef("");
  const pending = useRef(false);

  const flush = useCallback(() => {
    pending.current = false;
    setAnswer(buf.current);
  }, []);

  useEffect(() => {
    const offDelta = onEvent("llm-delta", (chunk) => {
      buf.current += chunk;
      if (!pending.current) {
        pending.current = true;
        requestAnimationFrame(flush);
      }
    });
    const offDone = onEvent("llm-done", () => {
      pending.current = false;
      setAnswer(buf.current);
      setStreaming(false);
    });
    const offError = onEvent("llm-error", (msg) => {
      setStreaming(false);
      setError(msg);
    });
    return () => {
      offDelta();
      offDone();
      offError();
    };
  }, [flush]);

  const send = useCallback(async (text: string, images: ImagePayload[]) => {
    buf.current = "";
    pending.current = false;
    setAnswer("");
    setError(null);
    setStreaming(true);
    try {
      await sendToClaude(text, images);
    } catch (e) {
      setStreaming(false);
      setError(String(e));
    }
  }, []);

  const stop = useCallback(() => {
    void cancelStream();
    setStreaming(false);
  }, []);

  return { answer, streaming, error, send, stop };
}
```

- [ ] **Step 4: Прогон → зелёный**

Run: `npx vitest run src/hooks/useClaudeStream.test.ts`
Expected: 4 теста проходят.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: useClaudeStream — стрим ответа с rAF-коалессингом (TDD)"
```

---

### Task 6: Хук `useAttachments` (вложения)

**Files:**
- Create: `src/hooks/useAttachments.ts`, `src/hooks/useAttachments.test.ts`

- [ ] **Step 1: `src/hooks/useAttachments.test.ts`** — создать (failing):

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Мокаем тяжёлые браузерные API даунскейла, чтобы тест шёл в jsdom.
vi.mock("@/lib/composer", async (orig) => {
  const real = await orig<typeof import("@/lib/composer")>();
  return { ...real }; // используем реальные чистые функции (лимит/фактор)
});

import { useAttachments } from "./useAttachments";

function imgItem(type = "image/png"): DataTransferItem {
  return {
    kind: "file",
    type,
    getAsFile: () => new File([new Uint8Array(8)], "s.png", { type }),
  } as unknown as DataTransferItem;
}
function clipboard(items: DataTransferItem[]): DataTransferItemList {
  return items as unknown as DataTransferItemList;
}

describe("useAttachments", () => {
  it("добавляет вложение из вставки (мелкий файл — без даунскейла)", async () => {
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      await result.current.addFromPaste(clipboard([imgItem()]));
    });
    expect(result.current.attachments.length).toBe(1);
    expect(result.current.attachments[0].payload.media_type).toBe("image/png");
  });

  it("не превышает лимит 5", async () => {
    const { result } = renderHook(() => useAttachments());
    const many = Array.from({ length: 7 }, () => imgItem());
    await act(async () => {
      await result.current.addFromPaste(clipboard(many));
    });
    expect(result.current.attachments.length).toBe(5);
  });

  it("remove удаляет по индексу, clear очищает", async () => {
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      await result.current.addFromPaste(clipboard([imgItem(), imgItem()]));
    });
    act(() => result.current.remove(0));
    expect(result.current.attachments.length).toBe(1);
    act(() => result.current.clear());
    expect(result.current.attachments.length).toBe(0);
  });

  it("игнорирует вставку без картинок", async () => {
    const { result } = renderHook(() => useAttachments());
    const textItem = { kind: "string", type: "text/plain", getAsFile: () => null } as unknown as DataTransferItem;
    await act(async () => {
      await result.current.addFromPaste(clipboard([textItem]));
    });
    expect(result.current.attachments.length).toBe(0);
  });
});
```

- [ ] **Step 2: Прогон → красный**

Run: `npx vitest run src/hooks/useAttachments.test.ts`
Expected: FAIL — нет `./useAttachments`.

- [ ] **Step 3: `src/hooks/useAttachments.ts`** — создать:

```ts
import { useCallback, useState } from "react";
import {
  acceptedNewAttachments,
  ATTACHMENT_LIMIT,
  downscaleFactor,
  extractImageItems,
  toImagePayload,
  type ImagePayload,
} from "@/lib/composer";

export interface Attachment {
  payload: ImagePayload;
  preview: string; // dataURL для превью-чипа
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

/** File → {payload, preview}: до лимита размера читаем как есть, иначе даунскейлим в JPEG. */
async function fileToAttachment(file: File): Promise<Attachment> {
  const factor = downscaleFactor(file.size);
  if (factor === 1) {
    const dataUrl = await readAsDataUrl(file);
    return { payload: toImagePayload(dataUrl, file.type), preview: dataUrl };
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * factor));
  canvas.height = Math.max(1, Math.round(bitmap.height * factor));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { payload: toImagePayload(dataUrl, "image/jpeg"), preview: dataUrl };
}

export interface AttachmentsApi {
  attachments: Attachment[];
  addFromPaste: (items: DataTransferItemList) => Promise<void>;
  remove: (index: number) => void;
  clear: () => void;
}

export function useAttachments(): AttachmentsApi {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const addFromPaste = useCallback(async (items: DataTransferItemList) => {
    const files = extractImageItems(items);
    if (files.length === 0) return;
    // Берём текущую длину через функциональный апдейт во избежание гонки двух paste.
    let current = 0;
    setAttachments((prev) => {
      current = prev.length;
      return prev;
    });
    const slots = acceptedNewAttachments(current, files.length);
    for (const file of files.slice(0, slots)) {
      try {
        const att = await fileToAttachment(file);
        setAttachments((prev) =>
          prev.length >= ATTACHMENT_LIMIT ? prev : [...prev, att],
        );
      } catch {
        /* битый кадр пропускаем */
      }
    }
  }, []);

  const remove = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setAttachments([]), []);

  return { attachments, addFromPaste, remove, clear };
}
```

- [ ] **Step 4: Прогон → зелёный**

Run: `npx vitest run src/hooks/useAttachments.test.ts`
Expected: 4 теста проходят. (createImageBitmap не вызывается на мелких файлах — даунскейл-ветка не трогается в jsdom.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: useAttachments — вставка/лимит/даунскейл скриншотов (TDD)"
```

---

### Task 7: Хук `useSettings`

**Files:**
- Create: `src/hooks/useSettings.ts`, `src/hooks/useSettings.test.ts`

- [ ] **Step 1: `src/hooks/useSettings.test.ts`** — создать (failing):

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";

const getSettings = vi.fn<[], Promise<Settings>>();
const setSettings = vi.fn(async (_s: Settings) => {});
const applyOpacity = vi.fn();

vi.mock("@/ipc/commands", () => ({
  getSettings: () => getSettings(),
  setSettings: (s: Settings) => setSettings(s),
}));
vi.mock("@/lib/window-controls", async (orig) => {
  const real = await orig<typeof import("@/lib/window-controls")>();
  return { ...real, applyOpacity: (...a: unknown[]) => applyOpacity(...a) };
});

import { useSettings } from "./useSettings";

beforeEach(() => {
  getSettings.mockReset();
  setSettings.mockClear();
  applyOpacity.mockClear();
});

describe("useSettings", () => {
  it("грузит настройки и применяет прозрачность", async () => {
    getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, window_opacity: 0.6 });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings.window_opacity).toBe(0.6);
    expect(applyOpacity).toHaveBeenCalledWith(document.documentElement, 0.6);
  });

  it("save шлёт set_settings, перечитывает и реприменяет прозрачность", async () => {
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, window_opacity: 0.4 });
    await act(async () => {
      await result.current.save({ ...DEFAULT_SETTINGS, window_opacity: 0.4 });
    });
    expect(setSettings).toHaveBeenCalled();
    expect(result.current.settings.window_opacity).toBe(0.4);
  });
});
```

- [ ] **Step 2: Прогон → красный**

Run: `npx vitest run src/hooks/useSettings.test.ts`
Expected: FAIL — нет `./useSettings`.

- [ ] **Step 3: `src/hooks/useSettings.ts`** — создать:

```ts
import { useCallback, useEffect, useState } from "react";
import { getSettings, setSettings as ipcSet } from "@/ipc/commands";
import { DEFAULT_SETTINGS, type Settings } from "@/ipc/types";
import { applyOpacity } from "@/lib/window-controls";

export interface SettingsApi {
  settings: Settings;
  loading: boolean;
  save: (next: Settings) => Promise<string | null>; // null = ок, иначе текст ошибки
}

export function useSettings(): SettingsApi {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const s = await getSettings();
        if (!live) return;
        setSettings(s);
        applyOpacity(document.documentElement, s.window_opacity);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const save = useCallback(
    async (next: Settings): Promise<string | null> => {
      try {
        await ipcSet(next);
        const fresh = await getSettings();
        setSettings(fresh);
        applyOpacity(document.documentElement, fresh.window_opacity);
        return null;
      } catch (e) {
        // Откат предпросмотра прозрачности к сохранённому значению.
        applyOpacity(document.documentElement, settings.window_opacity);
        return String(e);
      }
    },
    [settings.window_opacity],
  );

  return { settings, loading, save };
}
```

- [ ] **Step 4: Прогон → зелёный**

Run: `npx vitest run src/hooks/useSettings.test.ts`
Expected: 2 теста проходят.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: useSettings — загрузка/сохранение + применение прозрачности (TDD)"
```

---

### Task 8: Хуки без отдельных тестов — recorder, transcription, window, ptt

**Files:**
- Create: `src/hooks/useRecorder.ts`, `src/hooks/useTranscription.ts`, `src/hooks/useWindowControls.ts`, `src/hooks/usePttSuspend.ts`

Эти хуки — тонкие обёртки над `onEvent`/командами без собственной нетривиальной логики; покрываются ручной приёмкой и типами. Полноценные mocked-DOM-тесты для keydown/focus хрупки — намеренно не добавляем (по спеке).

- [ ] **Step 1: `src/hooks/useRecorder.ts`** — создать:

```ts
import { useEffect, useState } from "react";
import { onEvent } from "@/ipc/events";
import type { RecorderState } from "@/ipc/types";

/** Подписка на state-changed. Логику «ошибка важнее idle» держит StatusBar. */
export function useRecorder(): RecorderState {
  const [state, setState] = useState<RecorderState>("idle");
  useEffect(() => onEvent("state-changed", setState), []);
  return state;
}
```

- [ ] **Step 2: `src/hooks/useTranscription.ts`** — создать:

```ts
import { useEffect } from "react";
import { onEvent } from "@/ipc/events";

/** Вызывает onText при transcript-ready. Колбэк кладёт текст в composer и (если auto_send) шлёт. */
export function useTranscription(onText: (text: string) => void): void {
  useEffect(() => onEvent("transcript-ready", onText), [onText]);
}
```

- [ ] **Step 3: `src/hooks/useWindowControls.ts`** — создать:

```ts
import { useEffect } from "react";
import { moveWindowBy } from "@/ipc/commands";
import { moveDelta } from "@/lib/window-controls";

/**
 * Cmd/Ctrl+стрелки → move_window_by. Cmd+Enter обрабатывает App (для send),
 * поэтому здесь Enter не трогаем.
 */
export function useWindowControls(moveStep: number, onSend: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.code === "Enter") {
        e.preventDefault();
        onSend();
        return;
      }
      const delta = moveDelta(e.code, moveStep);
      if (delta) {
        e.preventDefault();
        void moveWindowBy(delta.dx, delta.dy);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moveStep, onSend]);
}
```

- [ ] **Step 4: `src/hooks/usePttSuspend.ts`** — создать:

```ts
import { useEffect } from "react";
import { setPttSuspended } from "@/ipc/commands";

/**
 * Хоткей V конфликтует с печатью «V» в textarea/input — на время фокуса в полях
 * глушим PTT. Вешаем на document (capture focusin/focusout) и проверяем target.
 */
export function usePttSuspend(): void {
  useEffect(() => {
    const isField = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement && (t.matches("textarea, input") || t.isContentEditable);
    const onIn = (e: FocusEvent) => {
      if (isField(e.target)) void setPttSuspended(true);
    };
    const onOut = (e: FocusEvent) => {
      if (isField(e.target)) void setPttSuspended(false);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
}
```

- [ ] **Step 5: Проверка типов и тестов**

Run: `npx vitest run && npm run build`
Expected: все прежние тесты зелёные; сборка зелёная.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: хуки recorder/transcription/window/ptt-suspend (тонкие обёртки)"
```

---

### Task 9: Компоненты статуса — StatusBar, PermissionBanner, HotkeyHints

**Files:**
- Create: `src/components/StatusBar.tsx`, `src/components/PermissionBanner.tsx`, `src/components/HotkeyHints.tsx`

- [ ] **Step 1: `src/components/StatusBar.tsx`** — создать:

```tsx
import { Settings as SettingsIcon } from "lucide-react";
import type { RecorderState } from "@/ipc/types";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<RecorderState, string> = {
  idle: "Зажми V — записать системный звук",
  recording: "Запись…",
  transcribing: "Распознаю…",
};

export interface StatusBarProps {
  state: RecorderState;
  error: string | null; // stt/llm ошибка; приоритетнее idle до следующего действия
  onOpenSettings: () => void;
}

export function StatusBar({ state, error, onOpenSettings }: StatusBarProps) {
  const showError = error !== null && state === "idle";
  const dotClass =
    state === "recording"
      ? "bg-recording animate-pulse"
      : state === "transcribing"
        ? "bg-primary animate-pulse"
        : showError
          ? "bg-destructive"
          : "bg-muted-foreground";

  return (
    <header className="flex items-center justify-between gap-3 min-h-7">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={cn("size-2.5 rounded-full shrink-0", dotClass)} aria-hidden />
        <span
          className={cn(
            "font-mono text-[12.5px] truncate",
            showError ? "text-destructive whitespace-normal" : "text-muted-foreground",
          )}
        >
          {showError ? error : STATUS_TEXT[state]}
        </span>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Настройки"
        className="grid place-items-center size-7 rounded-full text-muted-foreground transition-[color,background,transform] hover:text-foreground hover:bg-white/5 hover:rotate-45 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <SettingsIcon className="size-4" />
      </button>
    </header>
  );
}
```

- [ ] **Step 2: `src/components/PermissionBanner.tsx`** — создать:

```tsx
import { Button } from "@/components/ui/button";

export interface PermissionBannerProps {
  onOpenSettings: () => void;
}

export function PermissionBanner({ onOpenSettings }: PermissionBannerProps) {
  return (
    <div className="flex items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 bg-destructive/10 ring-1 ring-inset ring-destructive/30">
      <span className="text-[12.5px] text-destructive">
        Нет разрешения на запись системного звука
      </span>
      <Button variant="ghost" size="sm" onClick={onOpenSettings}>
        Открыть настройки
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: `src/components/HotkeyHints.tsx`** — создать:

```tsx
const HINTS: [string, string][] = [
  ["V", "запись"],
  ["⌘⏎", "отправить"],
  ["⌘V", "скриншот"],
  ["⌘←→↑↓", "окно"],
];

export function HotkeyHints() {
  return (
    <footer className="flex justify-center gap-4 text-[10.5px] text-muted-foreground select-none" aria-hidden>
      {HINTS.map(([k, label]) => (
        <span key={k}>
          <b className="font-mono font-semibold text-[10px] text-foreground/80">{k}</b> {label}
        </span>
      ))}
    </footer>
  );
}
```

- [ ] **Step 4: Проверка типов**

Run: `npx tsc --noEmit`
Expected: без ошибок (компоненты пока не смонтированы — проверяем компиляцию).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: StatusBar/PermissionBanner/HotkeyHints"
```

---

### Task 10: Композер — Composer + AttachmentChip

**Files:**
- Create: `src/components/AttachmentChip.tsx`, `src/components/Composer.tsx`

- [ ] **Step 1: `src/components/AttachmentChip.tsx`** — создать:

```tsx
import { X } from "lucide-react";
import type { Attachment } from "@/hooks/useAttachments";

export interface AttachmentChipProps {
  attachment: Attachment;
  onRemove: () => void;
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  return (
    <div className="group relative size-13 rounded-md overflow-hidden ring-1 ring-inset ring-border">
      <img src={attachment.preview} alt="Вложение" className="size-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Удалить вложение"
        className="absolute top-1 right-1 grid place-items-center size-4.5 rounded-full bg-black/75 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
```

(`size-13`/`size-4.5` — если такие утилиты не входят в дефолт Tailwind v4, заменить на `h-[52px] w-[52px]` и `h-[18px] w-[18px]` соответственно.)

- [ ] **Step 2: `src/components/Composer.tsx`** — создать:

```tsx
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Attachment } from "@/hooks/useAttachments";
import { AttachmentChip } from "./AttachmentChip";

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  attachments: Attachment[];
  onRemoveAttachment: (index: number) => void;
  onPaste: (items: DataTransferItemList) => void;
  onSend: () => void;
  onStop: () => void;
  onClear: () => void;
  onRetry: () => void;
  streaming: boolean;
  showRetry: boolean;
}

export function Composer(props: ComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  return (
    <section className="flex flex-col gap-2.5">
      <div className="rounded-xl bg-card/60 ring-1 ring-inset ring-border focus-within:ring-primary/50 transition-[box-shadow]">
        <Textarea
          ref={taRef}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (items) props.onPaste(items);
          }}
          spellCheck={false}
          placeholder="Зажми V у видео — расшифровка появится здесь. Текст можно править, ⌘V вставляет скриншот."
          className="min-h-24 max-h-44 resize-none border-0 bg-transparent focus-visible:ring-0 shadow-none"
        />
        {props.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pb-3">
            {props.attachments.map((att, i) => (
              <AttachmentChip key={att.preview} attachment={att} onRemove={() => props.onRemoveAttachment(i)} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={props.onClear}>
          Очистить
        </Button>
        <div className="flex-1" />
        {props.showRetry && (
          <Button variant="ghost" size="sm" onClick={props.onRetry}>
            Повторить
          </Button>
        )}
        {props.streaming && (
          <Button variant="destructive" size="sm" onClick={props.onStop}>
            Стоп
          </Button>
        )}
        <Button onClick={props.onSend} disabled={props.streaming}>
          Отправить <kbd className="ml-1.5 px-1.5 py-0.5 rounded bg-black/20 font-mono text-[10.5px]">⌘⏎</kbd>
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Проверка типов**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: Composer + AttachmentChip (textarea, чипы вложений, действия)"
```

---

### Task 11: AnswerPanel (react-markdown + перехват ссылок)

**Files:**
- Create: `src/components/AnswerPanel.tsx`

- [ ] **Step 1: `src/components/AnswerPanel.tsx`** — создать:

```tsx
import { useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openExternal } from "@/ipc/commands";

export interface AnswerPanelProps {
  answer: string;
  streaming: boolean;
  onCopy: () => void;
}

export function AnswerPanel({ answer, streaming, onCopy }: AnswerPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Автоскролл вниз при стриме.
  useEffect(() => {
    if (streaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [answer, streaming]);

  const empty = answer.trim().length === 0;

  return (
    <section className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-primary">Ответ</span>
        <span className="flex-1 h-px bg-gradient-to-r from-primary/40 via-border to-transparent" aria-hidden />
        {!empty && !streaming && (
          <button
            type="button"
            onClick={onCopy}
            className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Копировать
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1.5">
        {empty ? (
          <div className="h-full grid place-items-center">
            <span className="text-[13px] text-muted-foreground">Ответ Claude появится здесь</span>
          </div>
        ) : (
          <div className="prose-answer text-[13.5px] leading-relaxed text-foreground/90">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    onClick={(e) => {
                      e.preventDefault();
                      if (href && /^https?:\/\//.test(href)) void openExternal(href);
                    }}
                    className="text-primary underline underline-offset-2 hover:brightness-125"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {answer}
            </Markdown>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Стили markdown** — добавить в конец `src/index.css`:

```css
/* Markdown-ответ (react-markdown). prose-answer — локальный неймспейс. */
.prose-answer > :first-child { margin-top: 0; }
.prose-answer p { margin: 0 0 0.7em; }
.prose-answer h1, .prose-answer h2, .prose-answer h3, .prose-answer h4 {
  margin: 1.1em 0 0.45em; font-weight: 600; line-height: 1.3; color: var(--foreground);
}
.prose-answer h1 { font-size: 18px; }
.prose-answer h2 { font-size: 16px; }
.prose-answer h3 { font-size: 14.5px; }
.prose-answer ul, .prose-answer ol { margin: 0 0 0.7em; padding-left: 1.35em; }
.prose-answer li { margin: 0.22em 0; }
.prose-answer li::marker { color: var(--primary); }
.prose-answer code {
  padding: 1.5px 5.5px; border-radius: 6px;
  background: color-mix(in oklch, var(--primary) 14%, transparent);
  color: oklch(0.8 0.09 18); font-family: var(--font-mono); font-size: 12px;
}
.prose-answer pre {
  margin: 0.65em 0 0.85em; padding: 12px 14px; border-radius: 9px;
  background: oklch(0.12 0 0); border: 1px solid var(--border); overflow-x: auto;
}
.prose-answer pre code { padding: 0; background: none; color: oklch(0.85 0.01 285); }
.prose-answer blockquote {
  margin: 0.65em 0; padding: 2px 0 2px 12px;
  border-left: 2px solid var(--primary); color: var(--muted-foreground);
}
.prose-answer table { border-collapse: collapse; margin: 0.65em 0; }
.prose-answer th, .prose-answer td { padding: 5px 10px; border: 1px solid var(--border); font-size: 12.5px; }
.prose-answer th { color: var(--foreground); background: oklch(1 0 0 / 4%); }
.prose-answer hr { border: 0; height: 1px; margin: 1em 0; background: var(--border); }
```

- [ ] **Step 3: Проверка типов и сборки**

Run: `npx tsc --noEmit && npx vite build`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: AnswerPanel — react-markdown + remark-gfm, перехват ссылок в open_external"
```

---

### Task 12: SettingsDialog

**Files:**
- Create: `src/components/SettingsDialog.tsx`

- [ ] **Step 1: `src/components/SettingsDialog.tsx`** — создать:

```tsx
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODELS, type Settings } from "@/ipc/types";
import { applyOpacity } from "@/lib/window-controls";

export interface SettingsDialogProps {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (next: Settings) => void;
}

export function SettingsDialog({ open, settings, onClose, onSave }: SettingsDialogProps) {
  const [draft, setDraft] = useState<Settings>(settings);

  // Синхронизируем черновик с актуальными настройками при каждом открытии.
  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Откат предпросмотра прозрачности к сохранённому значению.
      applyOpacity(document.documentElement, settings.window_opacity);
      onClose();
    }
  };

  const save = () => {
    onSave({
      ...draft,
      hotkey: draft.hotkey.trim().toUpperCase() || "V",
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3.5 py-1">
          <Field label="Ключ Anthropic">
            <Input
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={draft.anthropic_api_key}
              onChange={(e) => set("anthropic_api_key", e.target.value)}
            />
          </Field>
          <Field label="Ключ Groq">
            <Input
              type="password"
              autoComplete="off"
              placeholder="gsk_…"
              value={draft.groq_api_key}
              onChange={(e) => set("groq_api_key", e.target.value)}
            />
          </Field>
          <Field label="Модель">
            <Select value={draft.model} onValueChange={(v) => set("model", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Системный промпт">
            <Textarea
              rows={3}
              value={draft.system_prompt}
              onChange={(e) => set("system_prompt", e.target.value)}
            />
          </Field>
          <Field label="Push-to-talk клавиша">
            <Input
              value={draft.hotkey}
              maxLength={20}
              placeholder="V"
              onChange={(e) => set("hotkey", e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2.5 text-[12.5px]">
            <Switch
              checked={draft.auto_send}
              onCheckedChange={(v) => set("auto_send", v)}
            />
            Отправлять сразу после распознавания
          </label>
          <Field label={`Прозрачность окна — ${Math.round(draft.window_opacity * 100)}%`}>
            <Slider
              min={0.2}
              max={1}
              step={0.05}
              value={[draft.window_opacity]}
              onValueChange={([v]) => {
                set("window_opacity", v);
                applyOpacity(document.documentElement, v); // живой предпросмотр
              }}
            />
          </Field>
          <Field label="Шаг перемещения (⌘+стрелки), px">
            <Input
              type="number"
              min={1}
              max={200}
              value={draft.move_step}
              onChange={(e) => set("move_step", Number(e.target.value))}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={save}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[11.5px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Проверка типов**

Run: `npx tsc --noEmit`
Expected: без ошибок. (Если у shadcn Slider `onValueChange` типизирован как `(v: number[]) => void` — деструктуризация `[v]` валидна.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: SettingsDialog на shadcn (ключи/модель/промпт/хоткей/авто-send/прозрачность/шаг)"
```

---

### Task 13: App.tsx — композиция всего

**Files:**
- Modify: `src/App.tsx` (заменить заглушку)

- [ ] **Step 1: `src/App.tsx`** — заменить целиком:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBar } from "@/components/StatusBar";
import { PermissionBanner } from "@/components/PermissionBanner";
import { Composer } from "@/components/Composer";
import { AnswerPanel } from "@/components/AnswerPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { HotkeyHints } from "@/components/HotkeyHints";
import { useSettings } from "@/hooks/useSettings";
import { useRecorder } from "@/hooks/useRecorder";
import { useTranscription } from "@/hooks/useTranscription";
import { useClaudeStream } from "@/hooks/useClaudeStream";
import { useAttachments } from "@/hooks/useAttachments";
import { useWindowControls } from "@/hooks/useWindowControls";
import { usePttSuspend } from "@/hooks/usePttSuspend";
import { captureAvailable, openAudioPermissionSettings, retryTranscription } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import { isTauri } from "@/ipc/env";

const RETRYABLE = /перегружен|соединение|VPN|интернет|оборван/i;

export default function App() {
  const { settings, save } = useSettings();
  const state = useRecorder();
  const stream = useClaudeStream();
  const attach = useAttachments();

  const [text, setText] = useState("");
  const [sttError, setSttError] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [permissionOk, setPermissionOk] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Свежие настройки/вложения для колбэков без пересоздания подписок.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Объединённая ошибка (stt или llm) для StatusBar.
  const error = sttError ?? stream.error;

  const doSend = useCallback(() => {
    if (stream.streaming) return;
    if (text.trim() === "" && attach.attachments.length === 0) return;
    setSttError(null);
    void stream.send(text, attach.attachments.map((a) => a.payload));
  }, [stream, text, attach.attachments]);

  // transcript-ready → кладём текст; авто-send по настройке.
  useTranscription(
    useCallback(
      (incoming: string) => {
        setText(incoming);
        setSttError(null);
        setShowRetry(false);
        if (settingsRef.current.auto_send) {
          // отправляем именно пришедший текст
          void stream.send(incoming, attach.attachments.map((a) => a.payload));
        }
      },
      [stream, attach.attachments],
    ),
  );

  // stt-error: показать + retryable-эвристика.
  useEffect(
    () =>
      onEvent("stt-error", (msg) => {
        setSttError(msg);
        setShowRetry(RETRYABLE.test(msg));
      }),
    [],
  );

  // Сбрасываем stt-ошибку при старте новой записи.
  useEffect(() => {
    if (state === "recording") {
      setSttError(null);
      setShowRetry(false);
    }
  }, [state]);

  useWindowControls(settings.move_step, doSend);
  usePttSuspend();

  // Баннер разрешения.
  useEffect(() => {
    void captureAvailable().then((ok) => setPermissionOk(ok));
  }, []);

  // Браузерный мок для визуальной проверки без бэкенда.
  useEffect(() => {
    if (isTauri()) return;
    setText("Объясни, чем хвостовая рекурсия отличается от обычной.");
  }, []);

  const onRetry = () => {
    setShowRetry(false);
    void retryTranscription();
  };

  return (
    <div className="app-shell relative flex flex-col gap-3 h-screen p-4 rounded-[22px] overflow-hidden">
      {!permissionOk && <PermissionBanner onOpenSettings={() => void openAudioPermissionSettings()} />}

      <StatusBar state={state} error={error} onOpenSettings={() => setSettingsOpen(true)} />

      <Composer
        value={text}
        onChange={setText}
        attachments={attach.attachments}
        onRemoveAttachment={attach.remove}
        onPaste={(items) => void attach.addFromPaste(items)}
        onSend={doSend}
        onStop={stream.stop}
        onClear={() => {
          setText("");
          attach.clear();
        }}
        onRetry={onRetry}
        streaming={stream.streaming}
        showRetry={showRetry}
      />

      <AnswerPanel
        answer={stream.answer}
        streaming={stream.streaming}
        onCopy={() => void navigator.clipboard.writeText(stream.answer)}
      />

      <HotkeyHints />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(next) => {
          void save(next).then((err) => {
            if (err) setSttError(`Ошибка сохранения настроек: ${err}`);
          });
          setSettingsOpen(false);
        }}
      />
    </div>
  );
}
```

Примечание: прозрачность окна применяется через `applyOpacity(document.documentElement, …)` (CSS-переменная `--app-opacity`); фон рисует ТОЛЬКО корневой `.app-shell` — см. Step 2. Важно: прозрачность идёт через `background-color` с альфой (а не CSS `opacity`), иначе текст и панели тоже стали бы прозрачными.

- [ ] **Step 2: Класс `.app-shell` с альфа-фоном** — в `src/index.css` заменить блок `#root { height: 100vh; }` на:

```css
#root { height: 100vh; }

/*
 * Прозрачность всего окна: фон рисует только корневой .app-shell, множа графит-канвас
 * на --app-opacity через альфу. НЕ переопределяем .bg-background глобально — иначе
 * shadcn DialogContent (тоже bg-background) стал бы полупрозрачным.
 */
.app-shell {
  background-color: color-mix(in oklch, var(--background) calc(var(--app-opacity) * 100%), transparent);
}
```

(`applyOpacity` из `lib/window-controls.ts` ставит `--app-opacity` на `document.documentElement`; `.app-shell` его наследует. `applyOpacity` — перенесённая без изменений функция, делает именно это.)

- [ ] **Step 3: Проверка**

Run: `npx vitest run && npm run build`
Expected: все тесты зелёные; сборка зелёная.

- [ ] **Step 4: Визуальная самопроверка в браузере**

```bash
npx vite build && (npx vite preview --port 4173 &) && sleep 1
```

Открой `http://localhost:4173` (например, через chrome-devtools MCP: resize 480×660, backdrop-градиент за окном, скриншот). Проверь: графит-фон, оксблад-акцент на «Отправить», статус-орб, ответ-плейсхолдер, открытие настроек (шестерёнка), чипы при вставке. Доведи мелочи по skill `frontend-design`. Убей preview после.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: App.tsx — композиция хуков и компонентов, поведение 1:1 с прежним"
```

---

### Task 14: Очистка легаси + перекрас overlay + README + финал

**Files:**
- Delete: `src/main.legacy.ts.txt`, `src/styles.css`, `src/markdown.ts`
- Modify: `overlay.html`, `README.md`, `package.json` (удалить marked/dompurify)

- [ ] **Step 1: Удалить легаси**

```bash
git rm src/main.legacy.ts.txt src/styles.css src/markdown.ts
npm uninstall marked dompurify
```

- [ ] **Step 2: `overlay.html`** — перекрасить в чёрный+красный (заменить `<style>`-блок):

```html
<!doctype html>
<html><head><meta charset="utf-8"><style>
  html { background: transparent; }
  body {
    margin: 0; display: flex; align-items: center; justify-content: center; gap: 8px;
    height: 36px; border-radius: 18px;
    background:
      linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,0) 60%),
      #0A0A0B;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.08), inset 0 0 0 1px rgba(255,255,255,.06);
    color: #f0c8cc; font: 600 12.5px/1 -apple-system, BlinkMacSystemFont, sans-serif;
    letter-spacing: .02em;
  }
  .orb {
    position: relative; width: 10px; height: 10px; border-radius: 50%;
    background: radial-gradient(circle at 32% 30%, #e2697a, #9B1C2E 65%);
    box-shadow: 0 0 12px rgba(155,28,46,.8);
  }
  .orb::after {
    content: ""; position: absolute; inset: -4px; border-radius: 50%;
    border: 1px solid rgba(226,59,78,.7); animation: ripple 1.3s ease-out infinite;
  }
  @keyframes ripple { from { transform: scale(.55); opacity: 1; } to { transform: scale(1.7); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .orb::after { animation: none; } }
</style></head>
<body><div class="orb"></div>Запись</body></html>
```

- [ ] **Step 3: `README.md`** — обновить раздел стека/тестов. Заменить блок «## Тесты» и добавить «## Стек»:

```markdown
## Стек

Frontend: React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui + react-markdown.
Backend: Rust (Tauri 2) — захват системного звука, Groq STT, Anthropic стрим.

## Тесты

```bash
# Frontend (TypeScript): чистая логика + хуки
npx vitest run

# Rust (unit-тесты)
cargo test --manifest-path src-tauri/Cargo.toml --lib

# Clippy (lint)
cargo clippy --manifest-path src-tauri/Cargo.toml --lib
```
```

- [ ] **Step 4: Полная проверка**

Run: `npx vitest run`
Expected: чистая логика (composer/window-controls) + хуки (useClaudeStream/useAttachments/useSettings) + ipc — все зелёные.

Run: `npm run build`
Expected: tsc + vite зелёные, `dist/` с `main` и `overlay`.

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib`
Expected: 47 Rust-тестов зелёные (не трогали).

- [ ] **Step 5: Desktop-сборка и ручная приёмка**

```bash
npm run tauri build
open src-tauri/target/release/bundle/macos/itech.app
```

Чеклист: V→запись (оверлей красный)→распознавание→текст; ⌘⏎→стрим ответа в новом дизайне; ⌘V→чип; Esc; Стоп; ⌘-стрелки; настройки (новый диалог) сохраняются; прозрачность; stt-ошибка видна.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: удалить vanilla-легаси (main.ts/styles.css/markdown.ts, marked/dompurify), перекрасить overlay, README"
```

---

## Self-review плана

- **Покрытие спеки:** стек/тулинг (T1-T2), перенос чистой логики (T3), слой ipc типы/env/команды/события (T4), хуки useClaudeStream/useAttachments/useSettings/useRecorder/useTranscription/useWindowControls/usePttSuspend (T5-T8), компоненты StatusBar/PermissionBanner/HotkeyHints/Composer/AttachmentChip/AnswerPanel/SettingsDialog (T9-T12), App-композиция + мок-превью + прозрачность (T13), очистка/overlay/README/desktop (T14). react-markdown+remark-gfm (T11). Графит/оксблад токены (T1, T11). Контракт 1:1 — ipc-слой (T4) перечисляет все 10 команд и 6 событий; 8 настроек — types.ts. Тесты: чистая логика + 3 хука с mocked IPC. Пробелов не нашёл.
- **Типы сквозные:** `Settings`/`DEFAULT_SETTINGS`/`MODELS`/`RecorderState`/`EventMap`/`ImagePayload` определены в `ipc/types.ts` и используются единообразно в хуках/компонентах. `Attachment` определён в `useAttachments.ts`, импортируется в Composer/AttachmentChip. Команды (`sendToClaude`, `getSettings`, …) одного имени в commands.ts и во всех потребителях. Событие `onEvent(name, cb)` — единая сигнатура.
- **Честные оговорки:** T2 (shadcn add) — CLI-команда как канонический источник vendored-файлов; при сбое — ручное копирование со страниц shadcn. T4 step 6 — слой ipc тривиален, «красный» условный (отмечено). T8 — тонкие хуки без хрупких DOM-тестов (по спеке). T13 step 2-3 — прозрачность через CSS-переменную, явная правка после генерации App.
