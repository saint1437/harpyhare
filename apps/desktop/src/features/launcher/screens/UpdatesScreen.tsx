import { lazy, Suspense } from "react";
import { NotificationCard } from "@/components/NotificationCard";
import { Button } from "@/components/ui/button";
import type { UpdaterApi } from "@/hooks/useUpdater";
import type { UpdateProgress } from "@/ipc/types";
import { BRAND_NAME } from "@/lib/brand";
import { SettingBlock, SettingGroup, SettingRow } from "../fields";
import { ScreenShell } from "../ScreenShell";

const ReleaseNotes = lazy(() => import("../ReleaseNotes"));

// Отказ проверки живёт в уведомлении, а не в подписи строки: сюда приходил
// сырой `String(e)` от плагина обновлений, и подпись под кнопкой его не держала.
export type CheckState = "idle" | "checking" | "latest";

const UPDATE_FAILED_TITLE = "Не удалось обновиться";
const MIB = 1024 * 1024;
const PERCENT_MAX = 100;

function downloadPercent(progress: UpdateProgress | null): number | null {
  if (progress && progress.total !== null && progress.total > 0) {
    return Math.min(PERCENT_MAX, Math.round((progress.downloaded / progress.total) * PERCENT_MAX));
  }
  return null;
}

function formatMib(bytes: number): string {
  return (bytes / MIB).toFixed(1);
}

function progressCaption(updater: UpdaterApi, percent: number | null): string {
  if (updater.status === "restarting") return "Установлено. Перезапуск…";
  if (percent !== null) return `Загрузка ${String(percent)}%`;
  return `Загрузка ${formatMib(updater.progress?.downloaded ?? 0)} МиБ`;
}

function checkCaption(state: CheckState): string {
  if (state === "checking") return "Проверяю…";
  if (state === "latest") return "Установлена последняя версия";
  return "Проверка идёт автоматически при запуске и раз в шесть часов.";
}

function DownloadProgress({ updater }: { updater: UpdaterApi }) {
  const percent = downloadPercent(updater.progress);
  return (
    <div className="grid gap-1.5">
      <div className="h-1 overflow-hidden rounded-full bg-surface-active">
        <div
          className={
            percent === null
              ? "h-full w-full animate-pulse rounded-full bg-accent/60"
              : "h-full rounded-full bg-accent transition-[width]"
          }
          style={percent === null ? undefined : { width: `${String(percent)}%` }}
        />
      </div>
      <span className="font-mono text-caption text-fg-subtle tabular-nums">
        {progressCaption(updater, percent)}
      </span>
    </div>
  );
}

export function UpdatesScreen({
  updater,
  checkState,
  onCheck,
}: {
  updater: UpdaterApi;
  checkState: CheckState;
  onCheck: () => void;
}) {
  const busy = updater.status === "downloading" || updater.status === "restarting";
  const available = updater.info !== null && !busy;

  return (
    <ScreenShell screen="updates">
      <SettingGroup title="Версия" description={`Установленная сборка ${BRAND_NAME}.`}>
        <SettingRow
          label={`${BRAND_NAME} ${updater.currentVersion}`}
          hint={checkCaption(checkState)}
        >
          <Button variant="ghost" size="sm" disabled={checkState === "checking"} onClick={onCheck}>
            Проверить
          </Button>
        </SettingRow>
      </SettingGroup>

      {updater.info !== null && (
        <SettingGroup
          title={`Доступна версия ${updater.info.version}`}
          description="Приложение скачает её, проверит подпись и перезапустится."
        >
          {updater.info.notes !== "" && (
            <SettingBlock label="Что нового">
              <div className="prose-answer max-h-56 overflow-y-auto rounded-lg bg-surface px-3 py-2 text-body leading-relaxed text-fg-subtle ring-1 ring-inset ring-line">
                <Suspense fallback={null}>
                  <ReleaseNotes notes={updater.info.notes} />
                </Suspense>
              </div>
            </SettingBlock>
          )}

          {busy && (
            <SettingBlock label="Установка">
              <DownloadProgress updater={updater} />
            </SettingBlock>
          )}

          {/* Единственная ошибка, которая НЕ уезжает в стопку уведомлений:
              «Повторить» стоит здесь же, и уносить причину от кнопки означало бы
              оставить кнопку без объяснения. Карточка та же самая, поэтому
              многоэкранный текст точно так же сворачивается и копируется. */}
          {updater.status === "error" && updater.error !== null && (
            <div className="px-3 py-2.5">
              <NotificationCard tone="danger" title={UPDATE_FAILED_TITLE} detail={updater.error} />
            </div>
          )}

          {available && (
            <div className="flex items-center justify-end gap-2 px-3 py-2">
              <Button variant="ghost" size="sm" onClick={updater.dismiss}>
                Позже
              </Button>
              <Button size="sm" onClick={updater.install}>
                {updater.status === "error" ? "Повторить" : "Обновить и перезапустить"}
              </Button>
            </div>
          )}
        </SettingGroup>
      )}
    </ScreenShell>
  );
}
