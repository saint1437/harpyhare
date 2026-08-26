/** The blocks `hud.css` declares. */
export type HudBlock =
  "light" | "dark" | "darkSystem" | "launcherLight" | "launcherDark" | "launcherDarkSystem";

/** Absolute path of the stylesheet — what a check script passes as `cssPath`. */
export declare const HUD_CSS_PATH: string;

/** Block name → the selector that carries it in the stylesheet. */
export declare const HUD_SELECTORS: Record<HudBlock, string>;

/**
 * Scope name → the selectors that stack up to make it, in cascade order.
 * Six: light and dark × HUD and launcher, plus the two OS-triggered dark arms,
 * which are separate text in the file and so are measured separately.
 */
export declare const HUD_SCOPES: Record<string, string[]>;

/** The pairs of blocks that must stay identical: `[OS-triggered, forced]`. */
export declare const HUD_DARK_ARMS: [HudBlock, HudBlock][];

/** Every `--name: value` of one block, in file order, duplicates included. */
export declare function hudDeclarationList(block: HudBlock): [string, string][];

/** The same as a lookup; a later declaration wins, exactly as in a browser. */
export declare function hudBlock(block: HudBlock): Record<string, string>;

/** One scope of `HUD_SCOPES`, its selectors merged in cascade order. */
export declare function hudScope(scope: string): Record<string, string>;
