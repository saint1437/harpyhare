import { StateBadge } from "@/components/StateBadge";
import { Button } from "@/components/ui/button";
import { canLaunch, type Readiness } from "@/features/settings/readiness";
import { useDict } from "@/hooks/useDict";
import type { Settings } from "@/ipc/types";
import { effectiveCombo, formatCombo, hotkeyAction, hotkeyHint } from "@/lib/hotkeys";
import { cn, SURFACE_CARD_CLASS } from "@/lib/utils";
import { OnboardingShell } from "../OnboardingShell";

const RECORD_ACTION = "record";

/**
 * Hands over exactly one thing to remember. The combination and its caption both
 * come from the hotkey registry — a literal here would go stale the moment a user
 * rebinds the key, which is precisely when the hint matters most.
 */
export function ReadyStep({
  step,
  total,
  settings,
  readiness,
  launching,
  onLaunch,
  onFixAudio,
  onOpenLauncher,
}: {
  step: number;
  total: number;
  settings: Settings;
  readiness: Readiness;
  launching: boolean;
  onLaunch: () => void;
  onFixAudio: () => void;
  onOpenLauncher: () => void;
}) {
  const dict = useDict();
  const copy = dict.onboarding.ready;
  const combo = effectiveCombo(settings.hotkeys, RECORD_ACTION);
  const hint = hotkeyHint(hotkeyAction(RECORD_ACTION), dict);
  const audioReady = readiness.permissions.audioOk;
  const ready = readiness.ready && !readiness.checking;
  // The third launch button in the app: the enabling rule is the shared function,
  // never a second copy of the expression — a button that is live in one place and
  // grey in another reads as a broken app.
  const launchable = canLaunch(readiness, launching);
  // A blocker other than system audio (the mic for auto-listening, keys on a
  // replay): the button must name the reason — LauncherApp silently refuses to
  // launch without readiness.ready, so the click used to go nowhere.
  const otherBlocker = ready || !audioReady ? null : (readiness.blockers[0]?.label ?? null);

  return (
    <OnboardingShell
      step={step}
      total={total}
      heading={ready ? copy.headingReady : copy.headingAlmost}
      primary={
        // Launching is physically blocked without system audio access
        // (`canLaunch` requires `audioOk`), so a "launch anyway" button would be
        // a promise the app cannot keep.
        audioReady ? (
          <Button disabled={!launchable} onClick={onLaunch}>
            {launching ? copy.launching : copy.launch}
          </Button>
        ) : (
          <Button onClick={onFixAudio}>{copy.grantAudio}</Button>
        )
      }
      secondary={
        <Button variant="ghost" size="sm" onClick={onOpenLauncher}>
          {audioReady ? copy.openLauncher : copy.continueWithout}
        </Button>
      }
    >
      <div className={cn("flex flex-col items-center gap-2 px-4 py-7", SURFACE_CARD_CLASS)}>
        <span className="font-mono text-display font-semibold tracking-wider text-fg">
          {combo === "" ? copy.unassigned : formatCombo(combo)}
        </span>
        <span className="text-body text-fg-muted">{hint}</span>
      </div>

      <p className="text-caption text-fg-subtle">{copy.afterwards}</p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <StateBadge
          tone={readiness.missingKeys.length === 0 ? "success" : "warning"}
          label={dict.common.apiKeys.accessTitle}
        />
        {audioReady ? (
          <StateBadge tone="success" label={copy.audioOk} />
        ) : (
          <StateBadge tone="warning" label={copy.audioMissing} />
        )}
        {otherBlocker !== null && <StateBadge tone="warning" label={otherBlocker} />}
      </div>
    </OnboardingShell>
  );
}
