import {
  buildArtifactAndConfigIgnores,
  nodeGlobals,
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
  // The package's source IS plain node JS reading a file off disk, so the node
  // globals have to reach `*.js` and not only a `scripts/` folder.
  nodeGlobals(["*.js"]),
  prettierLast,
);
