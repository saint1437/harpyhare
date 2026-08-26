import { lazy, Suspense } from "react";
import { NotificationCard } from "@/components/NotificationCard";
import { Button } from "@/components/ui/button";
import { SettingBlock, SettingGroup, SettingRow } from "@/features/settings/fields";
import { useDict } from "@/hooks/useDict";
import type { UpdaterApi } from "@/hooks/useUpdater";
import { format } from "@/i18n";
import type { Dictionary } from "@/i18n/types";
import type { UpdateProgress } from "@/ipc/types";
import { BRAND_NAME } from "@/lib/brand";
import { ScreenShell } from "../ScreenShell";

const ReleaseNotes = lazy(() => import("@/components/ReleaseNotes"));

// Отказ проверки живёт в уведомлении, а не в подписи строки: сюда приходил
// сырой `String(e)` от плагина обновлений, и подпись под кнопкой его не держала.
export type CheckState = "idle" | "checking" | "latest";

const MIB = 1024 * 1024;
const PERCENT_MAX = 100;
const MIB_FRACTION_DIGITS = 1;

function downloadPercent(progress: UpdateProgress | null): number | null {
  if (progress && progress.total !== null && progress.total > 0) {
    return Math.min(PERCENT_MAX, Math.round((progress.downloaded / progress.total) * PERCENT_MAX));
  }
  return null;
}

function formatMib(bytes: number): string {
  return (bytes / MIB).toFixed(MIB_FRACTION_DIGITS);
}

function progressCaption(updater: UpdaterApi, percent: number | null, dict: Dictionary): string {
  const copy = dict.launcher.updates;
  if (updater.status === "restarting") return copy.restarting;
  if (percent !== null) return format(copy.downloadPercent, { percent: String(percent) });
  return format(copy.downloadSize, { size: formatMib(updater.progress?.downloaded ?? 0) });
}

function checkCaption(state: CheckState, dict: Dictionary): string {
  const copy = dict.launcher.updates;
  if (state === "checking") return copy.checking;
  if (state === "latest") return copy.upToDate;
  return copy.autoCheckNote;
}

function DownloadProgress({ updater }: { updater: UpdaterApi }) {
  const dict = useDict();
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
        {progressCaption(updater, percent, dict)}
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
  const dict = useDict();
  const copy = dict.launcher.updates;
  const busy = updater.status === "downloading" || updater.status === "restarting";
  const available = updater.info !== null && !busy;

  return (
    <ScreenShell screen="updates">
      <SettingGroup
        title={copy.versionTitle}
        description={format(copy.versionDescription, { brand: BRAND_NAME })}
      >
        <SettingRow
          label={`${BRAND_NAME} ${updater.currentVersion}`}
          hint={checkCaption(checkState, dict)}
        >
          <Button variant="ghost" size="sm" disabled={checkState === "checking"} onClick={onCheck}>
            {copy.check}
          </Button>
        </SettingRow>
      </SettingGroup>

      {updater.info !== null && (
        <SettingGroup
          title={format(copy.availableTitle, { version: updater.info.version })}
          description={copy.availableDescription}
        >
          {updater.info.notes !== "" && (
            <SettingBlock label={copy.notesLabel}>
              <div className="prose-answer max-h-56 overflow-y-auto rounded-lg bg-surface px-3 py-2 text-body leading-relaxed text-fg-subtle ring-1 ring-inset ring-line">
                <Suspense fallback={null}>
                  <ReleaseNotes notes={updater.info.notes} />
                </Suspense>
              </div>
            </SettingBlock>
          )}

          {busy && (
            <SettingBlock label={copy.installLabel}>
              <DownloadProgress updater={updater} />
            </SettingBlock>
          )}

          {/* Единственная ошибка, которая НЕ уезжает в стопку уведомлений:
              «Повторить» стоит здесь же, и уносить причину от кнопки означало бы
              оставить кнопку без объяснения. Карточка та же самая, поэтому
              многоэкранный текст точно так же сворачивается и копируется. */}
          {updater.status === "error" && updater.error !== null && (
            <div className="px-3 py-2.5">
              <NotificationCard tone="danger" title={copy.failedTitle} detail={updater.error} />
            </div>
          )}

          {available && (
            <div className="flex items-center justify-end gap-2 px-3 py-2">
              <Button variant="ghost" size="sm" onClick={updater.dismiss}>
                {copy.later}
              </Button>
              <Button size="sm" onClick={updater.install}>
                {updater.status === "error" ? dict.common.actions.retry : copy.install}
              </Button>
            </div>
          )}
        </SettingGroup>
      )}
    </ScreenShell>
  );
}
