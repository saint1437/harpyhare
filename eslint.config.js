import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import importX from "eslint-plugin-import-x";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  // Линтим только src/**; конфиги и эмит-артефакты tsc -b (*.config.{js,ts,d.ts}) — мимо.
  { ignores: ["dist", "src-tauri", "*.config.js", "*.config.ts", "*.config.d.ts"] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
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

      // Запрет обхода правил TS:
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-nocheck": true, "ts-expect-error": "allow-with-description" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",

      // Числа в шаблонных строках допустимы (правило ловит `${object}`, не числа):
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // Намеренно-неиспользуемые имена с префиксом `_`:
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // Порядок импортов (авто-фиксится):
      "import-x/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"]],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },

  // shadcn-генерат (вендор): компонент + варианты в одном файле — Fast Refresh-ворнинг не релевантен.
  {
    files: ["src/components/ui/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },

  // Тесты: порядок импортов конфликтует с хойстингом `vi.mock` (моки идут между импортами).
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: { "import-x/order": "off" },
  },

  // Конфиг-файлы и JS — без type-aware правил:
  { files: ["**/*.js"], ...tseslint.configs.disableTypeChecked },

  prettier,
);
