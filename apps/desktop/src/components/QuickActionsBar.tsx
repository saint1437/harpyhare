import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import type { QuickAction } from "@/ipc/types";
import { quickActionHint } from "@/lib/quick-actions";

export interface QuickActionsBarProps {
  actions: QuickAction[];
  combo: string;
  disabled: boolean;
  onRun: (action: QuickAction) => void;
}

const BAR_LABEL = "Быстрые действия";

function keepPromptFocus(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
}

interface QuickActionButtonProps {
  action: QuickAction;
  hint: string | null;
  disabled: boolean;
  onRun: () => void;
}

function QuickActionButton({ action, hint, disabled, onRun }: QuickActionButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="compact"
      disabled={disabled}
      title={action.title}
      onClick={onRun}
      className="rounded-full bg-surface px-2.5 text-foreground/80 ring-1 ring-border ring-inset hover:bg-surface-active"
    >
      {action.title}
      {hint !== null && <span className="font-mono text-foreground/45">{hint}</span>}
    </Button>
  );
}

export function QuickActionsBar({ actions, combo, disabled, onRun }: QuickActionsBarProps) {
  if (actions.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={BAR_LABEL}
      onMouseDown={keepPromptFocus}
      className="no-scrollbar mb-2 flex min-w-0 items-center gap-1.5 overflow-x-auto"
    >
      {actions.map((action, index) => (
        <QuickActionButton
          key={action.id}
          action={action}
          hint={quickActionHint(combo, index)}
          disabled={disabled}
          onRun={() => {
            onRun(action);
          }}
        />
      ))}
    </div>
  );
}
