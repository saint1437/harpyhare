import { AccessCodeForm } from "@/components/AccessCodeForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { openExternal } from "@/ipc/commands";
import type { LlmProvider, SttProvider } from "@/ipc/types";
import { apiKeyInfo, type ApiKeyId } from "@/lib/api-keys";
import type { SectionProps } from "../contract";
import { SettingBlock, SettingGroup, SettingRow, SettingSelect } from "../fields";

type ApiKeysSectionProps = SectionProps & {
  onRedeem: (code: string) => Promise<string | null>;
};

const KEY_FIELDS: { id: ApiKeyId; placeholder: string }[] = [
  { id: "anthropic", placeholder: "sk-ant-…" },
  { id: "xclis", placeholder: "sk-…" },
  { id: "groq", placeholder: "gsk_…" },
  { id: "deepgram", placeholder: "Deepgram API key" },
];

function isActiveKey(id: ApiKeyId, llmProvider: LlmProvider, sttProvider: SttProvider): boolean {
  if (id === "anthropic" || id === "xclis") return id === llmProvider;
  return id === sttProvider;
}

export function ApiKeysSection({ draft, set, onRedeem }: ApiKeysSectionProps) {
  if (draft.access_token.trim() !== "") {
    return (
      <SettingGroup
        title="Доступ к API"
        description="Запросы идут через общий доступ по коду, свои ключи и выбранные провайдеры не используются."
      >
        <SettingRow label="Код доступа активен" hint="Отвязка вернёт запросы на ваши API-ключи.">
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
    <>
      <SettingGroup
        title="Провайдеры"
        description="Оригинальные сервисы сохранены, альтернативные можно включать независимо друг от друга."
      >
        <SettingRow label="Claude" hint="Текст, контекст и скриншоты отправляются выбранному API.">
          <SettingSelect
            ariaLabel="Провайдер Claude API"
            value={draft.llm_provider}
            onValueChange={(v) => {
              set("llm_provider", v as LlmProvider);
            }}
          >
            <SelectItem value="anthropic">Anthropic · официальный</SelectItem>
            <SelectItem value="xclis">Xclis · альтернативный</SelectItem>
          </SettingSelect>
        </SettingRow>

        <SettingRow
          label="Распознавание речи"
          hint="Системный звук распознаётся выбранным STT-сервисом."
        >
          <SettingSelect
            ariaLabel="Провайдер распознавания речи"
            value={draft.stt_provider}
            onValueChange={(v) => {
              const provider = v as SttProvider;
              set("stt_provider", provider);
              if (provider === "deepgram" && draft.stt_translate) {
                set("stt_translate", false);
              }
            }}
          >
            <SelectItem value="groq">Groq · Whisper</SelectItem>
            <SelectItem value="deepgram">Deepgram · Nova-3</SelectItem>
          </SettingSelect>
        </SettingRow>
      </SettingGroup>

      <SettingGroup
        title="Ключи API"
        description="Ключи сохраняются отдельно: активный используется сейчас, остальные остаются запасными."
      >
        <SettingBlock label="Код доступа" hint="Быстрый путь: собственные API-ключи не нужны.">
          <AccessCodeForm onRedeem={onRedeem} />
        </SettingBlock>

        {KEY_FIELDS.map(({ id, placeholder }) => {
          const info = apiKeyInfo(id);
          const active = isActiveKey(id, draft.llm_provider, draft.stt_provider);
          return (
            <SettingBlock
              key={id}
              label={`Ключ ${info.name}`}
              hint={`${active ? "Используется сейчас. " : "Сохранён как запасной. "}${info.purpose}.`}
            >
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
      </SettingGroup>
    </>
  );
}
