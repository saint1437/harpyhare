/**
 * The repo's formatting, with no Tailwind plugin: it is what the ROOT config
 * uses. The plugin sorts classes against a specific stylesheet, and the two apps
 * have different ones — a root-level run with somebody's stylesheet would
 * reformat the other app's classes differently from that app's own `format`.
 *
 * @type {import("prettier").Config}
 */
const config = {
  printWidth: 100,
  singleQuote: false,
  semi: true,
  trailingComma: "all",
};

export default config;
