/** What a check reports back: pass/fail, how much was measured, and why. */
export interface CheckResult {
  ok: boolean;
  /** How many assertions were actually made — a check that measures nothing is a bug. */
  checks: number;
  failures: string[];
  /** One line, already phrased for the pass and the fail case. */
  summary: string;
}

export interface TokenCheckOptions {
  /** The stylesheet that declares the palette (its `@theme inline` block). */
  cssPath: string;
  /** Directory the globs and the reported paths are relative to. */
  srcRoot: string;
  /** What counts as source. Defaults to `["**\/*.ts", "**\/*.tsx"]`. */
  srcGlobs?: string[];
  /** Base names to leave out — generated files, fixtures. */
  skipFiles?: string[];
  /** Project-specific utilities that share a colour prefix but name no token. */
  extraClasses?: string[];
}

/** One requirement. `fg`/`bg` may name a token or a list of them (cross product). */
export interface ContrastPair {
  fg: string | string[];
  bg: string | string[];
  /** The AA floor: 4.5 for text, 3 for UI components and graphical objects. */
  min: number;
  /** Shown in the failure line. Derived from `min` when omitted. */
  kind?: string;
}

export interface ContrastCheckOptions {
  cssPath: string;
  /** Scope name → the selectors to merge, in cascade order. */
  scopes: Record<string, string[]>;
  pairs: ContrastPair[];
}

export declare function checkTokens(options: TokenCheckOptions): CheckResult;
export declare function checkContrast(options: ContrastCheckOptions): CheckResult;
/** Prints the result and returns the process exit code. */
export declare function report(result: CheckResult): number;
