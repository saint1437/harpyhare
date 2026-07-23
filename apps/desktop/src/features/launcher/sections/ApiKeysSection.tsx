import { AccessCodeForm } from "@/components/AccessCodeForm";
import { LabeledDivider } from "@/components/LabeledDivider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SectionProps } from "../contract";
import { Field } from "../fields";

type ApiKeysSectionProps = SectionProps & {
  onRedeem: (code: string) => Promise<string | null>;
};

export function ApiKeysSection({ draft, set, onRedeem }: ApiKeysSectionProps) {
  if (draft.access_token.trim() !== "") {
    return (
      <ActiveAccessCode
        onUnlink={() => {
          set("access_token", "");
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Field label="Код доступа">
        <AccessCodeForm onRedeem={onRedeem} />
      </Field>
      <LabeledDivider label="или свои ключи" />
      <ApiKeyField
        label="Ключ Anthropic"
        placeholder="sk-ant-…"
        value={draft.anthropic_api_key}
        onChange={(v) => {
          set("anthropic_api_key", v);
        }}
      />
      <ApiKeyField
        label="Ключ Groq"
        placeholder="gsk_…"
        value={draft.groq_api_key}
        onChange={(v) => {
          set("groq_api_key", v);
        }}
      />
    </div>
  );
}

function ActiveAccessCode({ onUnlink }: { onUnlink: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface px-3 py-2.5">
      <span className="text-body">Доступ по коду активен</span>
      <span className="text-caption text-muted-foreground">
        Запросы идут через бесплатный доступ, свои ключи не используются. Отвяжи код, чтобы
        вернуться к собственным ключам — изменение применится сразу.
      </span>
      <Button variant="ghost" size="sm" className="self-start" onClick={onUnlink}>
        Отвязать код
      </Button>
    </div>
  );
}

function ApiKeyField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="password"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </Field>
  );
}
