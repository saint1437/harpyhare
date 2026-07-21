import { AccessCodeForm } from "@/components/AccessCodeForm";
import { LabeledDivider } from "@/components/LabeledDivider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { openExternal } from "@/ipc/commands";
import type { ApiKeyInfo } from "@/lib/api-keys";

export interface MissingKeysDialogProps {
  open: boolean;
  missing: ApiKeyInfo[];
  permissionMissing: boolean;
  onRequestPermission: () => Promise<void>;
  onOpenAudioSettings: () => void;
  onRedeem: (code: string) => Promise<string | null>;
  onOpenSettings: () => void;
  onClose: () => void;
}

export function MissingKeysDialog({
  open,
  missing,
  permissionMissing,
  onRequestPermission,
  onOpenAudioSettings,
  onRedeem,
  onOpenSettings,
  onClose,
}: MissingKeysDialogProps) {
  const keysMissing = missing.length > 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-[min(440px,95vw)] sm:max-w-[min(440px,95vw)]">
        <DialogHeader>
          <DialogTitle>Нужен доступ</DialogTitle>
        </DialogHeader>
        {permissionMissing && (
          <MissingPermissionRow
            onRequest={onRequestPermission}
            onOpenAudioSettings={onOpenAudioSettings}
          />
        )}
        {keysMissing && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-body">Есть код доступа?</span>
              <p className="text-caption text-muted-foreground">
                Введи код — и приложение сразу заработает бесплатно, свои ключи не нужны.
              </p>
              <AccessCodeForm onRedeem={onRedeem} autoFocus />
            </div>
            <LabeledDivider label="или свои ключи" className="py-1" />
            <p className="text-body text-muted-foreground">
              Без кода приложению нужны ключи API: без них отправка и распознавание речи не
              работают. Получи недостающие ключи по ссылкам и вставь их в настройках.
            </p>
            <div className="flex flex-col gap-2">
              {missing.map((k) => (
                <MissingKeyRow key={k.id} info={k} />
              ))}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Позже
          </Button>
          <Button onClick={onOpenSettings}>Открыть настройки</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MissingPermissionRow({
  onRequest,
  onOpenAudioSettings,
}: {
  onRequest: () => Promise<void>;
  onOpenAudioSettings: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-surface px-3 py-2.5">
      <div className="flex min-w-0 flex-col">
        <span className="text-body">Запись системного звука</span>
        <span className="text-caption text-muted-foreground">
          macOS должна разрешить приложению слышать системный звук — без этого расшифровка не
          работает
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-1">
        <Button size="sm" onClick={() => void onRequest()}>
          Запросить
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenAudioSettings}>
          Настройки macOS
        </Button>
      </div>
    </div>
  );
}

function MissingKeyRow({ info }: { info: ApiKeyInfo }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-surface px-3 py-2.5">
      <div className="flex flex-col">
        <span className="text-body">Ключ {info.name}</span>
        <span className="text-caption text-muted-foreground">{info.purpose}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => void openExternal(info.consoleUrl)}>
        Получить ключ
      </Button>
    </div>
  );
}
