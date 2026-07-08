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
  onOpenSettings: () => void;
  onClose: () => void;
}

export function MissingKeysDialog({
  open,
  missing,
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
          <DialogTitle>Не хватает API-ключей</DialogTitle>
        </DialogHeader>
        <p className="text-[12.5px] text-muted-foreground">
          Приложению нужны ключи API: без них отправка и распознавание речи не работают, поэтому
          кнопки отключены. Получи недостающие ключи по ссылкам и вставь их в настройках.
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
