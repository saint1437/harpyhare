# harpyhare — landing

Маркетинговый сайт-одностраничник для приложения harpyhare. Vite + React + Tailwind v4,
статическая сборка, без бэкенда.

## Разработка

```bash
# из корня монорепо
npx nx dev landing        # dev-сервер
npx nx build landing      # прод-сборка → apps/landing/dist
npx nx preview landing    # локальный предпросмотр прод-сборки

# либо из этой папки
cd apps/landing && npm run dev
```

## Как подтягивается версия

Кнопка «Скачать» и номер версии берутся **в рантайме** из последнего релиза
`screenfriskofficial/harpyhare-releases` (GitHub Releases API). Логика:

- `src/lib/release.ts` — чистый разбор ответа API (`parseRelease` → `toReleaseInfo`),
  выбор `.dmg`-ассета (`pickDmgAsset`), константы репозитория. Покрыт юнит-тестами.
- `src/hooks/useLatestRelease.ts` — фетч на маунте, состояния `loading | ready | error`.
- Фолбэк: если API недоступен, кнопка ведёт на страницу релизов (`RELEASES_PAGE`).

Поэтому **новый релиз приложения появляется на сайте автоматически** — пересобирать и
редеплоить сайт не нужно.

## Деплой (Vercel)

Корневой `vercel.json` описывает сборку монорепо: `installCommand: npm ci`,
`buildCommand: npx nx build landing`, `outputDirectory: apps/landing/dist`. В Vercel:
импортировать репозиторий и **оставить Root Directory корнем** (`./`) — остальное берётся из
`vercel.json`. Пуш в `main` → автодеплой. Опционально не пересобирать, когда лендинг не
затронут: Settings → Git → Ignored Build Step → `npx nx-ignore landing`.

`base: "./"` в `vite.config.ts` делает сборку независимой от пути (работает и на кастомном
домене, и на превью-URL Vercel).

Перед продакшеном:

- заменить домен-заглушку `https://harpyhare.ai/` в `index.html` (`canonical`, `og:url`,
  `og:image`) на реальный;
- при желании экспортировать `public/og.svg` → `public/og.png` (1200×630) и вернуть в мета-тегах
  `og.png`: Twitter/Facebook не рендерят SVG-превью (остальное берёт из `og.svg` как есть).

## Палитра

Те же токены, что в приложении (`apps/desktop/src/index.css`), но фон — **чёрный** вместо
серого; фирменный красный (oxblood) сохранён. Токены — в `src/index.css` (`@theme inline`).
