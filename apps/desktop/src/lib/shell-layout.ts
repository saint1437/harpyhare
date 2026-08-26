/**
 * The HUD's fixed geometry, in one place because two layers need the same
 * numbers: the markup lays the columns out, and `useWindowFrameSync` has to ask
 * Rust for a window wide enough to hold them. They used to live in the preview
 * component, which made `hooks/` import a component to compute a window size.
 */
export const PREVIEW_PANEL_WIDTH_PX = 570;
export const SHELL_COLUMN_GAP_PX = 10;
export const SHELL_PADDING_PX = 12;

/** How much wider the window must be while the preview column is open. */
export const PREVIEW_EXTRA_WIDTH_PX = PREVIEW_PANEL_WIDTH_PX + SHELL_COLUMN_GAP_PX;
