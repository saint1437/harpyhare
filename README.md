# itech

Push-to-talk приложение для macOS: зажми V → захват системного звука → распознавание речи через Whisper (Groq) → редактирование текста → отправка в Claude со скриншотами. Ответ приходит стримом прямо в плавающем HUD-окне.

## Требования

- macOS 14.2+ (Core Audio process tap для захвата системного звука)
- Ключ API [Anthropic](https://console.anthropic.com/) (Claude)
- Ключ API [Groq](https://console.groq.com/) (Whisper STT)
- VPN для обоих сервисов при работе из РФ

## Запуск и сборка

```bash
npm install
cp .env.example .env   # и впиши ключи API (см. ниже)
npm run tauri dev      # dev-режим с hot-reload
npm run tauri build    # production-сборка (.app + .dmg)
```

## Ключи API

Два способа задать ключи (можно совмещать):

1. **`.env` в корне проекта** — `ANTHROPIC_API_KEY` и `GROQ_API_KEY`. Файл в `.gitignore` и подхватывается при старте приложения.
2. **Настройки в приложении** (⚙) — сохраняются в settings.json и **имеют приоритет** над `.env`: значение из `.env` используется, только пока соответствующее поле в настройках пустое.

## Первый запуск

При первом старте macOS покажет диалог «Разрешить itech записывать системный звук?» — нажми **Разрешить**. Если диалог не появился или было отказано — в приложении появится красный баннер; кнопка «Открыть настройки» переведёт в нужную панель системных настроек.

## Горячие клавиши

| Клавиша | Действие |
|---------|----------|
| V (зажать) | Начать запись системного звука |
| Esc | Отменить запись |
| Cmd+Enter | Отправить текст в Claude |
| Cmd+V | Вставить скриншот из буфера обмена |
| Cmd+←/→/↑/↓ | Двигать окно по экрану |

> **ВАЖНО:** хоткей V перехватывает нажатие во **всех** приложениях, пока itech запущен. В полях самого приложения печать работает нормально — PTT снимается при получении фокуса. Изменить клавишу можно в настройках (шестерёнка).

## Настройки

Открываются кнопкой ⚙ в правом верхнем углу. Хранятся в:

```
~/Library/Application Support/com.itech.voice/settings.json
```

Файл создаётся с правами 600 (читает только текущий пользователь).

## Стек

- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui + react-markdown. Слои: `src/ipc` (типизированная граница над Tauri — единственное место, знающее про invoke/listen), `src/lib` (чистая логика), `src/hooks` (по хуку на слайс контракта), `src/components` (на shadcn-примитивах).
- **Backend:** Rust (Tauri 2) — захват системного звука (Core Audio process tap), Groq STT, стрим Anthropic.

## Тесты

```bash
# Frontend (TypeScript): чистая логика + хуки
npx vitest run

# Rust (unit-тесты)
cargo test --manifest-path src-tauri/Cargo.toml --lib

# Clippy (lint)
cargo clippy --manifest-path src-tauri/Cargo.toml --lib
```
