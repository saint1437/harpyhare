import {
  ArrowBigUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronUp,
  Command,
  CornerDownLeft,
  Minus,
  Option,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { comboTokens, type ComboIconName, type ComboToken } from "@/lib/hotkeys";

const COMBO_ICONS: Record<ComboIconName, LucideIcon> = {
  cmd: Command,
  shift: ArrowBigUp,
  option: Option,
  ctrl: ChevronUp,
  enter: CornerDownLeft,
  up: ArrowUp,
  down: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
  plus: Plus,
  minus: Minus,
};

function ComboTokenView({ token }: { token: ComboToken }) {
  if (token.type === "text") {
    return <span className="font-mono text-caption text-foreground/90">{token.text}</span>;
  }
  const Icon = COMBO_ICONS[token.icon];
  return <Icon className="size-3 text-foreground/90" />;
}

export function ComboChip({ combo }: { combo: string }) {
  return (
    <kbd className="inline-flex h-5 w-full items-center justify-center gap-0.5 rounded-sm bg-surface px-1.5 ring-1 ring-border ring-inset">
      {comboTokens(combo).map((token, i) => (
        <ComboTokenView key={i} token={token} />
      ))}
    </kbd>
  );
}
