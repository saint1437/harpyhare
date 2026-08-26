import {
  buildArtifactAndConfigIgnores,
  nodeScriptGlobals,
  plainScriptsWithoutTypeChecking,
  prettierLast,
  strictTypeAwareCore,
  testsHoistedViMockImportOrderExemption,
} from "@harpyhare/eslint-config";
import { nextSrcConfig } from "@harpyhare/eslint-config/next";
import tseslint from "typescript-eslint";

const srcTypeAwareRules = nextSrcConfig({
  tsconfigRootDir: import.meta.dirname,
  rules: { "@next/next/no-img-element": "off" },
});

export default tseslint.config(
  buildArtifactAndConfigIgnores([".next", "next-env.d.ts"]),

  ...strictTypeAwareCore,

  srcTypeAwareRules,
  testsHoistedViMockImportOrderExemption,
  plainScriptsWithoutTypeChecking(),
  nodeScriptGlobals,

  prettierLast,
);
