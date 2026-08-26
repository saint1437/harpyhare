import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDict } from "@/hooks/useDict";
import { errorTitle } from "@/i18n/errors";
import { normalizeAccessCode } from "@/lib/access-code";
import { notifyError, notifySuccess } from "@/lib/notifications";

export interface AccessCodeFormProps {
  onRedeem: (code: string) => Promise<string | null>;
  autoFocus?: boolean;
}

/** The mask is punctuation and placeholder Xs — the same in every language. */
const CODE_PLACEHOLDER = "XXXXX-XXXXX-XXXXX-XXXXX";

/**
 * Обе половины ответа — в уведомлениях. Отказ приходит сырым `String(e)` от
 * Tauri и бывает в несколько строк, а поле с кнопкой стоит внутри узкой карточки
 * онбординга; успех же раньше не показывался вовсе — поле просто очищалось.
 */
export function AccessCodeForm({ onRedeem, autoFocus }: AccessCodeFormProps) {
  const dict = useDict();
  const copy = dict.common.accessCode;
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
          notifySuccess(copy.successTitle, copy.successDetail);
          return;
        }
        notifyError(errorTitle("badAccessCode", dict), message);
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
        placeholder={CODE_PLACEHOLDER}
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
        {submitting ? copy.submitting : copy.submit}
      </Button>
    </div>
  );
}
