import { Ear, EarOff } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { useDict } from "@/hooks/useDict";
import { format } from "@/i18n";
import { withComboHint } from "@/lib/hotkeys";

const ACTIVE_CLASS = "text-listening hover:text-listening/85";

interface AutoModeIndicatorProps {
  active: boolean;
  combo: string;
  onToggle: () => void;
}

export function AutoModeIndicator({ active, combo, onToggle }: AutoModeIndicatorProps) {
  const copy = useDict().hud.autoMode;
  const state = copy.states[active ? "active" : "idle"];
  return (
    <IconButton
      title={format(copy.title, {
        label: state.label,
        action: withComboHint(state.action, combo),
      })}
      aria-label={state.label}
      aria-pressed={active}
      onClick={onToggle}
      className={active ? ACTIVE_CLASS : undefined}
    >
      {active ? <Ear /> : <EarOff />}
    </IconButton>
  );
}
