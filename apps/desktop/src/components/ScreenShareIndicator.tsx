import { Eye, EyeOff } from "lucide-react";
import { IconButton } from "@/components/IconButton";

const VISIBLE_LABEL = "Видно при демонстрации экрана";
const HIDDEN_LABEL = "Скрыто при демонстрации экрана";
const VISIBLE_ACTION = "нажмите, чтобы скрыть";
const HIDDEN_ACTION = "нажмите, чтобы показывать";
const VISIBLE_CLASS = "text-primary hover:text-primary";

interface ScreenShareIndicatorProps {
  visible: boolean;
  onToggle: () => void;
}

export function ScreenShareIndicator({ visible, onToggle }: ScreenShareIndicatorProps) {
  const label = visible ? VISIBLE_LABEL : HIDDEN_LABEL;
  const action = visible ? VISIBLE_ACTION : HIDDEN_ACTION;
  return (
    <IconButton
      title={`${label} — ${action}`}
      aria-label={label}
      aria-pressed={visible}
      onClick={onToggle}
      className={visible ? VISIBLE_CLASS : undefined}
    >
      {visible ? <Eye /> : <EyeOff />}
    </IconButton>
  );
}
