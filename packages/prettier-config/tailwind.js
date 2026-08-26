import base from "./index.js";

/**
 * For a project with Tailwind. `tailwindStylesheet` stays with the project —
 * Tailwind v4 is configured CSS-first, so the sorter needs that project's own
 * entry stylesheet and the path is relative to the project's config file.
 *
 * @type {import("prettier").Config}
 */
const config = {
  ...base,
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindFunctions: ["cn", "cva"],
};

export default config;
