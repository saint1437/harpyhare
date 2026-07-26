# harpyhare — landing

Маркетинговый сайт-одностраничник для приложения harpyhare. **Next.js 16 (App Router) + React 19 +
Tailwind v4**, две языковые версии, без собственного бэкенда.

## Разработка

```bash
# из корня монорепо
npx nx dev landing        # dev-сервер (http://localhost:3000)
npx nx build landing      # прод-сборка → apps/landing/.next
npx nx test landing       # юнит-тесты чистой логики

# либо из этой папки
cd apps/landing && npm run dev
npm run start             # прод-сервер поверх собранного .next
```

## Маршруты и локали

| URL   | Локаль  | Файл                       |
| ----- | ------- | -------------------------- |
| `/`   | русский | `src/app/(ru)/page.tsx`    |
| `/en` | English | `src/app/(en)/en/page.tsx` |

Обе группы маршрутов — **самостоятельные root-лейауты** (`app/(ru)/layout.tsx` и
`app/(en)/layout.tsx`), потому что `<html lang>` у них разный, а Next разрешает несколько корневых
лейаутов только через route groups. Общий каркас `<html>/<body>` со skip-ссылкой живёт в
`components/RootHtml.tsx`, чтобы группы не расходились.

Тексты страницы — в `src/i18n/{ru,en}.ts`, форма словаря описана типом `Dictionary`
(`src/i18n/types.ts`): добавил ключ — обе локали обязаны его заполнить, иначе `tsc` падает.
Компоненты секций строк не содержат вовсе, всё приходит пропом `dict`.

**Макет приложения (`components/app-demo/`) намеренно остаётся русским в обеих локалях** — это
реплика реального интерфейса, а он пока только на русском. На английской странице под макетом
приписка об этом (`dict.demo.interfaceLanguageNote`). Появится локализация в приложении — тексты
макета переедут в словарь.

## Как подтягивается версия

Последний релиз `screenfriskofficial/harpyhare-releases` берётся **на сервере при сборке и раз в 30
минут заново** (`fetch` c `next: { revalidate }` в `src/lib/release-server.ts`; `revalidate`
страницы задан литералом рядом — Next требует статически анализируемое значение). Поэтому номер
версии и прямые ссылки на установщики лежат прямо в HTML: их видит поисковик, и кнопка не мигает
состоянием загрузки.

- `src/lib/platform.ts` — платформы, подписи, требования и чистая `detectPlatform`. Покрыт тестами.
- `src/lib/release.ts` — разбор ответа API, выбор установщика (`pickPlatformAsset`: macOS — `.dmg`,
  Windows — `-setup.exe`, затем `.msi`, затем `.exe`; ассеты апдейтера отсеиваются). Покрыт тестами.
- `src/lib/release-server.ts` — сам фетч; при любой ошибке возвращает `null`, и кнопки ведут на
  страницу релизов.
- `src/hooks/usePlatform.ts` — единственное место, где читается `navigator`. Серверный рендер всегда
  отдаёт macOS, на клиенте порядок кнопок правится под ОС посетителя; поэтому
  `DownloadChoice`/`DownloadButton`/`VersionNote`/`PlatformRequirements` — клиентские, а секции
  вокруг них серверные.

**Новый релиз приложения появляется на сайте сам** — редеплой не нужен, максимум через 30 минут.

## SEO

Всё, что отдаётся поисковику, собирается из словаря — руками теги не дублируются:

- `src/lib/metadata.ts` — `title`/`description`/`keywords`, canonical, `hreflang` (`ru`, `en`,
  `x-default`), Open Graph и Twitter-карточка, директивы для роботов. Абсолютные URL строит
  `metadataBase` + `src/lib/site.ts`.
- `src/lib/structured-data.ts` — JSON-LD одним `@graph`: `Organization`, `WebSite`, `WebPage`,
  `SoftwareApplication` (версия и ссылка на скачивание — из живого релиза, `offers` = 0) и
  `FAQPage`. Разметка FAQ обязана совпадать с видимым текстом секции `components/Faq.tsx` — обе
  стороны берут `dict.faq.items`, так что расхождение невозможно by design.
- `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/manifest.ts` — генерируются Next, домен один
  на всех (`SITE_URL`).
- `public/og.png` и `public/og-en.png` (1200×630) — картинки для соцсетей; **PNG, а не SVG**:
  Twitter и Facebook SVG-превью не рендерят.
- Декоративные спрайты зайца и кустов помечены `loading="lazy"`: React 19 иначе выписывает им
  `<link rel="preload">` в `<head>`, и десяток картинок конкурирует с LCP-текстом.

Домен — константа `SITE_URL` в `src/lib/site.ts`. **Переезд на другой домен — правка одной строки**,
всё остальное (canonical, OG, sitemap, robots, JSON-LD) выводится из неё.

## Деплой (Vercel)

Корневой `vercel.json`: `framework: nextjs`, `buildCommand: npx nx build landing`,
`outputDirectory: apps/landing/.next`. Root Directory проекта в Vercel — корень репозитория (`./`).
Пуш в `main` → автодеплой. Если Vercel не подхватит вложенный `.next`, альтернатива — выставить Root
Directory `apps/landing` и убрать `buildCommand`/`outputDirectory` из `vercel.json` (зависимости
Vercel всё равно ставит из корня, воркспейсы npm он понимает).

Опционально не пересобирать, когда лендинг не затронут: Settings → Git → Ignored Build Step →
`npx nx-ignore landing`.

## Палитра

Те же токены, что в приложении (`apps/desktop/src/index.css`), но фон меняется по скроллу: днём
светлый, ночью чёрный — за это отвечает переменная `--day` (`components/Moon.tsx`). Фирменный
красный (oxblood) сохранён. Токены — в `src/app/globals.css` (`@theme inline`). Отдельная группа
`--app-*` — палитра макета приложения, она в смене дня и ночи не участвует.
