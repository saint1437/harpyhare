import { Ear, EarOff } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { formatCombo } from "@/lib/hotkeys";

const ACTIVE_LABEL = "Автослушание включено";
const IDLE_LABEL = "Автослушание выключено";
const ACTIVE_ACTION = "нажмите, чтобы выключить";
const IDLE_ACTION = "нажмите, чтобы слушать собеседника и себя";
const ACTIVE_CLASS = "text-recording hover:text-recording/85";

interface AutoModeIndicatorProps {
  active: boolean;
  combo: string;
  onToggle: () => void;
}

export function AutoModeIndicator({ active, combo, onToggle }: AutoModeIndicatorProps) {
  const label = active ? ACTIVE_LABEL : IDLE_LABEL;
  const action = active ? ACTIVE_ACTION : IDLE_ACTION;
  const hint = combo === "" ? action : `${action} (${formatCombo(combo)})`;
  return (
    <IconButton
      title={`${label} — ${hint}`}
      aria-label={label}
      aria-pressed={active}
      onClick={onToggle}
      className={active ? ACTIVE_CLASS : undefined}
    >
      {active ? <Ear /> : <EarOff />}
    </IconButton>
  );
}
