/**
 * The HUD palette, declared once in `hud.css`.
 *
 * The desktop imports the stylesheet itself (`@harpyhare/tokens/hud.css`); the
 * landing page imports this module and generates its `--app-*` replica from it.
 * See the header of `hud.css` for why the CSS is the source and this is the
 * reader, and never the other way round.
 */
export {
  HUD_CSS_PATH,
  HUD_DARK_ARMS,
  HUD_SCOPES,
  HUD_SELECTORS,
  hudBlock,
  hudDeclarationList,
  hudScope,
} from "./hud.js";
