import type { PermissionsApi } from "@/hooks/usePermissions";
import type { ApiKeyInfo } from "@/lib/api-keys";

/**
 * A blocker as everything that merely REPORTS one sees it. The launcher narrows
 * this to `LauncherBlocker`, which also carries the screen to route to;
 * onboarding has no screens to route to and must not see them.
 */
export interface ReadinessBlocker {
  label: string;
}

/** Can the HUD be launched, and if not — why. */
export interface Readiness {
  missingKeys: ApiKeyInfo[];
  permissions: PermissionsApi;
  autoModeEnabled: boolean;
  blockers: ReadinessBlocker[];
  checking: boolean;
  ready: boolean;
}

/**
 * The enabling rule for every launch button in the app (the launcher's header,
 * the «Старт» screen, onboarding's last step) — one function rather than a copy
 * of the expression per surface: a button that is live in one place and grey in
 * another reads as a broken app.
 */
export function canLaunch(readiness: Readiness, launching: boolean): boolean {
  return readiness.ready && !readiness.checking && !launching;
}
