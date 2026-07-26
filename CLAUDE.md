# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Что это

Монорепозиторий **harpyhare** (Nx + npm workspaces, один общий `node_modules`): десктоп-приложение (macOS + Windows) и его лендинг.

| Проект          | Что это                                                                          | Своя документация                                     |
| --------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/desktop`  | Продукт: Tauri 2 + Rust-бэкенд + React 19. Системный звук → STT → ответ Claude    | **`apps/desktop/CLAUDE.md`** (подробно) + `README.md` |
| `apps/landing`  | Одностраничный сайт со скачиванием (Next.js 16 App Router + React + Tailwind)     | `apps/landing/README.md`                              |

**Работаешь внутри `apps/desktop` — читай `apps/desktop/CLAUDE.md`.** Там вся архитектура приложения, инварианты Rust⇄TS-контракта, правила палитры и десятки «почему так, а не иначе». Этот файл — только про монорепо в целом.

Nx выводит проекты из npm-workspaces, а таргеты — из их `package.json`-скриптов; файлов `project.json` нет и заводить их не надо.

## Команды

```bash
npm install                                       # все воркспейсы разом

npx nx dev landing                                # лендинг (Next.js, http://localhost:3000)
cd apps/desktop && npm run tauri dev              # приложение целиком (Rust + фронт) — единственный способ увидеть UI

npx nx <target> <project>                         # build | lint | typecheck | test для одного проекта
npm run build | lint | typecheck | test           # то же самое для всех (nx run-many)
npx nx affected -t lint typecheck --uncommitted   # только затронутые проекты

npm run knip                                      # мёртвый код и зависимости, workspace-aware (knip.json)
npm run format                                    # prettier по всему репо
npm run presets:publish                           # config/presets.json → публичный блоб (нужен BLOB_READ_WRITE_TOKEN в .env.local)
```

Тесты — vitest в каждом проекте: `cd apps/desktop && npx vitest run src/hooks/useChats.test.ts` (один файл), `npx vitest run` (все). Rust-тесты живут отдельно: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`.

**Pre-commit (husky)** прогоняет три шага: `lint-staged` (prettier по застейдженным) → `nx affected -t typecheck lint --uncommitted` → `knip`. То есть коммит падает и от мёртвого экспорта, а не только от типов.

**CI — `.github/workflows/ci.yml`** (push в main, PR, ручной запуск): job на ubuntu гоняет `nx run-many -t typecheck lint test` + `knip`, job на macos-latest — `cargo test`, `git diff --exit-code apps/desktop/src/ipc/bindings.ts` и `clippy -D warnings`, job на windows-latest — `clippy --all-targets -D warnings` и сборку NSIS-установщика. **Windows-половину проверяет только CI**: установщик под Windows на macOS не собирается. **Тесты на windows-раннере не гоняются**: тестовый бинарь не стартует (`STATUS_ENTRYPOINT_NOT_FOUND` ещё до первого теста) — похоже на известную граблю крейта с `crate-type = ["cdylib", …]`; компиляцию тестов там держит `clippy --all-targets`, а прогон и сверку контракта — macos-job. Подпись апдейтера в CI включается, только если задан секрет `TAURI_SIGNING_PRIVATE_KEY`.

## Что связывает проекты

Приложения не импортируют код друг друга — общего пакета нет. Связей ровно три, и все они неочевидны из структуры папок:

1. **`config/presets.json` — один файл, два потребителя.** Его вшивает Rust (`include_str!` в `remote_presets.rs`, фолбэк, когда сеть недоступна) и импортирует фронт (`lib/presets.ts`). Правка формата ломает обе стороны сразу; публикация в блоб (`npm run presets:publish`) перекрывает вшитую копию в рантайме.

2. **Репозиторий релизов `screenfriskofficial/harpyhare-releases`.** `apps/desktop/scripts/release.mjs` публикует туда подписанный бандл и `latest.json`; апдейтер приложения тянет оттуда обновления, а лендинг спрашивает у GitHub Releases API последнюю версию **на сервере** (ISR, ревалидация раз в 30 минут — версия и ссылки попадают в HTML) и подбирает установщик под ОС посетителя по суффиксу имени ассета (`apps/landing/src/lib/release.ts`: `.dmg` против `-setup.exe`, апдейтерные `.nsis.zip`/`.app.tar.gz`/`.sig` и `latest.json` отсеиваются). Поэтому смена имени ассета в релиз-скрипте ломает и апдейтер, и кнопку «Скачать» на сайте. **Релиз двухплатформенный и собирается на двух машинах:** первый прогон создаёт релиз и тег, второй (на другой ОС, тот же тег) версию не бампает, доливает свои ассеты и вливает свою платформу в существующий `latest.json` (`darwin-aarch64` / `windows-x86_64`).

3. **Прокси `screenfriskofficial/itech-relay`** (Cloudflare Worker, отдельный репозиторий) — через него идут запросы приложения в режиме кода доступа. Его инварианты описаны в `apps/desktop/CLAUDE.md`.

## knip

`knip.json` задаёт точки входа явно, потому что автоопределение здесь врёт: у desktop это `src/launcher.tsx` и `src/index.css` (второе окно приложения и Tailwind-слой), из проверки исключены `src/components/ui/**` (примитивы shadcn, часть добавлена впрок) и `src/ipc/bindings.ts` (генерируется из Rust). Добавляя окно или генерируемый артефакт, правь `knip.json` — иначе pre-commit будет ругаться на «мёртвый» код, который на самом деле живой. У landing своей секции нет намеренно: точки входа App Router (`page.tsx`, `layout.tsx`, `sitemap.ts`, `robots.ts`, `manifest.ts`) находит плагин knip для Next.js.

## Прочее

- `docs/` в корне пустая; проектная история живёт в `apps/desktop/docs/superpowers/{specs,plans}`.
- Корневые `dist/` и `src-tauri/` — артефакты, оставшиеся до разделения на воркспейсы: они в `.gitignore` и в сборке не участвуют. Настоящий Tauri-крейт — `apps/desktop/src-tauri`.
- `.env` и `.env.local` в корне: первый — фолбэк ключей API для dev-сборки приложения, второй — токен публикации пресетов. Оба гитигнорятся.
