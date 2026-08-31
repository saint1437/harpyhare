import { Check, Lock } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  modelGroups,
  modelLabel,
  selectableModels,
  type ModelGroup,
  type ModelInfo,
} from "@/lib/models";
import { STT_PROVIDERS } from "@/lib/stt-providers";
import { cn } from "@/lib/utils";

const MENU_TITLE = "Модели";
const MENU_DESCRIPTION = "Выбор голосовой модели и модели ответа";
const INPUT_PLACEHOLDER = "Найти модель…";
const EMPTY_TEXT = "Ничего не найдено.";
const VOICE_GROUP_HEADING = "Голосовая модель";
const ANSWER_GROUP_HEADING = "Модель ответа";
const PROVIDER_HEADING_SEPARATOR = " · ";
const MISSING_KEY_HINT = "нет ключа";

function answerGroupHeading(group: ModelGroup, groupCount: number): string {
  if (groupCount < 2) return ANSWER_GROUP_HEADING;
  return `${ANSWER_GROUP_HEADING}${PROVIDER_HEADING_SEPARATOR}${group.label}`;
}

interface ModelCommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sttProvider: string;
  providersMissingKey: readonly string[];
  onSwitchSttProvider: (provider: string) => void;
  models: ModelInfo[];
  modelProvidersMissingKey: readonly string[];
  activeModelId: string;
  onSelectModel: (id: string) => void;
}

function ActiveMark({ active }: { active: boolean }) {
  return <Check className={cn("ml-auto", !active && "invisible")} />;
}

export function ModelCommandMenu({
  open,
  onOpenChange,
  sttProvider,
  providersMissingKey,
  onSwitchSttProvider,
  models,
  modelProvidersMissingKey,
  activeModelId,
  onSelectModel,
}: ModelCommandMenuProps) {
  const answerGroups = modelGroups(selectableModels(models, activeModelId));
  const close = () => {
    onOpenChange(false);
  };
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={MENU_TITLE}
      description={MENU_DESCRIPTION}
    >
      <CommandInput placeholder={INPUT_PLACEHOLDER} />
      <CommandList>
        <CommandEmpty>{EMPTY_TEXT}</CommandEmpty>
        <CommandGroup heading={VOICE_GROUP_HEADING}>
          {STT_PROVIDERS.map((p) => {
            const missingKey = providersMissingKey.includes(p.id);
            return (
              <CommandItem
                key={p.id}
                value={p.label}
                keywords={[VOICE_GROUP_HEADING]}
                disabled={missingKey}
                onSelect={() => {
                  onSwitchSttProvider(p.id);
                  close();
                }}
              >
                {missingKey && <Lock aria-hidden />}
                {p.label}
                {missingKey && (
                  <span className="ml-auto text-hint text-muted-foreground">
                    {MISSING_KEY_HINT}
                  </span>
                )}
                <ActiveMark active={p.id === sttProvider} />
              </CommandItem>
            );
          })}
        </CommandGroup>
        {answerGroups.map((group) => {
          const locked = modelProvidersMissingKey.includes(group.id);
          return (
            <CommandGroup key={group.id} heading={answerGroupHeading(group, answerGroups.length)}>
              {group.models.map((m) => (
                <CommandItem
                  key={m.id}
                  value={modelLabel(m)}
                  keywords={[ANSWER_GROUP_HEADING, group.label]}
                  disabled={locked}
                  onSelect={() => {
                    onSelectModel(m.id);
                    close();
                  }}
                >
                  {locked && <Lock aria-hidden />}
                  {modelLabel(m)}
                  {locked && (
                    <span className="ml-auto text-hint text-muted-foreground">
                      {MISSING_KEY_HINT}
                    </span>
                  )}
                  <ActiveMark active={m.id === activeModelId} />
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
