import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import importX from "eslint-plugin-import-x";
import prettier from "eslint-config-prettier";
import globals from "globals";

const buildArtifactAndConfigIgnores = {
  ignores: ["dist", "src-tauri", "*.config.js", "*.config.ts", "!vite.config.ts", "*.config.d.ts"],
};

const srcTypeAwareRules = {
  files: ["src/**/*.{ts,tsx}"],
  languageOptions: {
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    globals: { ...globals.browser },
  },
  plugins: {
    react,
    "react-hooks": reactHooks,
    "react-refresh": reactRefresh,
    "import-x": importX,
  },
  settings: {
    react: { version: "detect" },
    "import-x/resolver": { typescript: true },
  },
  rules: {
    ...react.configs.flat.recommended.rules,
    ...react.configs.flat["jsx-runtime"].rules,
    ...reactHooks.configs.recommended.rules,
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

    "@typescript-eslint/ban-ts-comment": [
      "error",
      { "ts-ignore": true, "ts-nocheck": true, "ts-expect-error": "allow-with-description" },
    ],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/no-unnecessary-type-assertion": "error",

    "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],

    "import-x/order": [
      "warn",
      {
        groups: ["builtin", "external", "internal", ["parent", "sibling", "index"]],
        "newlines-between": "never",
        alphabetize: { order: "asc", caseInsensitive: true },
      },
    ],
  },
};

const shadcnVendorFastRefreshExemption = {
  files: ["src/components/ui/**"],
  rules: { "react-refresh/only-export-components": "off" },
};

const testsHoistedViMockImportOrderExemption = {
  files: ["**/*.test.{ts,tsx}"],
  rules: { "import-x/order": "off" },
};

const plainScriptsWithoutTypeChecking = {
  files: ["**/*.js", "**/*.mjs", "vite.config.ts"],
  ...tseslint.configs.disableTypeChecked,
};

const nodeScriptGlobals = {
  files: ["scripts/**/*.mjs"],
  languageOptions: { globals: { ...globals.node } },
};

export default tseslint.config(
  buildArtifactAndConfigIgnores,

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  srcTypeAwareRules,
  shadcnVendorFastRefreshExemption,
  testsHoistedViMockImportOrderExemption,
  plainScriptsWithoutTypeChecking,
  nodeScriptGlobals,

  prettier,
);
