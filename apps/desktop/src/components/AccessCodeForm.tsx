import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeAccessCode } from "@/lib/access-code";
import { errorTitle } from "@/lib/errors";
import { notifyError, notifySuccess } from "@/lib/notifications";

export interface AccessCodeFormProps {
  onRedeem: (code: string) => Promise<string | null>;
  autoFocus?: boolean;
}

const SUCCESS_TITLE = "Код принят";
const SUCCESS_DETAIL = "Запросы пойдут через сервер — свои ключи вводить не нужно.";

/**
 * Обе половины ответа — в уведомлениях. Отказ приходит сырым `String(e)` от
 * Tauri и бывает в несколько строк, а поле с кнопкой стоит внутри узкой карточки
 * онбординга; успех же раньше не показывался вовсе — поле просто очищалось.
 */
export function AccessCodeForm({ onRedeem, autoFocus }: AccessCodeFormProps) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isEmpty = normalizeAccessCode(code) === "";

  const activate = () => {
    if (submitting || isEmpty) return;
    setSubmitting(true);
    void onRedeem(code)
      .then((message) => {
        if (message === null) {
          setCode("");
          notifySuccess(SUCCESS_TITLE, SUCCESS_DETAIL);
          return;
        }
        notifyError(errorTitle("badAccessCode"), message);
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
        value={code}
        disabled={submitting}
        onChange={(e) => {
          setCode(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") activate();
        }}
      />
      <Button onClick={activate} disabled={submitting || isEmpty}>
        {submitting ? "Активация…" : "Активировать"}
      </Button>
    </div>
  );
}
