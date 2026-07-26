import type { SectionProps } from "../contract";
import { ScreenShell } from "../ScreenShell";
import { ApiKeysSection } from "../sections/ApiKeysSection";
import { AppearanceSection } from "../sections/AppearanceSection";
import { BehaviorSection } from "../sections/BehaviorSection";
import { HotkeysSection } from "../sections/HotkeysSection";
import { SttSection } from "../sections/SttSection";
import { WindowSection } from "../sections/WindowSection";

type SettingsScreenProps = SectionProps & {
  onRedeem: (code: string) => Promise<string | null>;
};

export function SettingsScreen({ draft, set, onRedeem }: SettingsScreenProps) {
  return (
    <ScreenShell screen="settings">
      <ApiKeysSection draft={draft} set={set} onRedeem={onRedeem} />
      <SttSection draft={draft} set={set} />
      <HotkeysSection draft={draft} set={set} />
      <WindowSection draft={draft} set={set} />
      <BehaviorSection draft={draft} set={set} />
      <AppearanceSection draft={draft} set={set} />
    </ScreenShell>
  );
}
