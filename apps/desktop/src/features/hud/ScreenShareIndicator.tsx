import { Eye, EyeOff } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { useDict } from "@/hooks/useDict";
import { format } from "@/i18n";

const VISIBLE_CLASS = "text-warning hover:text-warning/85";

interface ScreenShareIndicatorProps {
  visible: boolean;
  onToggle: () => void;
}

export function ScreenShareIndicator({ visible, onToggle }: ScreenShareIndicatorProps) {
  const copy = useDict().hud.screenShare;
  const state = copy.states[visible ? "visible" : "hidden"];
  return (
    <IconButton
      title={format(copy.title, { label: state.label, action: state.action })}
      aria-label={state.label}
      aria-pressed={visible}
      onClick={onToggle}
      className={visible ? VISIBLE_CLASS : undefined}
    >
      {visible ? <Eye /> : <EyeOff />}
    </IconButton>
  );
}
