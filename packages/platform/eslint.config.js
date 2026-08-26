import {
  buildArtifactAndConfigIgnores,
  prettierLast,
  strictTypeAwareCore,
  testsHoistedViMockImportOrderExemption,
  tsSrcConfig,
} from "@harpyhare/eslint-config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  buildArtifactAndConfigIgnores(),
  ...strictTypeAwareCore,
  tsSrcConfig({ tsconfigRootDir: import.meta.dirname }),
  testsHoistedViMockImportOrderExemption,
  prettierLast,
);
