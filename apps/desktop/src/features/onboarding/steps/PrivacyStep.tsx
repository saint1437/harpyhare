import { Button } from "@/components/ui/button";
import type { SetSetting } from "@/features/settings/contract";
import { SettingGroup, SettingRow, SettingSwitch } from "@/features/settings/fields";
import { useDict } from "@/hooks/useDict";
import type { Settings } from "@/ipc/types";
import { OnboardingShell } from "../OnboardingShell";

/**
 * The honest declaration. Three of these four lines describe behaviour the
 * interface has never admitted to anywhere: the always-on ring buffer was a
 * settings row on a tab nobody opens, its pre-roll silently extended every
 * recording backwards, and every finished transcript and every screenshot went to
 * the system clipboard with no setting and no mention.
 */
export function PrivacyStep({
  step,
  total,
  draft,
  set,
  onNext,
}: {
  step: number;
  total: number;
  draft: Settings;
  set: SetSetting;
  onNext: () => void;
}) {
  const dict = useDict();
  const copy = dict.onboarding.privacy;

  return (
    <OnboardingShell
      step={step}
      total={total}
      heading={copy.heading}
      primary={<Button onClick={onNext}>{dict.common.actions.next}</Button>}
      secondary={<span className="text-caption text-fg-subtle">{copy.closing}</span>}
    >
      <ul className="flex flex-col gap-2.5">
        {copy.disclosures.map((line) => (
          <li key={line} className="flex gap-2.5 text-body text-fg-muted">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-listening" aria-hidden />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>

      <SettingGroup title={copy.togglesTitle}>
        <SettingRow label={copy.toggles.buffer.label} hint={copy.toggles.buffer.hint}>
          <SettingSwitch
            ariaLabel={copy.toggles.buffer.label}
            checked={draft.buffer_enabled}
            onCheckedChange={(v) => {
              set("buffer_enabled", v);
            }}
          />
        </SettingRow>
        <SettingRow label={copy.toggles.clipboard.label} hint={copy.toggles.clipboard.hint}>
          <SettingSwitch
            ariaLabel={copy.toggles.clipboard.label}
            checked={draft.copy_results_to_clipboard}
            onCheckedChange={(v) => {
              set("copy_results_to_clipboard", v);
            }}
          />
        </SettingRow>
      </SettingGroup>
    </OnboardingShell>
  );
}
