import { AccessCodeForm } from "@/components/AccessCodeForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openExternal } from "@/ipc/commands";
import { API_ACCESS_TITLE, apiKeyInfo, type ApiKeyId } from "@/lib/api-keys";
import type { SectionProps } from "../contract";
import { SettingBlock, SettingGroup, SettingRow } from "../fields";

type ApiKeysSectionProps = SectionProps & {
  onRedeem: (code: string) => Promise<string | null>;
  /** Онбординг перепроходится отсюда: флаг уже стоит, а дверь нужна. */
  onReplayOnboarding?: () => void;
};

const KEY_FIELDS: { id: ApiKeyId; placeholder: string }[] = [
  { id: "anthropic", placeholder: "sk-ant-…" },
  { id: "groq", placeholder: "gsk_…" },
];

export function ApiKeysSection({ draft, set, onRedeem, onReplayOnboarding }: ApiKeysSectionProps) {
  if (draft.access_token.trim() !== "") {
    return (
      <SettingGroup
        title={API_ACCESS_TITLE}
        description="Запросы идут через общий доступ по коду, свои ключи не используются."
      >
        <SettingRow label="Код доступа активен" hint="Отвязка вернёт запросы на ваши ключи API.">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              set("access_token", "");
            }}
          >
            Отвязать
          </Button>
        </SettingRow>
      </SettingGroup>
    );
  }

  return (
    <SettingGroup
      title={API_ACCESS_TITLE}
      description="Нужен код доступа либо пара своих ключей API — иначе запускать нечего."
    >
      <SettingBlock label="Код доступа" hint="Быстрый путь: заводить ключи не нужно.">
        <AccessCodeForm onRedeem={onRedeem} />
      </SettingBlock>
      {KEY_FIELDS.map(({ id, placeholder }) => {
        const info = apiKeyInfo(id);
        return (
          <SettingBlock key={id} label={`Ключ ${info.name}`} hint={`Нужен для ${info.purpose}.`}>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                autoComplete="off"
                aria-label={`Ключ ${info.name}`}
                placeholder={placeholder}
                value={draft[`${id}_api_key`]}
                onChange={(e) => {
                  set(`${id}_api_key`, e.target.value);
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void openExternal(info.consoleUrl);
                }}
              >
                Где взять
              </Button>
            </div>
          </SettingBlock>
        );
      })}
      {onReplayOnboarding !== undefined && (
        <SettingRow
          label="Первичная настройка"
          hint="Короткий проход по доступам, приватности и клавише записи."
        >
          <Button variant="ghost" size="sm" onClick={onReplayOnboarding}>
            Пройти заново
          </Button>
        </SettingRow>
      )}
    </SettingGroup>
  );
}
