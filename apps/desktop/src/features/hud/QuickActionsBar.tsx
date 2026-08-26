import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { useDict } from "@/hooks/useDict";
import type { QuickAction } from "@/ipc/types";
import { quickActionHint } from "@/lib/quick-actions";

/**
 * Deliberately still prop-driven, and the only leaf in the composer that is:
 * the numbering it prints is the contract with the launcher's editor and with
 * `useQuickActionKeys`, and seven cases pin it down by rendering the component
 * with a list. A slice read inside would move those cases onto a store seam
 * without testing anything more.
 */
export interface QuickActionsBarProps {
  actions: QuickAction[];
  combo: string;
  disabled: boolean;
  onRun: (action: QuickAction) => void;
}

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
      className="bg-surface text-fg/85 ring-1 ring-inset ring-line hover:bg-surface-active active:bg-surface"
    >
      {action.title}
      {hint !== null && (
        <span className="font-mono text-hint text-fg-subtle/80 tabular-nums">{hint}</span>
      )}
    </Button>
  );
}

export function QuickActionsBar({ actions, combo, disabled, onRun }: QuickActionsBarProps) {
  const barLabel = useDict().hud.quickActions.barLabel;
  if (actions.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={barLabel}
      onMouseDown={keepPromptFocus}
      className="no-scrollbar mb-1.5 flex min-w-0 items-center gap-1 overflow-x-auto"
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
