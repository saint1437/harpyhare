import { AccessCodeForm } from "@/components/AccessCodeForm";
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
  onRedeem: (code: string) => Promise<string | null>;
  onOpenSettings: () => void;
  onClose: () => void;
}

export function MissingKeysDialog({
  open,
  missing,
  onRedeem,
  onOpenSettings,
  onClose,
}: MissingKeysDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Нужен доступ</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px]">Есть код доступа?</span>
          <p className="text-[11px] text-muted-foreground">
            Введи код — и приложение сразу заработает бесплатно, свои ключи не нужны.
          </p>
          <AccessCodeForm onRedeem={onRedeem} autoFocus />
        </div>
        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[10.5px] tracking-wide text-muted-foreground uppercase">
            или свои ключи
          </span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          Без кода приложению нужны ключи API: без них отправка и распознавание речи не работают.
          Получи недостающие ключи по ссылкам и вставь их в настройках.
        </p>
        <div className="flex flex-col gap-2">
          {missing.map((k) => (
            <MissingKeyRow key={k.id} info={k} />
          ))}
        </div>
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

function MissingKeyRow({ info }: { info: ApiKeyInfo }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-white/5 px-3 py-2">
      <div className="flex flex-col">
        <span className="text-[12.5px]">Ключ {info.name}</span>
        <span className="text-[11px] text-muted-foreground">{info.purpose}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => void openExternal(info.consoleUrl)}>
        Получить ключ
      </Button>
    </div>
  );
}
