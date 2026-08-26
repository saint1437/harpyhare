import importX from "eslint-plugin-import-x";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { sharedSettings, sharedTypeScriptRules } from "./base.js";

/**
 * The type-aware block over `src/**`, identical in both apps down to the
 * plugin list. A project adds what only it has (`react-refresh` in the desktop,
 * `@next/next` in the landing) through `plugins`/`rules` rather than by copying
 * the block.
 */
export function reactSrcConfig({
  tsconfigRootDir,
  files = ["src/**/*.{ts,tsx}"],
  plugins = {},
  rules = {},
}) {
  return {
    files,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir },
      globals: { ...globals.browser },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "import-x": importX,
      ...plugins,
    },
    settings: sharedSettings,
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      ...sharedTypeScriptRules,
      ...rules,
    },
  };
}
