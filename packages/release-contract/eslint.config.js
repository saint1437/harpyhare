import {
  buildArtifactAndConfigIgnores,
  nodeScriptGlobals,
  plainScriptsWithoutTypeChecking,
  prettierLast,
  strictTypeAwareCore,
  testsHoistedViMockImportOrderExemption,
  tsSrcConfig,
} from "@harpyhare/eslint-config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  buildArtifactAndConfigIgnores(),
  ...strictTypeAwareCore,
  tsSrcConfig({ tsconfigRootDir: import.meta.dirname, files: ["*.ts"] }),
  testsHoistedViMockImportOrderExemption,
  plainScriptsWithoutTypeChecking(),
  nodeScriptGlobals,
  prettierLast,
);
