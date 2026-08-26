import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * The strict, type-aware core both apps sit on. Spread it before any
 * project-specific block so a project can only ever narrow it, never widen it.
 */
export const strictTypeAwareCore = [
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
];

/**
 * Config files are not part of a project's source, and neither are build
 * artifacts. `projectIgnores` are the project's own outputs (`dist`, `.next`,
 * a generated file); `unignore` comes last because in a flat-config `ignores`
 * array order decides, and a negation only lifts what was ignored before it.
 */
export function buildArtifactAndConfigIgnores(projectIgnores = [], unignore = []) {
  return {
    ignores: [...projectIgnores, "*.config.js", "*.config.ts", "*.config.d.ts", ...unignore],
  };
}

/**
 * Without `import-x/extensions` import-x refuses to open a dependency whose
 * extension is not in the default JS list, so `no-cycle` walks an EMPTY graph
 * and reports nothing at all — a green rule that checks nothing (verified: a
 * two-module cycle went unreported until `.ts`/`.tsx` were listed here). It
 * lives in the shared settings so a project cannot inherit the rule without it.
 */
export const sharedSettings = {
  react: { version: "detect" },
  "import-x/resolver": { typescript: true },
  "import-x/extensions": [".js", ".jsx", ".ts", ".tsx"],
};

/** The TypeScript rules that were typed out identically in both apps. */
export const sharedTypeScriptRules = {
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
};

/**
 * The type-aware block for a framework-free TypeScript package: the same rules
 * the apps get, without React. Kept here rather than in each package so a
 * shared library is linted by the same contract as the code that imports it.
 */
export function tsSrcConfig({ tsconfigRootDir, files = ["src/**/*.ts"] }) {
  return {
    files,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir },
    },
    plugins: { "import-x": importX },
    settings: sharedSettings,
    rules: { ...sharedTypeScriptRules },
  };
}

/** `vi.mock` is hoisted above the imports, so import order cannot be checked here. */
export const testsHoistedViMockImportOrderExemption = {
  files: ["**/*.test.{ts,tsx}"],
  rules: { "import-x/order": "off" },
};

/** Plain scripts are outside every tsconfig, so the type-aware rules cannot run on them. */
export function plainScriptsWithoutTypeChecking(extraFiles = []) {
  return {
    files: ["**/*.js", "**/*.mjs", ...extraFiles],
    ...tseslint.configs.disableTypeChecked,
  };
}

/**
 * Node globals for files that run under node rather than in a bundle: without
 * them `process`/`console`/`URL` read as undefined globals. Takes the file
 * patterns because a package whose SOURCE is plain node JS (`@harpyhare/checks`)
 * needs them on `*.js`, not on a `scripts/` folder it does not have.
 */
export function nodeGlobals(files) {
  return { files, languageOptions: { globals: { ...globals.node } } };
}

/** The common case: a project's `scripts/` folder. */
export const nodeScriptGlobals = nodeGlobals(["scripts/**/*.mjs"]);

/** Must stay LAST in a project's config — it switches formatting rules off. */
export const prettierLast = prettier;
