import next from "@next/eslint-plugin-next";
import { reactSrcConfig } from "./react.js";

/** `reactSrcConfig` plus the Next.js plugin and its two rule sets. */
export function nextSrcConfig({ tsconfigRootDir, files, plugins = {}, rules = {} }) {
  return reactSrcConfig({
    tsconfigRootDir,
    files,
    plugins: { "@next/next": next, ...plugins },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
      ...rules,
    },
  });
}
