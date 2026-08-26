import {
  buildArtifactAndConfigIgnores,
  nodeScriptGlobals,
  plainScriptsWithoutTypeChecking,
  prettierLast,
  strictTypeAwareCore,
  testsHoistedViMockImportOrderExemption,
} from "@harpyhare/eslint-config";
import { reactSrcConfig } from "@harpyhare/eslint-config/react";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Everything below this line is about THIS app's structure — the zones of
 * `src/` and who may import whom. The shared half (the strict TS rules, the
 * React block, `import-x` settings and the exemptions) lives in
 * `@harpyhare/eslint-config`.
 */
const srcTypeAwareRules = reactSrcConfig({
  tsconfigRootDir: import.meta.dirname,
  plugins: { "react-refresh": reactRefresh },
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

    // A cycle is how a "who may import whom" rule dies quietly: the graph stays
    // legal edge by edge while the modules become one lump. Both cycles this
    // caught were type-only (lib ↔ components, launcher ↔ onboarding), so the
    // runtime never complained and nothing failed until someone read the graph.
    // It only sees anything because the shared config sets
    // `settings["import-x/extensions"]` — see the note there.
    "import-x/no-cycle": ["error", { ignoreExternal: true }],
  },
});

/**
 * The layering is declared here, not just described in CLAUDE.md.
 *
 * `src/lib` is the bottom: framework-free pure logic with unit tests. It may
 * name the shapes that cross the IPC boundary (`@/ipc/types` is types plus the
 * constants generated from Rust) but nothing that talks to Tauri, and nothing
 * above it. `lib/listening` and `lib/orb` reached up for `CaptureTone` and
 * `OrbState` until the types moved down where they belong.
 */
const libIsTheBottomLayer = {
  files: ["src/lib/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "@/components",
              "@/components/**",
              "@/features/**",
              "@/hooks/**",
              "../components/**",
              "../features/**",
              "../hooks/**",
            ],
            message:
              "src/lib is the bottom layer — it imports nothing from components, features or hooks. Move the shared type down into lib instead.",
          },
          {
            group: ["@/ipc/**", "../ipc/**", "!@/ipc/types", "!../ipc/types"],
            message:
              "src/lib reaches ipc only through @/ipc/types — the rest of src/ipc talks to Tauri.",
          },
        ],
      },
    ],
  },
};

/** `src/components` is the cross-window common zone: it cannot know about features. */
const componentsAreFeatureAgnostic = {
  files: ["src/components/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/features/**", "../features/**"],
            message:
              "A component in the common zone must not import a feature. Either it belongs to that feature (move it there) or the feature should pass what it needs as a prop.",
          },
        ],
      },
    ],
  },
};

/**
 * Features do not import each other. The one shared zone is `features/settings`
 * — the settings form itself, rendered both by the launcher's screen and by the
 * onboarding flow; before it existed those two imported each other in a circle.
 */
const FEATURES = ["hud", "launcher", "onboarding", "settings"];
const SHARED_FEATURE = "settings";

const featureIsolation = FEATURES.map((zone) => ({
  files: [`src/features/${zone}/**`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: FEATURES.filter(
              (other) => other !== zone && (zone === SHARED_FEATURE || other !== SHARED_FEATURE),
            ).flatMap((other) => [
              `@/features/${other}`,
              `@/features/${other}/**`,
              `../${other}/**`,
              `../../${other}/**`,
            ]),
            message: `features/${zone} must not import another feature — put what both need in features/${SHARED_FEATURE}.`,
          },
        ],
      },
    ],
  },
}));

/**
 * A window's composition root is the one place allowed to wire features
 * together: it is what a root IS. `LauncherApp` owns the settings store and
 * therefore the one fact that decides between onboarding and the panel.
 */
const windowCompositionRoots = {
  files: ["src/features/launcher/LauncherApp.tsx"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/features/hud", "@/features/hud/**"],
            message: "The launcher window never renders HUD components.",
          },
        ],
      },
    ],
  },
};

const shadcnVendorFastRefreshExemption = {
  files: ["src/components/ui/**"],
  rules: { "react-refresh/only-export-components": "off" },
};

export default tseslint.config(
  buildArtifactAndConfigIgnores(["dist", "src-tauri", "src/ipc/bindings.ts"], ["!vite.config.ts"]),

  ...strictTypeAwareCore,

  srcTypeAwareRules,
  libIsTheBottomLayer,
  componentsAreFeatureAgnostic,
  ...featureIsolation,
  windowCompositionRoots,
  shadcnVendorFastRefreshExemption,
  testsHoistedViMockImportOrderExemption,
  plainScriptsWithoutTypeChecking(["vite.config.ts"]),
  nodeScriptGlobals,

  prettierLast,
);
