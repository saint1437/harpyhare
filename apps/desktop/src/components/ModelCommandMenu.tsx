import { Check } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { modelLabel, selectableModels, type ModelInfo } from "@/lib/models";
import { STT_PROVIDERS } from "@/lib/stt-providers";
import { cn } from "@/lib/utils";

const MENU_TITLE = "Модели";
const MENU_DESCRIPTION = "Выбор голосовой модели и модели ответа";
const INPUT_PLACEHOLDER = "Найти модель…";
const EMPTY_TEXT = "Ничего не найдено.";
const VOICE_GROUP_HEADING = "Голосовая модель";
const ANSWER_GROUP_HEADING = "Модель ответа";

interface ModelCommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sttProvider: string;
  onSwitchSttProvider: (provider: string) => void;
  models: ModelInfo[];
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
  onSwitchSttProvider,
  models,
  activeModelId,
  onSelectModel,
}: ModelCommandMenuProps) {
  const answerModels = selectableModels(models, activeModelId);
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
          {STT_PROVIDERS.map((p) => (
            <CommandItem
              key={p.value}
              value={`${VOICE_GROUP_HEADING} ${p.label}`}
              onSelect={() => {
                onSwitchSttProvider(p.value);
                close();
              }}
            >
              {p.label}
              <ActiveMark active={p.value === sttProvider} />
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={ANSWER_GROUP_HEADING}>
          {answerModels.map((m) => (
            <CommandItem
              key={m.id}
              value={`${ANSWER_GROUP_HEADING} ${modelLabel(m)}`}
              onSelect={() => {
                onSelectModel(m.id);
                close();
              }}
            >
              {modelLabel(m)}
              <ActiveMark active={m.id === activeModelId} />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
