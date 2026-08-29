import type { DemoMessageSeed, ListeningStateId, OrbStateId } from "@/i18n/demo-types";

/**
 * The mock window's ground depth. This is a LANDING-ONLY control and not a
 * setting the app has: the poster ground behind the frame is oxblood, and the
 * same window reads differently against it than it does against a desktop.
 *
 * The app's own `theme` — system / light / dark — lives where it belongs, in
 * the settings screen's "Вид" tab. The demo used to conflate the two and
 * labelled this control "Серая"/"Чёрная", which are values the product removed:
 * `Settings.theme` migrates them both to `dark`. So the page was advertising a
 * setting that no longer exists, in the place where the real one should be.
 */
export type AppDepth = "default" | "black";

export type DemoMessage = DemoMessageSeed;

export interface DemoChat {
  id: string;
  title: string;
  messages: DemoMessage[];
  draft: string;
  /** Set by the region-screenshot button; drawn as a chip in the composer. */
  attachments: number;
}

export interface DemoNotification {
  /** Identity of the message. A repeat of the same one collapses onto one card. */
  id: string;
  tone: "danger" | "warning";
  title: string;
  body: string;
  count: number;
  /**
   * Bumped on every repeat. It is part of the React key so the CSS life bar
   * remounts and its countdown restarts — the app does the same, for the same
   * reason: a second copy of an error that silently bumped a counter looked to
   * the user like nothing had happened.
   */
  seq: number;
}

export interface DemoTurn {
  speaker: "interviewer" | "user";
  text: string;
  sent: boolean;
}

export type { ListeningStateId, OrbStateId };
