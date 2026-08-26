import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { AccessCodeForm } from "@/components/AccessCodeForm";
import { Button } from "@/components/ui/button";
import type { Settings } from "@/ipc/types";
import { missingApiKeys } from "@/lib/api-keys";
import { cn, SURFACE_CARD_CLASS } from "@/lib/utils";
import type { SetSetting } from "../../launcher/contract";
import { ApiKeysSection } from "../../launcher/sections/ApiKeysSection";
import { OnboardingShell } from "../OnboardingShell";

const INTRO =
  "Приложение слушает звук собеседника — из звонка, встречи или видео, — расшифровывает речь и предлагает ответ. Окно остаётся у вас: собеседники его не видят даже при демонстрации экрана.";
const CODE_HINT = "Код выдаёт владелец подписки. Он заменяет оба ключа.";

/**
 * The first thing the product has ever said about itself, and the one input
 * without which nothing works. Everything else in the flow is skippable.
 */
export function AccessStep({
  step,
  total,
  draft,
  set,
  offline,
  onRedeem,
  onNext,
}: {
  step: number;
  total: number;
  draft: Settings;
  set: SetSetting;
  offline: boolean;
  onRedeem: (code: string) => Promise<string | null>;
  onNext: () => void;
}) {
  const [showKeys, setShowKeys] = useState(false);
  const done = missingApiKeys(draft).length === 0;

  return (
    <OnboardingShell
      step={step}
      total={total}
      heading="Подсказки во время разговора"
      primary={
        <Button disabled={!done} onClick={onNext}>
          Дальше
        </Button>
      }
      secondary={
        offline ? (
          <span className="text-caption text-danger">
            Нет соединения — проверьте интернет и повторите.
          </span>
        ) : undefined
      }
    >
      <p className="text-body text-fg-muted">{INTRO}</p>

      {done ? (
        <div className={cn("p-3", SURFACE_CARD_CLASS)}>
          <p className="text-body text-fg">Доступ уже настроен — запросы уходят от вашего имени.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className={cn("flex flex-col gap-1.5 p-3", SURFACE_CARD_CLASS)}>
            <span className="text-body text-fg">Код доступа</span>
            <p className="text-caption text-fg-subtle">{CODE_HINT}</p>
            <AccessCodeForm onRedeem={onRedeem} autoFocus />
          </div>

          {showKeys ? (
            <ApiKeysSection draft={draft} set={set} onRedeem={onRedeem} />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2.5 self-start"
              onClick={() => {
                setShowKeys(true);
              }}
            >
              У меня свои ключи Anthropic и Groq
              <ArrowRight className="size-3" aria-hidden />
            </Button>
          )}
        </div>
      )}
    </OnboardingShell>
  );
}
