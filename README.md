# harpyhare

Монорепозиторий (Nx + npm workspaces) с двумя приложениями.

```
apps/
  desktop/    # harpyhare — macOS Tauri 2 приложение (продукт). См. apps/desktop/README.md
  landing/    # лендинг со скачиванием (Vite + React + Tailwind). См. apps/landing/README.md
```

Каждое приложение самодостаточно (свои `package.json`, tsconfig, eslint, prettier, vite).
Nx определяет проекты из npm-workspaces и выводит таргеты из их `package.json`-скриптов —
никаких `project.json`.

## Старт

```bash
npm install                       # установить все воркспейсы (один общий node_modules)

# приложение (Rust + фронтенд, hot reload)
cd apps/desktop && npm run tauri dev

# лендинг
npx nx dev landing                # или: cd apps/landing && npm run dev
```

## Оркестрация (из корня)

```bash
npx nx build desktop              # nx <target> <project>: build | lint | typecheck | test
npx nx run-many -t build          # для всех проектов
npx nx run-many -t lint typecheck test
npx nx affected -t lint typecheck --uncommitted   # только изменённые проекты

npm run knip                      # мёртвый код/зависимости (workspace-aware, см. knip.json)
npm run format                    # prettier по всему репо
```

Пре-коммит (husky): `lint-staged` (prettier по застейдженным) → `nx affected -t typecheck
lint` → `knip`.

## Релиз приложения

Пайплайн не изменился — из `apps/desktop`:

```bash
cd apps/desktop && npm run release -- 0.5.0 --notes "Что нового"
```

Собирает подписанный бандл, публикует GitHub-релиз в `screenfriskofficial/harpyhare-releases`,
бампит версию, коммитит и ставит тег. Лендинг подхватит новую версию автоматически (тянет её из
последнего релиза в рантайме). Подробности — `apps/desktop/CLAUDE.md`.
