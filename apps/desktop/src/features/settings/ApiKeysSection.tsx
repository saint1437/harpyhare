import { useState } from "react";
import { AccessCodeForm } from "@/components/AccessCodeForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDict } from "@/hooks/useDict";
import { format } from "@/i18n";
import type { Dictionary } from "@/i18n/types";
import { openExternal } from "@/ipc/commands";
import { apiKeyInfo, type ApiKeyId } from "@/lib/api-keys";
import type { SecretsApi } from "./contract";
import { SettingBlock, SettingGroup, SettingRow } from "./fields";

/**
 * The one settings section that does NOT edit the draft, because what it edits
 * never reaches the frontend: the keys and the access token live in Rust behind
 * `SecretsStatus`, and each write is its own command.
 *
 * The field therefore works in **replace mode**, not edit mode: it starts blank
 * on every visit, shows the stored key only as a masked tail, and an empty value
 * means "leave it alone". Deleting a key is the explicit «Удалить» — which is
 * what closes the old hole, where an autosave of the settings form carried the
 * empty string over a working key.
 */
export interface ApiKeysSectionProps {
  secrets: SecretsApi;
  /** Онбординг перепроходится отсюда: флаг уже стоит, а дверь нужна. */
  onReplayOnboarding?: () => void;
}

const KEY_FIELDS: { id: ApiKeyId; placeholder: string }[] = [
  { id: "anthropic", placeholder: "sk-ant-…" },
  { id: "groq", placeholder: "gsk_…" },
];

function keyHint(id: ApiKeyId, mask: string, dict: Dictionary): string {
  const copy = dict.settings.apiKeys;
  const purpose = dict.common.apiKeys.purpose[id];
  return format(mask === "" ? copy.keyPurpose : copy.keyPurposeStored, { purpose, mask });
}

function ApiKeyField({
  id,
  placeholder,
  secrets,
}: {
  id: ApiKeyId;
  placeholder: string;
  secrets: SecretsApi;
}) {
  const dict = useDict();
  const copy = dict.settings.apiKeys;
  const info = apiKeyInfo(id);
  const keyLabel = format(copy.keyLabel, { name: info.name });
  const stored = secrets.status[`${id}_key_set`];
  const mask = secrets.status[`${id}_key_hint`];
  // Local and transient: the typed value belongs to this field until it is sent,
  // and nothing that autosaves ever sees it.
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const empty = value.trim() === "";

  const save = () => {
    if (busy || empty) return;
    setBusy(true);
    void secrets
      .setKey(id, value)
      .then((failure) => {
        // Clearing on success is what makes the field a replace box rather than
        // an editor: what is stored is shown by the mask in the hint.
        if (failure === null) setValue("");
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const clear = () => {
    if (busy) return;
    setBusy(true);
    void secrets.clearKey(id).finally(() => {
      setBusy(false);
    });
  };

  return (
    <SettingBlock label={keyLabel} hint={keyHint(id, mask, dict)}>
      <div className="flex items-center gap-2">
        <Input
          type="password"
          autoComplete="off"
          aria-label={keyLabel}
          placeholder={stored ? mask : placeholder}
          value={value}
          disabled={busy}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        {/* Три кнопки на каждое из двух полей: без имени с названием ключа
            и на экране, и в скринридере получается шесть одинаковых «Сохранить». */}
        <Button
          size="sm"
          aria-label={`${copy.saveKey} — ${keyLabel}`}
          disabled={busy || empty}
          onClick={save}
        >
          {copy.saveKey}
        </Button>
        {stored && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${copy.clearKey} — ${keyLabel}`}
            disabled={busy}
            onClick={clear}
          >
            {copy.clearKey}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${copy.consoleKey} — ${keyLabel}`}
          onClick={() => {
            void openExternal(info.consoleUrl);
          }}
        >
          {copy.consoleKey}
        </Button>
      </div>
    </SettingBlock>
  );
}

export function ApiKeysSection({ secrets, onReplayOnboarding }: ApiKeysSectionProps) {
  const dict = useDict();
  const copy = dict.settings.apiKeys;
  const title = dict.common.apiKeys.accessTitle;

  if (secrets.status.access_code_active) {
    return (
      <SettingGroup title={title} description={copy.accessCodeActiveDescription}>
        <SettingRow label={copy.accessCodeActiveLabel} hint={copy.accessCodeActiveHint}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void secrets.clearAccessCode();
            }}
          >
            {copy.unlink}
          </Button>
        </SettingRow>
      </SettingGroup>
    );
  }

  return (
    <SettingGroup title={title} description={copy.description}>
      <SettingBlock label={copy.accessCodeLabel} hint={copy.accessCodeHint}>
        <AccessCodeForm onRedeem={secrets.redeem} />
      </SettingBlock>
      {KEY_FIELDS.map(({ id, placeholder }) => (
        <ApiKeyField key={id} id={id} placeholder={placeholder} secrets={secrets} />
      ))}
      {onReplayOnboarding !== undefined && (
        <SettingRow label={copy.replayLabel} hint={copy.replayHint}>
          <Button variant="ghost" size="sm" onClick={onReplayOnboarding}>
            {copy.replay}
          </Button>
        </SettingRow>
      )}
    </SettingGroup>
  );
}
